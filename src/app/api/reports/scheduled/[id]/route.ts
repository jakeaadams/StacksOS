import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  successResponse,
  serverErrorResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import {
  deleteScheduledReportSchedule,
  getScheduledReportSchedule,
  updateScheduledReportSchedule,
} from "@/lib/db/scheduled-reports";

const UpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    reportKey: z.enum(["dashboard_kpis", "holds_summary", "overdue_items"] as const).optional(),
    orgId: z.number().int().positive().nullable().optional(),
    cadence: z.enum(["daily", "weekly", "monthly"] as const).optional(),
    timeOfDay: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    format: z.enum(["csv", "json"] as const).optional(),
    recipients: z.array(z.string().email()).min(1).max(25).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

function parseId(raw: string | undefined): number | null {
  const id = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeRecipients(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const v = String(raw || "").trim().toLowerCase();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermissions(["RUN_REPORTS"]);
    const { id: idRaw } = await ctx.params;
    const id = parseId(idRaw);
    if (!id) return errorResponse("Invalid schedule id", 400);

    const schedule = await getScheduledReportSchedule(id);
    if (!schedule) return errorResponse("Schedule not found", 404);

    return successResponse({ schedule });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled reports schedule GET", req);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["RUN_REPORTS"]);
    const { id: idRaw } = await ctx.params;
    const id = parseId(idRaw);
    if (!id) return errorResponse("Invalid schedule id", 400);

    const body = await parseJsonBodyWithSchema(req, UpdateSchema);
    if (body instanceof Response) return body;

    const existing = await getScheduledReportSchedule(id);
    if (!existing) return errorResponse("Schedule not found", 404);

    await updateScheduledReportSchedule(id, {
      name: body.name?.trim(),
      reportKey: body.reportKey,
      orgId: body.orgId,
      cadence: body.cadence,
      timeOfDay: body.timeOfDay,
      dayOfWeek: body.dayOfWeek,
      dayOfMonth: body.dayOfMonth,
      format: body.format,
      recipients: body.recipients ? normalizeRecipients(body.recipients) : undefined,
      enabled: body.enabled,
      updatedBy: actor?.id ?? null,
    });

    await logAuditEvent({
      action: "scheduled_report.schedule.update",
      entity: "scheduled_report_schedule",
      entityId: id,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { before: { name: existing.name, enabled: existing.enabled }, after: { name: body.name, enabled: body.enabled } },
    });

    return successResponse({ updated: true });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled reports schedule PUT", req);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["RUN_REPORTS"]);
    const { id: idRaw } = await ctx.params;
    const id = parseId(idRaw);
    if (!id) return errorResponse("Invalid schedule id", 400);

    const existing = await getScheduledReportSchedule(id);
    if (!existing) return errorResponse("Schedule not found", 404);

    await deleteScheduledReportSchedule(id);

    await logAuditEvent({
      action: "scheduled_report.schedule.delete",
      entity: "scheduled_report_schedule",
      entityId: id,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { name: existing.name, reportKey: existing.report_key },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled reports schedule DELETE", req);
  }
}

