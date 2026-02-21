import { NextRequest } from "next/server";
import { z } from "zod";
import { getRequestMeta, parseJsonBodyWithSchema, successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import {
  createScheduledReportSchedule,
  listScheduledReportSchedules,
} from "@/lib/db/scheduled-reports";

const CreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    reportKey: z.enum(["dashboard_kpis", "holds_summary", "overdue_items"] as const),
    orgId: z.number().int().positive().nullable().optional(),
    cadence: z.enum(["daily", "weekly", "monthly"] as const),
    timeOfDay: z.string().regex(/^\d{1,2}:\d{2}$/),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    format: z.enum(["csv", "json"] as const).optional(),
    recipients: z.array(z.string().email()).min(1).max(25),
    enabled: z.boolean().optional(),
  })
  .strict();

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

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["RUN_REPORTS"]);
    const schedules = await listScheduledReportSchedules();
    return successResponse({ schedules });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled reports schedules GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["RUN_REPORTS"]);
    const body = await parseJsonBodyWithSchema(req, CreateSchema);
    if (body instanceof Response) return body;

    const created = await createScheduledReportSchedule({
      name: body.name.trim(),
      reportKey: body.reportKey,
      orgId: body.orgId ?? null,
      cadence: body.cadence,
      timeOfDay: body.timeOfDay,
      dayOfWeek: body.dayOfWeek ?? null,
      dayOfMonth: body.dayOfMonth ?? null,
      format: body.format ?? "csv",
      recipients: normalizeRecipients(body.recipients),
      enabled: body.enabled !== false,
      createdBy: actor?.id ?? null,
    });

    await logAuditEvent({
      action: "scheduled_report.schedule.create",
      entity: "scheduled_report_schedule",
      entityId: created.id,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { name: body.name, reportKey: body.reportKey },
    });

    return successResponse({ created: true, id: created.id });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled reports schedules POST", req);
  }
}
