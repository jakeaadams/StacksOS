import { NextRequest, NextResponse } from "next/server";
import { errorResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import {
  getClassReadingStats,
  listK12Students,
  listK12ActiveCheckouts,
} from "@/lib/db/k12-class-circulation";

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

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
    csvLines.push(
      `Stats,Most Active Reader,"${(stats.mostActiveReader || "N/A").replace(/"/g, '""')}"`
    );
    csvLines.push("");

    // Students section
    csvLines.push("Student ID,First Name,Last Name,Identifier");
    for (const s of exportData.students) {
      csvLines.push(
        `${s.id},"${s.firstName.replace(/"/g, '""')}","${s.lastName.replace(/"/g, '""')}","${(s.studentIdentifier || "").replace(/"/g, '""')}"`
      );
    }
    csvLines.push("");

    // Checkouts section
    csvLines.push("Checkout ID,Student Name,Copy Barcode,Title,Checkout Date,Due Date");
    for (const c of exportData.activeCheckouts) {
      csvLines.push(
        `${c.id},"${(c.studentName || "Class").replace(/"/g, '""')}","${c.copyBarcode.replace(/"/g, '""')}","${(c.title || "").replace(/"/g, '""')}",${c.checkoutTs},${c.dueTs || ""}`
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
