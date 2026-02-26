import { NextRequest } from "next/server";
import { errorResponse, getRequestMeta, successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { getScheduledReportSchedule } from "@/lib/db/scheduled-reports";
import { runScheduledReportOnce } from "@/lib/reports/scheduled-runner";
import { z as _z } from "zod";

function parseId(raw: string | undefined): number | null {
  const id = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["RUN_REPORTS"]);
    const { id: idRaw } = await ctx.params;
    const scheduleId = parseId(idRaw);
    if (!scheduleId) return errorResponse("Invalid schedule id", 400);

    const schedule = await getScheduledReportSchedule(scheduleId);
    if (!schedule) return errorResponse("Schedule not found", 404);

    const result = await runScheduledReportOnce({
      schedule,
      requestedBy: actor ? { id: actor.id, username: actor.username || actor.usrname } : null,
      requestId,
    });

    await logAuditEvent({
      action: "scheduled_report.run.manual",
      entity: "scheduled_report_run",
      entityId: result.runId,
      status: result.status === "success" ? "success" : "failure",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        reportKey: schedule.report_key,
      },
      error: result.status === "success" ? null : "run_failed",
    });

    return successResponse({ runId: result.runId, status: result.status });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled report run now POST", req);
  }
}
