import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { createK12Student, getK12ClassById } from "@/lib/db/k12-class-circulation";
import { logger } from "@/lib/logger";

const rosterRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  student_id: z.string().trim().max(100).optional(),
  grade: z.string().trim().max(50).optional(),
  patron_barcode: z.string().trim().max(100).optional(),
});

const importBodySchema = z.object({
  classId: z.number().int().positive(),
  rows: z.array(rosterRowSchema).min(1, "At least one row is required").max(500),
  headers: z.array(z.string().max(200)).max(50).optional(),
});

// ---------------------------------------------------------------------------
// SIS format detection
// ---------------------------------------------------------------------------

type SISFormat = "powerschool" | "clever" | "generic";

const POWERSCHOOL_HEADERS = [
  "student_number",
  "last_name",
  "first_name",
  "grade_level",
  "schoolid",
];

const CLEVER_HEADERS = ["sis_id", "student_first_name", "student_last_name", "school_id", "grade"];

function detectSISFormat(headers: string[]): SISFormat {
  const normalized = headers.map((h) => h.trim().toLowerCase());

  const powerschoolMatches = POWERSCHOOL_HEADERS.filter((h) => normalized.includes(h));
  if (powerschoolMatches.length >= 3) return "powerschool";

  const cleverMatches = CLEVER_HEADERS.filter((h) => normalized.includes(h));
  if (cleverMatches.length >= 3) return "clever";

  return "generic";
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: "" };
  }
  const lastName = parts.pop()!;
  const firstName = parts.join(" ");
  return { firstName, lastName };
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
    endpoint: "k12-roster-import-post",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;
    const actorId =
      actorRecord && typeof actorRecord.id === "number" ? Math.trunc(actorRecord.id) : null;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const parsed = importBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, {
        issues: parsed.error.issues,
      });
    }

    const { classId, rows, headers } = parsed.data;

    // IDOR check: verify class exists and belongs to the actor's org
    const classInfo = await getK12ClassById(classId);
    if (!classInfo) {
      return errorResponse("Class not found", 404);
    }
    const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
    if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
      return errorResponse("Forbidden: class does not belong to your organization", 403);
    }
    const detectedFormat = headers ? detectSISFormat(headers) : "generic";
    const errors: Array<{ row: number; error: string }> = [];
    let createdCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        const { firstName, lastName } = parseName(row.name);
        if (!firstName && !lastName) {
          errors.push({ row: i + 1, error: "Name is empty" });
          continue;
        }

        await createK12Student({
          classId,
          firstName: firstName || "(none)",
          lastName: lastName || "(none)",
          studentIdentifier: row.student_id || null,
          actorId,
        });

        createdCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ row: i + 1, error: message });
      }
    }

    logger.info(
      {
        component: "k12-roster-import",
        classId,
        total: rows.length,
        created: createdCount,
        errors: errors.length,
        detectedFormat,
      },
      "Roster import completed"
    );

    await logAuditEvent({
      action: "k12.roster.import",
      entity: "k12_class",
      entityId: classId,
      status: "success",
      actor: actorRecord as import("@/lib/audit").AuditActor | null,
      ip,
      userAgent,
      requestId,
      details: {
        classId,
        total: rows.length,
        imported: createdCount,
        errorCount: errors.length,
        detectedFormat,
      },
    });

    return successResponse({
      imported: createdCount,
      total: rows.length,
      errors,
      detectedFormat,
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/staff/k12/roster-import", req);
  }
}
