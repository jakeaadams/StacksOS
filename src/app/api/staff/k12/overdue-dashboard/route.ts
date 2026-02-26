import { NextRequest } from "next/server";
import { errorResponse, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { query } from "@/lib/db/evergreen";

export interface OverdueItem {
  checkoutId: number;
  studentId: number;
  studentName: string;
  copyBarcode: string;
  title: string | null;
  checkoutTs: string;
  dueTs: string;
  daysOverdue: number;
}

export interface OverdueGroup {
  studentId: number;
  studentName: string;
  items: OverdueItem[];
  totalOverdue: number;
}

type OverdueRow = {
  checkout_id: number;
  student_id: number;
  student_name: string;
  copy_barcode: string;
  title: string | null;
  checkout_ts: string;
  due_ts: string;
  days_overdue: number;
};

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const { searchParams } = new URL(req.url);
    const classIdRaw = searchParams.get("classId");

    if (!classIdRaw) {
      return errorResponse("classId query parameter is required", 400);
    }

    const classId = Number.parseInt(classIdRaw, 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return errorResponse("classId must be a positive integer", 400);
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
    const groupMap = new Map<number, OverdueGroup>();
    for (const row of rows) {
      const item: OverdueItem = {
        checkoutId: row.checkout_id,
        studentId: row.student_id,
        studentName: row.student_name,
        copyBarcode: row.copy_barcode,
        title: row.title,
        checkoutTs: row.checkout_ts,
        dueTs: row.due_ts,
        daysOverdue: Number(row.days_overdue),
      };

      const existing = groupMap.get(row.student_id);
      if (existing) {
        existing.items.push(item);
        existing.totalOverdue = existing.items.length;
      } else {
        groupMap.set(row.student_id, {
          studentId: row.student_id,
          studentName: row.student_name,
          items: [item],
          totalOverdue: 1,
        });
      }
    }

    const groups = Array.from(groupMap.values());
    const totalOverdueItems = rows.length;

    return successResponse({ groups, totalOverdueItems });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/overdue-dashboard", req);
  }
}
