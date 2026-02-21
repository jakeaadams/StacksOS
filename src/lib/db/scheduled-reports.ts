import { withTransaction, query, querySingle } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";
import { addDays, addMonths, addWeeks, endOfMonth, set } from "date-fns";
import type { ScheduledReportKey } from "@/lib/reports/scheduled-report-definitions";
import { assertLibrarySchemaExists } from "@/lib/db/library-schema";

export type ScheduledReportFormat = "csv" | "json";
export type ScheduledReportCadence = "daily" | "weekly" | "monthly";

export interface ScheduledReportScheduleRow {
  id: number;
  name: string;
  report_key: ScheduledReportKey;
  org_id: number | null;
  cadence: ScheduledReportCadence;
  time_of_day: string;
  day_of_week: number | null;
  day_of_month: number | null;
  format: ScheduledReportFormat;
  recipients: string[];
  enabled: boolean;
  next_run_at: Date | null;
  last_run_at: Date | null;
  created_at: Date;
  created_by: number | null;
  updated_at: Date;
  updated_by: number | null;
}

export interface ScheduledReportScheduleWithLastRun extends ScheduledReportScheduleRow {
  last_run_id: number | null;
  last_run_status: string | null;
  last_run_finished_at: Date | null;
}

export interface ScheduledReportRunRow {
  id: number;
  schedule_id: number;
  status: "queued" | "running" | "success" | "failure";
  started_at: Date | null;
  finished_at: Date | null;
  error: string | null;
  output_filename: string | null;
  output_content_type: string | null;
  output_encoding: string | null;
  output_size_bytes: number | null;
  delivered_to: string[] | null;
  created_at: Date;
}

let tablesReady = false;

export async function ensureScheduledReportsTables() {
  if (tablesReady) return;

  await withTransaction(async (client) => {
    await assertLibrarySchemaExists(client);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.scheduled_report_schedules (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        report_key TEXT NOT NULL,
        org_id INTEGER,
        cadence TEXT NOT NULL,
        time_of_day TEXT NOT NULL DEFAULT '08:00',
        day_of_week INTEGER,
        day_of_month INTEGER,
        format TEXT NOT NULL DEFAULT 'csv',
        recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
        enabled BOOLEAN NOT NULL DEFAULT true,
        next_run_at TIMESTAMP,
        last_run_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_by INTEGER
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_report_schedules_due
      ON library.scheduled_report_schedules(enabled, next_run_at, id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.scheduled_report_runs (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES library.scheduled_report_schedules(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'queued',
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        error TEXT,
        output_filename TEXT,
        output_content_type TEXT,
        output_bytes BYTEA,
        output_encoding TEXT,
        output_size_bytes INTEGER,
        download_token_hash TEXT,
        download_expires_at TIMESTAMP,
        delivered_to JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_report_runs_schedule
      ON library.scheduled_report_runs(schedule_id, id DESC)
    `);
  });

  tablesReady = true;
  logger.info({ component: "scheduled_reports" }, "Scheduled reports tables ready");
}

function parseTimeOfDay(raw: string): { hours: number; minutes: number } {
  const value = String(raw || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return { hours: 8, minutes: 0 };
  const hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return { hours: 8, minutes: 0 };
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return { hours: 8, minutes: 0 };
  return { hours, minutes };
}

export function computeNextRunAt(
  cadence: ScheduledReportCadence,
  timeOfDay: string,
  opts: { dayOfWeek?: number | null; dayOfMonth?: number | null },
  from: Date = new Date()
): Date {
  const { hours, minutes } = parseTimeOfDay(timeOfDay);
  const base = set(from, { hours, minutes, seconds: 0, milliseconds: 0 });

  if (cadence === "daily") {
    return base.getTime() > from.getTime() ? base : addDays(base, 1);
  }

  if (cadence === "weekly") {
    const wanted = typeof opts.dayOfWeek === "number" ? opts.dayOfWeek : 1;
    const current = base.getDay();
    const delta = (wanted - current + 7) % 7;
    const candidate = addDays(base, delta);
    return candidate.getTime() > from.getTime() ? candidate : addWeeks(candidate, 1);
  }

  const wantedDomRaw = typeof opts.dayOfMonth === "number" ? opts.dayOfMonth : 1;
  const wantedDom = Math.min(31, Math.max(1, wantedDomRaw));

  // Monthly: choose the requested day-of-month, clamped to the last day of the month.
  const monthStart = set(from, { date: 1, hours, minutes, seconds: 0, milliseconds: 0 });
  const lastDay = endOfMonth(monthStart).getDate();
  const day = Math.min(wantedDom, lastDay);
  const candidate = set(monthStart, { date: day });
  if (candidate.getTime() > from.getTime()) return candidate;
  const nextMonth = addMonths(monthStart, 1);
  const nextLastDay = endOfMonth(nextMonth).getDate();
  return set(nextMonth, { date: Math.min(wantedDom, nextLastDay) });
}

export async function listScheduledReportSchedules(): Promise<ScheduledReportScheduleWithLastRun[]> {
  await ensureScheduledReportsTables();

  const rows = await query<any>(
    `
      select
        s.*,
        r.id as last_run_id,
        r.status as last_run_status,
        r.finished_at as last_run_finished_at
      from library.scheduled_report_schedules s
      left join lateral (
        select id, status, finished_at
        from library.scheduled_report_runs
        where schedule_id = s.id
        order by id desc
        limit 1
      ) r on true
      order by s.id desc
    `
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    report_key: r.report_key,
    org_id: r.org_id,
    cadence: r.cadence,
    time_of_day: r.time_of_day,
    day_of_week: r.day_of_week,
    day_of_month: r.day_of_month,
    format: r.format,
    recipients: Array.isArray(r.recipients) ? r.recipients : [],
    enabled: Boolean(r.enabled),
    next_run_at: r.next_run_at ? new Date(r.next_run_at) : null,
    last_run_at: r.last_run_at ? new Date(r.last_run_at) : null,
    created_at: new Date(r.created_at),
    created_by: r.created_by ?? null,
    updated_at: new Date(r.updated_at),
    updated_by: r.updated_by ?? null,
    last_run_id: r.last_run_id ?? null,
    last_run_status: r.last_run_status ?? null,
    last_run_finished_at: r.last_run_finished_at ? new Date(r.last_run_finished_at) : null,
  }));
}

export async function getScheduledReportSchedule(id: number): Promise<ScheduledReportScheduleRow | null> {
  await ensureScheduledReportsTables();
  const row = await querySingle<any>(`select * from library.scheduled_report_schedules where id = $1`, [id]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    report_key: row.report_key,
    org_id: row.org_id,
    cadence: row.cadence,
    time_of_day: row.time_of_day,
    day_of_week: row.day_of_week,
    day_of_month: row.day_of_month,
    format: row.format,
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
    enabled: Boolean(row.enabled),
    next_run_at: row.next_run_at ? new Date(row.next_run_at) : null,
    last_run_at: row.last_run_at ? new Date(row.last_run_at) : null,
    created_at: new Date(row.created_at),
    created_by: row.created_by ?? null,
    updated_at: new Date(row.updated_at),
    updated_by: row.updated_by ?? null,
  };
}

export async function createScheduledReportSchedule(args: {
  name: string;
  reportKey: ScheduledReportKey;
  orgId?: number | null;
  cadence: ScheduledReportCadence;
  timeOfDay: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  format?: ScheduledReportFormat;
  recipients: string[];
  enabled?: boolean;
  createdBy?: number | null;
}): Promise<{ id: number }> {
  await ensureScheduledReportsTables();

  const now = new Date();
  const nextRunAt = args.enabled === false ? null : computeNextRunAt(args.cadence, args.timeOfDay, { dayOfWeek: args.dayOfWeek, dayOfMonth: args.dayOfMonth }, now);

  const row = await querySingle<{ id: number }>(
    `
      insert into library.scheduled_report_schedules
        (name, report_key, org_id, cadence, time_of_day, day_of_week, day_of_month, format, recipients, enabled, next_run_at, created_by, updated_by)
      values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$12)
      returning id
    `,
    [
      args.name,
      args.reportKey,
      args.orgId ?? null,
      args.cadence,
      args.timeOfDay,
      args.dayOfWeek ?? null,
      args.dayOfMonth ?? null,
      args.format ?? "csv",
      JSON.stringify(args.recipients),
      args.enabled !== false,
      nextRunAt ? nextRunAt.toISOString() : null,
      args.createdBy ?? null,
    ]
  );

  if (!row?.id) {
    throw new Error("Failed to create schedule");
  }
  return row;
}

export async function updateScheduledReportSchedule(
  id: number,
  args: Partial<{
    name: string;
    reportKey: ScheduledReportKey;
    orgId: number | null;
    cadence: ScheduledReportCadence;
    timeOfDay: string;
    dayOfWeek: number | null;
    dayOfMonth: number | null;
    format: ScheduledReportFormat;
    recipients: string[];
    enabled: boolean;
    updatedBy: number | null;
  }>
) {
  await ensureScheduledReportsTables();

  const current = await getScheduledReportSchedule(id);
  if (!current) throw new Error("Schedule not found");

  const cadence = args.cadence ?? current.cadence;
  const timeOfDay = args.timeOfDay ?? current.time_of_day;
  const dayOfWeek = args.dayOfWeek ?? current.day_of_week;
  const dayOfMonth = args.dayOfMonth ?? current.day_of_month;
  const enabled = args.enabled ?? current.enabled;

  const nextRunAt = enabled
    ? computeNextRunAt(cadence, timeOfDay, { dayOfWeek, dayOfMonth }, new Date())
    : null;

  await query(
    `
      update library.scheduled_report_schedules
      set
        name = $2,
        report_key = $3,
        org_id = $4,
        cadence = $5,
        time_of_day = $6,
        day_of_week = $7,
        day_of_month = $8,
        format = $9,
        recipients = $10::jsonb,
        enabled = $11,
        next_run_at = $12,
        updated_at = now(),
        updated_by = $13
      where id = $1
    `,
    [
      id,
      args.name ?? current.name,
      args.reportKey ?? current.report_key,
      args.orgId ?? current.org_id,
      cadence,
      timeOfDay,
      dayOfWeek,
      dayOfMonth,
      args.format ?? current.format,
      JSON.stringify(args.recipients ?? current.recipients),
      enabled,
      nextRunAt ? nextRunAt.toISOString() : null,
      args.updatedBy ?? null,
    ]
  );
}

export async function deleteScheduledReportSchedule(id: number) {
  await ensureScheduledReportsTables();
  await query(`delete from library.scheduled_report_schedules where id = $1`, [id]);
}

export async function listScheduledReportRuns(scheduleId: number, limit = 50): Promise<ScheduledReportRunRow[]> {
  await ensureScheduledReportsTables();
  const rows = await query<any>(
    `
      select id, schedule_id, status, started_at, finished_at, error,
             output_filename, output_content_type, output_encoding, output_size_bytes,
             delivered_to, created_at
      from library.scheduled_report_runs
      where schedule_id = $1
      order by id desc
      limit $2
    `,
    [scheduleId, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    schedule_id: r.schedule_id,
    status: r.status,
    started_at: r.started_at ? new Date(r.started_at) : null,
    finished_at: r.finished_at ? new Date(r.finished_at) : null,
    error: r.error ?? null,
    output_filename: r.output_filename ?? null,
    output_content_type: r.output_content_type ?? null,
    output_encoding: r.output_encoding ?? null,
    output_size_bytes: r.output_size_bytes ?? null,
    delivered_to: Array.isArray(r.delivered_to) ? r.delivered_to : null,
    created_at: new Date(r.created_at),
  }));
}

export async function createScheduledReportRun(args: {
  scheduleId: number;
  status: ScheduledReportRunRow["status"];
  startedAt?: Date | null;
  error?: string | null;
}): Promise<{ id: number }> {
  await ensureScheduledReportsTables();
  const row = await querySingle<{ id: number }>(
    `
      insert into library.scheduled_report_runs (schedule_id, status, started_at, error)
      values ($1, $2, $3, $4)
      returning id
    `,
    [args.scheduleId, args.status, args.startedAt ? args.startedAt.toISOString() : null, args.error ?? null]
  );
  if (!row?.id) throw new Error("Failed to create run");
  return row;
}

export async function finishScheduledReportRun(args: {
  id: number;
  status: "success" | "failure";
  finishedAt: Date;
  error?: string | null;
  outputFilename?: string | null;
  outputContentType?: string | null;
  outputBytes?: Buffer | null;
  outputEncoding?: string | null;
  outputSizeBytes?: number | null;
  downloadTokenHash?: string | null;
  downloadExpiresAt?: Date | null;
  deliveredTo?: string[] | null;
}) {
  await ensureScheduledReportsTables();

  await query(
    `
      update library.scheduled_report_runs
      set
        status = $2,
        finished_at = $3,
        error = $4,
        output_filename = $5,
        output_content_type = $6,
        output_bytes = $7,
        output_encoding = $8,
        output_size_bytes = $9,
        download_token_hash = $10,
        download_expires_at = $11,
        delivered_to = $12::jsonb
      where id = $1
    `,
    [
      args.id,
      args.status,
      args.finishedAt.toISOString(),
      args.error ?? null,
      args.outputFilename ?? null,
      args.outputContentType ?? null,
      args.outputBytes ?? null,
      args.outputEncoding ?? null,
      args.outputSizeBytes ?? null,
      args.downloadTokenHash ?? null,
      args.downloadExpiresAt ? args.downloadExpiresAt.toISOString() : null,
      args.deliveredTo ? JSON.stringify(args.deliveredTo) : null,
    ]
  );
}

export async function updateScheduleAfterRun(args: { scheduleId: number; lastRunAt: Date; nextRunAt: Date | null }) {
  await ensureScheduledReportsTables();
  await query(
    `
      update library.scheduled_report_schedules
      set last_run_at = $2, next_run_at = $3
      where id = $1
    `,
    [args.scheduleId, args.lastRunAt.toISOString(), args.nextRunAt ? args.nextRunAt.toISOString() : null]
  );
}

export async function readRunDownload(args: { runId: number }): Promise<{
  run: ScheduledReportRunRow | null;
  outputBytes: Buffer | null;
  outputFilename: string | null;
  outputContentType: string | null;
  outputEncoding: string | null;
  downloadTokenHash: string | null;
  downloadExpiresAt: Date | null;
}> {
  await ensureScheduledReportsTables();
  const row = await querySingle<any>(
    `
      select
        id, schedule_id, status, started_at, finished_at, error,
        output_filename, output_content_type, output_bytes, output_encoding, output_size_bytes,
        download_token_hash, download_expires_at, delivered_to, created_at
      from library.scheduled_report_runs
      where id = $1
    `,
    [args.runId]
  );

  if (!row) {
    return {
      run: null,
      outputBytes: null,
      outputFilename: null,
      outputContentType: null,
      outputEncoding: null,
      downloadTokenHash: null,
      downloadExpiresAt: null,
    };
  }

  return {
    run: {
      id: row.id,
      schedule_id: row.schedule_id,
      status: row.status,
      started_at: row.started_at ? new Date(row.started_at) : null,
      finished_at: row.finished_at ? new Date(row.finished_at) : null,
      error: row.error ?? null,
      output_filename: row.output_filename ?? null,
      output_content_type: row.output_content_type ?? null,
      output_encoding: row.output_encoding ?? null,
      output_size_bytes: row.output_size_bytes ?? null,
      delivered_to: Array.isArray(row.delivered_to) ? row.delivered_to : null,
      created_at: new Date(row.created_at),
    },
    outputBytes: row.output_bytes ?? null,
    outputFilename: row.output_filename ?? null,
    outputContentType: row.output_content_type ?? null,
    outputEncoding: row.output_encoding ?? null,
    downloadTokenHash: row.download_token_hash ?? null,
    downloadExpiresAt: row.download_expires_at ? new Date(row.download_expires_at) : null,
  };
}

export async function claimDueScheduledReportSchedules(limit: number): Promise<ScheduledReportScheduleRow[]> {
  await ensureScheduledReportsTables();

  const now = new Date();

  return await withTransaction(async (client) => {
    const result = await client.query(
      `
        select *
        from library.scheduled_report_schedules
        where enabled = true
          and next_run_at is not null
          and next_run_at <= now()
        order by next_run_at asc, id asc
        for update skip locked
        limit $1
      `,
      [limit]
    );

    const claimed: ScheduledReportScheduleRow[] = [];
    for (const row of result.rows) {
      const schedule: ScheduledReportScheduleRow = {
        id: row.id,
        name: row.name,
        report_key: row.report_key,
        org_id: row.org_id,
        cadence: row.cadence,
        time_of_day: row.time_of_day,
        day_of_week: row.day_of_week,
        day_of_month: row.day_of_month,
        format: row.format,
        recipients: Array.isArray(row.recipients) ? row.recipients : [],
        enabled: Boolean(row.enabled),
        next_run_at: row.next_run_at ? new Date(row.next_run_at) : null,
        last_run_at: row.last_run_at ? new Date(row.last_run_at) : null,
        created_at: new Date(row.created_at),
        created_by: row.created_by ?? null,
        updated_at: new Date(row.updated_at),
        updated_by: row.updated_by ?? null,
      };

      // Advance next_run_at immediately to avoid duplicate runners picking up the same schedule.
      // If the run fails or the process crashes, operators can "Run now" from the UI.
      const nextRunAt = computeNextRunAt(
        schedule.cadence,
        schedule.time_of_day,
        { dayOfWeek: schedule.day_of_week, dayOfMonth: schedule.day_of_month },
        now
      );

      await client.query(`update library.scheduled_report_schedules set next_run_at = $2 where id = $1`, [
        schedule.id,
        nextRunAt.toISOString(),
      ]);

      claimed.push(schedule);
    }

    return claimed;
  });
}
