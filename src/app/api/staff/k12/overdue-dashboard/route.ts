import { NextRequest } from "next/server";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { query } from "@/lib/db/evergreen";
import { getK12ClassById } from "@/lib/db/k12-class-circulation";
import {
  groupOverdueByStudent,
  type OverdueItem,
  type OverdueGroup,
  type OverdueRow,
} from "@/lib/k12/export-helpers";

export type { OverdueItem, OverdueGroup };

export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 60,
    windowMs: 5 * 60 * 1000,
    endpoint: "k12-overdue-dashboard-get",
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

    const rows = await query<OverdueRow>(
      `
        SELECT
          co.id AS checkout_id,
          co.student_id,
          concat_ws(' ', s.first_name, s.last_name) AS student_name,
          co.copy_barcode,
          co.title,
          co.checkout_ts,
          co.due_ts,
          GREATEST(0, EXTRACT(DAY FROM NOW() - co.due_ts))::int AS days_overdue
        FROM library.k12_class_checkouts co
        JOIN library.k12_students s ON s.id = co.student_id
        WHERE co.class_id = $1
          AND co.returned_ts IS NULL
          AND co.due_ts IS NOT NULL
          AND co.due_ts < NOW()
        ORDER BY s.last_name ASC, s.first_name ASC, co.due_ts ASC
      `,
      [classId]
    );

    // Group by student
    const groups = groupOverdueByStudent(rows);
    const totalOverdueItems = rows.length;

    return successResponse({ groups, totalOverdueItems });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/overdue-dashboard", req);
  }
}
