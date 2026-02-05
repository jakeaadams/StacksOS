import { NextRequest } from "next/server";
import { errorResponse, successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { getScheduledReportSchedule, listScheduledReportRuns } from "@/lib/db/scheduled-reports";

function parseId(raw: string | undefined): number | null {
  const id = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermissions(["RUN_REPORTS"]);
    const { id: idRaw } = await ctx.params;
    const scheduleId = parseId(idRaw);
    if (!scheduleId) return errorResponse("Invalid schedule id", 400);

    const schedule = await getScheduledReportSchedule(scheduleId);
    if (!schedule) return errorResponse("Schedule not found", 404);

    const runs = await listScheduledReportRuns(scheduleId, 50);
    return successResponse({ runs });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled reports runs GET", req);
  }
}

