import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { createK12Student } from "@/lib/db/k12-class-circulation";
import { logger } from "@/lib/logger";

const rosterRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  student_id: z.string().trim().optional(),
  grade: z.string().trim().optional(),
  patron_barcode: z.string().trim().optional(),
});

const importBodySchema = z.object({
  classId: z.number().int().positive(),
  rows: z.array(rosterRowSchema).min(1, "At least one row is required").max(500),
});

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

    const { classId, rows } = parsed.data;
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
      },
      "Roster import completed"
    );

    return successResponse({
      imported: createdCount,
      total: rows.length,
      errors,
    });
  } catch (error) {
    return serverErrorResponse(error, "POST /api/staff/k12/roster-import", req);
  }
}
