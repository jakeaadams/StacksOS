import { query } from "@/lib/db/evergreen";
import type { ScheduledReportKey } from "@/lib/reports/scheduled-report-definitions";

export { SCHEDULED_REPORT_DEFINITIONS } from "@/lib/reports/scheduled-report-definitions";
export type {
  ReportDefinition,
  ScheduledReportKey,
} from "@/lib/reports/scheduled-report-definitions";

function escapeCsv(value: unknown): string {
  const str = String(value ?? "");
  if (/[\n\r,"]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows: Array<Record<string, any>>, columns: string[]): string {
  const header = columns.map(escapeCsv).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsv(row[c])).join(","));
  return [header, ...lines].join("\n");
}

function sanitizeFilename(value: string): string {
  const s = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return s || "report";
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

export type GeneratedReport = {
  filename: string;
  contentType: string;
  bytes: Buffer;
  rowCount: number;
  summary: string;
};

export async function generateScheduledReport(args: {
  reportKey: ScheduledReportKey;
  orgId: number;
  limit?: number;
}): Promise<GeneratedReport> {
  const date = todayIso();

  if (args.reportKey === "dashboard_kpis") {
    const today = date;

    const [
      checkoutsToday,
      checkinsToday,
      finesCollectedToday,
      newPatronsToday,
      holdsTotals,
      overdueCount,
    ] = await Promise.all([
      query<{ count: string }>(
        `select count(*)::text as count from action.circulation where circ_lib = $1 and xact_start::date = $2::date`,
        [args.orgId, today]
      ).then((rows) => parseInt(rows[0]?.count || "0", 10)),
      query<{ count: string }>(
        `select count(*)::text as count from action.circulation where circ_lib = $1 and checkin_time::date = $2::date`,
        [args.orgId, today]
      ).then((rows) => parseInt(rows[0]?.count || "0", 10)),
      query<{ total: string }>(
        `select coalesce(sum(amount), 0)::text as total from money.payment where payment_ts::date = $1::date`,
        [today]
      ).then((rows) => parseFloat(rows[0]?.total || "0")),
      query<{ count: string }>(
        `select count(*)::text as count from actor.usr where home_ou = $1 and create_date::date = $2::date and not deleted`,
        [args.orgId, today]
      ).then((rows) => parseInt(rows[0]?.count || "0", 10)),
      query<{ total: string; ready: string; in_transit: string }>(
        `
          select
            count(*)::text as total,
            count(*) filter (
              where ahr.current_shelf_lib = ahr.pickup_lib
                and ahr.shelf_time is not null
                and (ahr.shelf_expire_time is null or ahr.shelf_expire_time > now())
            )::text as ready,
            count(*) filter (where ahtc.id is not null)::text as in_transit
          from action.hold_request ahr
          left join action.hold_transit_copy ahtc
            on ahtc.hold = ahr.id
            and ahtc.cancel_time is null
            and ahtc.dest_recv_time is null
          where ahr.pickup_lib = $1
            and ahr.cancel_time is null
            and ahr.fulfillment_time is null
            and (ahr.expire_time is null or ahr.expire_time > now())
            and (ahr.frozen is null or ahr.frozen = false)
        `,
        [args.orgId]
      ).then((rows) => ({
        total: rows[0]?.total || "0",
        ready: rows[0]?.ready || "0",
        in_transit: rows[0]?.in_transit || "0",
      })),
      query<{ count: string }>(
        `select count(*)::text as count from action.circulation where circ_lib = $1 and checkin_time is null and due_date < now()`,
        [args.orgId]
      ).then((rows) => parseInt(rows[0]?.count || "0", 10)),
    ]);

    const holdsTotal = parseInt(holdsTotals.total || "0", 10);
    const holdsReady = parseInt(holdsTotals.ready || "0", 10);
    const holdsInTransit = parseInt(holdsTotals.in_transit || "0", 10);
    const holdsPending = Math.max(0, holdsTotal - holdsReady - holdsInTransit);

    const rows = [
      { metric: "date", value: today },
      { metric: "org_id", value: args.orgId },
      { metric: "checkouts_today", value: checkoutsToday },
      { metric: "checkins_today", value: checkinsToday },
      { metric: "active_holds", value: holdsTotal },
      { metric: "holds_ready", value: holdsReady },
      { metric: "holds_in_transit", value: holdsInTransit },
      { metric: "holds_pending", value: holdsPending },
      { metric: "overdue_items", value: overdueCount },
      { metric: "fines_collected_today", value: finesCollectedToday.toFixed(2) },
      { metric: "new_patrons_today", value: newPatronsToday },
    ];

    const csv = toCsv(rows, ["metric", "value"]);
    return {
      filename: `${sanitizeFilename(`kpis-${today}`)}.csv`,
      contentType: "text/csv; charset=utf-8",
      bytes: Buffer.from("\uFEFF" + csv, "utf-8"),
      rowCount: rows.length,
      summary: `KPIs for ${today}`,
    };
  }

  if (args.reportKey === "holds_summary") {
    const rows = await query<{ total: string; ready: string; in_transit: string }>(
      `
        select
          count(*)::text as total,
          count(*) filter (
            where ahr.current_shelf_lib = ahr.pickup_lib
              and ahr.shelf_time is not null
              and (ahr.shelf_expire_time is null or ahr.shelf_expire_time > now())
          )::text as ready,
          count(*) filter (where ahtc.id is not null)::text as in_transit
        from action.hold_request ahr
        left join action.hold_transit_copy ahtc
          on ahtc.hold = ahr.id
          and ahtc.cancel_time is null
          and ahtc.dest_recv_time is null
        where ahr.pickup_lib = $1
          and ahr.cancel_time is null
          and ahr.fulfillment_time is null
          and (ahr.expire_time is null or ahr.expire_time > now())
          and (ahr.frozen is null or ahr.frozen = false)
      `,
      [args.orgId]
    );

    const total = parseInt(rows[0]?.total || "0", 10);
    const ready = parseInt(rows[0]?.ready || "0", 10);
    const inTransit = parseInt(rows[0]?.in_transit || "0", 10);
    const pending = Math.max(0, total - ready - inTransit);

    const output = [{ date, org_id: args.orgId, total, ready, in_transit: inTransit, pending }];
    const csv = toCsv(output, ["date", "org_id", "total", "ready", "in_transit", "pending"]);

    return {
      filename: `${sanitizeFilename(`holds-${date}`)}.csv`,
      contentType: "text/csv; charset=utf-8",
      bytes: Buffer.from("\uFEFF" + csv, "utf-8"),
      rowCount: output.length,
      summary: `Holds summary for ${date}`,
    };
  }

  const limit = Math.min(500, Math.max(1, args.limit ?? 100));
  const rows = await query<any>(
    `
      select
        circ.id as circ_id,
        circ.due_date,
        circ.usr as patron_id,
        copy.barcode,
        cn.label as call_number,
        title.value as title,
        author.value as author
      from action.circulation circ
      join asset.copy copy on copy.id = circ.target_copy
      left join asset.call_number cn on cn.id = copy.call_number
      left join lateral (
        select value from metabib.flat_display_entry
        where source = cn.record and name = 'title'
        order by value
        limit 1
      ) title on true
      left join lateral (
        select value from metabib.flat_display_entry
        where source = cn.record and name = 'author'
        order by value
        limit 1
      ) author on true
      where circ.circ_lib = $1
        and circ.checkin_time is null
        and circ.due_date < now()
      order by circ.due_date asc
      limit $2
    `,
    [args.orgId, limit]
  );

  const csv = toCsv(rows, [
    "circ_id",
    "due_date",
    "patron_id",
    "barcode",
    "call_number",
    "title",
    "author",
  ]);
  return {
    filename: `${sanitizeFilename(`overdue-${date}`)}.csv`,
    contentType: "text/csv; charset=utf-8",
    bytes: Buffer.from("\uFEFF" + csv, "utf-8"),
    rowCount: rows.length,
    summary: `Overdue items (${rows.length}) for ${date}`,
  };
}
