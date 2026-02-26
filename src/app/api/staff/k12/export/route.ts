import { NextRequest, NextResponse } from "next/server";
import { errorResponse, getRequestMeta, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getClassReadingStats,
  listK12Students,
  listK12ActiveCheckouts,
  getK12ClassById,
} from "@/lib/db/k12-class-circulation";

/**
 * Sanitize a cell value to prevent CSV formula injection.
 * If the value starts with a formula-triggering character (=, +, -, @, \t, \r),
 * prefix it with a single quote to neutralize it.
 */
function sanitizeCsvCell(value: string): string {
  if (!value) return value;
  const firstChar = value.charAt(0);
  if (
    firstChar === "=" ||
    firstChar === "+" ||
    firstChar === "-" ||
    firstChar === "@" ||
    firstChar === "\t" ||
    firstChar === "\r"
  ) {
    return `'${value}`;
  }
  return value;
}

/**
 * Escape a value for safe CSV inclusion: double-quote wrapping with inner quote doubling,
 * plus CSV formula injection sanitization.
 */
function csvEscape(value: string | null | undefined): string {
  const str = String(value ?? "");
  const sanitized = sanitizeCsvCell(str);
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 30,
    windowMs: 5 * 60 * 1000,
    endpoint: "k12-export-get",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;

    const { searchParams } = new URL(req.url);
    const classIdRaw = searchParams.get("classId");
    const format = searchParams.get("format") || "csv";

    if (!classIdRaw) {
      return errorResponse("classId query parameter is required", 400);
    }

    const classId = Number.parseInt(classIdRaw, 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return errorResponse("classId must be a positive integer", 400);
    }

    // IDOR check: verify class exists and belongs to the actor's org
    const classInfo = await getK12ClassById(classId);
    if (!classInfo) {
      return errorResponse("Class not found", 404);
    }
    const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
    if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
      return errorResponse("Forbidden: class does not belong to your organization", 403);
    }

    const [stats, students, checkouts] = await Promise.all([
      getClassReadingStats(classId),
      listK12Students(classId),
      listK12ActiveCheckouts(classId),
    ]);

    const exportData = {
      stats,
      students: students.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        studentIdentifier: s.studentIdentifier,
      })),
      activeCheckouts: checkouts.map((c) => ({
        id: c.id,
        studentName: c.studentName,
        copyBarcode: c.copyBarcode,
        title: c.title,
        checkoutTs: c.checkoutTs,
        dueTs: c.dueTs,
      })),
    };

    if (format === "json") {
      return NextResponse.json({
        ok: true,
        ...exportData,
      });
    }

    // CSV format
    const csvLines: string[] = [];

    // Stats section
    csvLines.push("Section,Metric,Value");
    csvLines.push(`Stats,Total Checkouts,${stats.totalCheckouts}`);
    csvLines.push(`Stats,Books Per Student,${stats.booksPerStudent}`);
    csvLines.push(`Stats,Avg Checkout Duration (days),${stats.avgCheckoutDurationDays}`);
    csvLines.push(`Stats,Overdue Count,${stats.overdueCount}`);
    csvLines.push(`Stats,Most Active Reader,${csvEscape(stats.mostActiveReader || "N/A")}`);
    csvLines.push("");

    // Students section
    csvLines.push("Student ID,First Name,Last Name,Identifier");
    for (const s of exportData.students) {
      csvLines.push(
        `${s.id},${csvEscape(s.firstName)},${csvEscape(s.lastName)},${csvEscape(s.studentIdentifier || "")}`
      );
    }
    csvLines.push("");

    // Checkouts section
    csvLines.push("Checkout ID,Student Name,Copy Barcode,Title,Checkout Date,Due Date");
    for (const c of exportData.activeCheckouts) {
      csvLines.push(
        `${c.id},${csvEscape(c.studentName || "Class")},${csvEscape(c.copyBarcode)},${csvEscape(c.title || "")},${csvEscape(c.checkoutTs)},${csvEscape(c.dueTs || "")}`
      );
    }

    const csvContent = csvLines.join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="class-${classId}-export.csv"`,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/export", req);
  }
}
