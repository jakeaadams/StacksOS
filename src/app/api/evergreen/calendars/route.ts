import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  parseJsonBodyWithSchema,
  successResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { withTransaction } from "@/lib/db/evergreen";
import { logAuditEvent } from "@/lib/audit";
import { assertLibrarySchemaExists } from "@/lib/db/library-schema";

type HoursDay = { open: string | null; close: string | null; note?: string | null };

const HoursSchema = z
  .object({
    dow0: z.object({
      open: z.string().nullable(),
      close: z.string().nullable(),
      note: z.string().nullable().optional(),
    }),
    dow1: z.object({
      open: z.string().nullable(),
      close: z.string().nullable(),
      note: z.string().nullable().optional(),
    }),
    dow2: z.object({
      open: z.string().nullable(),
      close: z.string().nullable(),
      note: z.string().nullable().optional(),
    }),
    dow3: z.object({
      open: z.string().nullable(),
      close: z.string().nullable(),
      note: z.string().nullable().optional(),
    }),
    dow4: z.object({
      open: z.string().nullable(),
      close: z.string().nullable(),
      note: z.string().nullable().optional(),
    }),
    dow5: z.object({
      open: z.string().nullable(),
      close: z.string().nullable(),
      note: z.string().nullable().optional(),
    }),
    dow6: z.object({
      open: z.string().nullable(),
      close: z.string().nullable(),
      note: z.string().nullable().optional(),
    }),
  })
  .strict();

const ClosedDateSchema = z
  .object({
    id: z.number().int().positive().optional(),
    closeStart: z.string().min(1),
    closeEnd: z.string().min(1),
    reason: z.string().nullable().optional(),
    fullDay: z.boolean().default(true),
    multiDay: z.boolean().default(false),
  })
  .strict();

const UpdateSchema = z
  .object({
    action: z.enum(["update", "rollback"]),
    orgId: z.number().int().positive(),
    note: z.string().max(500).optional(),
    hours: HoursSchema.optional(),
    closedDates: z.array(ClosedDateSchema).optional(),
    versionId: z.number().int().positive().optional(),
  })
  .strict();

async function ensureCalendarTables() {
  await withTransaction(async (client) => {
    await assertLibrarySchemaExists(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.calendar_versions (
        id SERIAL PRIMARY KEY,
        org_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        note TEXT,
        prev_hours JSONB,
        next_hours JSONB,
        prev_closed JSONB,
        next_closed JSONB
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_calendar_versions_org_id ON library.calendar_versions(org_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_calendar_versions_created_at ON library.calendar_versions(created_at)`
    );
  });
}

function isMidnight(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return s === "00:00" || s === "00:00:00" || s === "00:00:00.000";
}

function normalizeDayForRead(openRaw: unknown, closeRaw: unknown, noteRaw: unknown): HoursDay {
  // Evergreen represents "closed" as open==close==00:00 (NOT NULL columns).
  const open = openRaw ?? null;
  const close = closeRaw ?? null;
  const note = noteRaw != null ? String(noteRaw) : null;

  if (isMidnight(open) && isMidnight(close)) {
    return { open: null, close: null, note };
  }

  return {
    open: open === null ? null : String(open),
    close: close === null ? null : String(close),
    note,
  };
}

function normalizeDayForWrite(day: HoursDay): { open: string; close: string; note: string | null } {
  const open = day?.open ?? null;
  const close = day?.close ?? null;
  const note = day?.note ?? null;

  if ((open === null) !== (close === null)) {
    throw new Error(
      "Invalid hours: open and close must both be provided (or both be null) for each day"
    );
  }

  // Evergreen schema requires NOT NULL time columns. Use 00:00 to represent closed days.
  if (open === null && close === null) {
    return { open: "00:00", close: "00:00", note };
  }

  return { open: String(open), close: String(close), note };
}

function normalizeHoursRow(row: Record<string, unknown>): Record<string, HoursDay> {
  const mk = (dow: number): HoursDay =>
    normalizeDayForRead(
      row?.[`dow_${dow}_open`],
      row?.[`dow_${dow}_close`],
      row?.[`dow_${dow}_note`]
    );
  return {
    dow0: mk(0),
    dow1: mk(1),
    dow2: mk(2),
    dow3: mk(3),
    dow4: mk(4),
    dow5: mk(5),
    dow6: mk(6),
  };
}

async function readCalendarSnapshot(client: any, orgId: number) {
  const hoursRes = await client.query(`select * from actor.hours_of_operation where id = $1`, [
    orgId,
  ]);
  const hours = hoursRes.rows[0] ? normalizeHoursRow(hoursRes.rows[0]) : null;

  const closedRes = await client.query(
    `
      select id, close_start, close_end, reason, full_day, multi_day
      from actor.org_unit_closed
      where org_unit = $1
      order by close_start asc, id asc
    `,
    [orgId]
  );
  const closed = closedRes.rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    closeStart: r.close_start,
    closeEnd: r.close_end,
    reason: r.reason ?? null,
    fullDay: r.full_day === true || r.full_day === "t",
    multiDay: r.multi_day === true || r.multi_day === "t",
  }));

  return { hours, closed };
}

async function writeHours(client: any, orgId: number, hours: Record<string, HoursDay>) {
  const d0 = normalizeDayForWrite(hours.dow0!);
  const d1 = normalizeDayForWrite(hours.dow1!);
  const d2 = normalizeDayForWrite(hours.dow2!);
  const d3 = normalizeDayForWrite(hours.dow3!);
  const d4 = normalizeDayForWrite(hours.dow4!);
  const d5 = normalizeDayForWrite(hours.dow5!);
  const d6 = normalizeDayForWrite(hours.dow6!);

  const row = {
    id: orgId,
    dow_0_open: d0.open,
    dow_0_close: d0.close,
    dow_0_note: d0.note,
    dow_1_open: d1.open,
    dow_1_close: d1.close,
    dow_1_note: d1.note,
    dow_2_open: d2.open,
    dow_2_close: d2.close,
    dow_2_note: d2.note,
    dow_3_open: d3.open,
    dow_3_close: d3.close,
    dow_3_note: d3.note,
    dow_4_open: d4.open,
    dow_4_close: d4.close,
    dow_4_note: d4.note,
    dow_5_open: d5.open,
    dow_5_close: d5.close,
    dow_5_note: d5.note,
    dow_6_open: d6.open,
    dow_6_close: d6.close,
    dow_6_note: d6.note,
  };

  await client.query(
    `
      insert into actor.hours_of_operation (
        id,
        dow_0_open, dow_0_close, dow_0_note,
        dow_1_open, dow_1_close, dow_1_note,
        dow_2_open, dow_2_close, dow_2_note,
        dow_3_open, dow_3_close, dow_3_note,
        dow_4_open, dow_4_close, dow_4_note,
        dow_5_open, dow_5_close, dow_5_note,
        dow_6_open, dow_6_close, dow_6_note
      )
      values (
        $1,
        $2,$3,$4,
        $5,$6,$7,
        $8,$9,$10,
        $11,$12,$13,
        $14,$15,$16,
        $17,$18,$19,
        $20,$21,$22
      )
      on conflict (id) do update set
        dow_0_open = excluded.dow_0_open, dow_0_close = excluded.dow_0_close, dow_0_note = excluded.dow_0_note,
        dow_1_open = excluded.dow_1_open, dow_1_close = excluded.dow_1_close, dow_1_note = excluded.dow_1_note,
        dow_2_open = excluded.dow_2_open, dow_2_close = excluded.dow_2_close, dow_2_note = excluded.dow_2_note,
        dow_3_open = excluded.dow_3_open, dow_3_close = excluded.dow_3_close, dow_3_note = excluded.dow_3_note,
        dow_4_open = excluded.dow_4_open, dow_4_close = excluded.dow_4_close, dow_4_note = excluded.dow_4_note,
        dow_5_open = excluded.dow_5_open, dow_5_close = excluded.dow_5_close, dow_5_note = excluded.dow_5_note,
        dow_6_open = excluded.dow_6_open, dow_6_close = excluded.dow_6_close, dow_6_note = excluded.dow_6_note
    `,
    [
      row.id,
      row.dow_0_open,
      row.dow_0_close,
      row.dow_0_note,
      row.dow_1_open,
      row.dow_1_close,
      row.dow_1_note,
      row.dow_2_open,
      row.dow_2_close,
      row.dow_2_note,
      row.dow_3_open,
      row.dow_3_close,
      row.dow_3_note,
      row.dow_4_open,
      row.dow_4_close,
      row.dow_4_note,
      row.dow_5_open,
      row.dow_5_close,
      row.dow_5_note,
      row.dow_6_open,
      row.dow_6_close,
      row.dow_6_note,
    ]
  );
}

async function replaceClosedDates(
  client: any,
  orgId: number,
  closedDates: Array<z.infer<typeof ClosedDateSchema>>
) {
  // Safe semantics for pilots: "set exact list" for the org.
  // We keep it auditable and versioned; rollback is always available.
  await client.query(`delete from actor.org_unit_closed where org_unit = $1`, [orgId]);
  for (const cd of closedDates) {
    await client.query(
      `
        insert into actor.org_unit_closed (org_unit, close_start, close_end, reason, full_day, multi_day)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        orgId,
        cd.closeStart,
        cd.closeEnd,
        cd.reason ?? null,
        cd.fullDay ? "t" : "f",
        cd.multiDay ? "t" : "f",
      ]
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);
    await ensureCalendarTables();

    const orgIdRaw = req.nextUrl.searchParams.get("org_id");
    const orgId = orgIdRaw ? parseInt(orgIdRaw, 10) : NaN;
    if (!Number.isFinite(orgId)) {
      return errorResponse("org_id required", 400);
    }

    const result = await withTransaction(async (client) => {
      const snapshot = await readCalendarSnapshot(client, orgId);
      const versionsRes = await client.query(
        `select id, created_at, created_by, note from library.calendar_versions where org_id = $1 order by id desc limit 25`,
        [orgId]
      );
      return { snapshot, versions: versionsRes.rows };
    });

    return successResponse({ orgId, ...result });
  } catch (error: unknown) {
    return serverErrorResponse(error, "Calendars GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = await parseJsonBodyWithSchema(req, UpdateSchema);
    if (body instanceof Response) return body;

    const { action, orgId } = body;

    if (action === "update") {
      const { authtoken, actor } = await requirePermissions([
        "UPDATE_HOURS_OF_OPERATION",
        "UPDATE_ORG_UNIT_CLOSING",
      ]);
      void authtoken;
      await ensureCalendarTables();

      if (!body.hours && !body.closedDates) {
        return errorResponse("Provide hours and/or closedDates", 400);
      }

      const note = body.note?.trim() || null;

      const result = await withTransaction(async (client) => {
        const prev = await readCalendarSnapshot(client, orgId);
        const nextHours = body.hours ? HoursSchema.parse(body.hours) : prev.hours;
        const nextClosed = body.closedDates
          ? body.closedDates.map((d) => ClosedDateSchema.parse(d))
          : prev.closed;

        if (nextHours) {
          await writeHours(client, orgId, nextHours as Record<string, HoursDay>);
        }
        if (nextClosed) {
          await replaceClosedDates(
            client,
            orgId,
            nextClosed as Array<z.infer<typeof ClosedDateSchema>>
          );
        }

        const next = await readCalendarSnapshot(client, orgId);

        await client.query(
          `
            insert into library.calendar_versions (org_id, created_by, note, prev_hours, next_hours, prev_closed, next_closed)
            values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)
          `,
          [
            orgId,
            actor?.id ?? null,
            note,
            JSON.stringify(prev.hours),
            JSON.stringify(next.hours),
            JSON.stringify(prev.closed),
            JSON.stringify(next.closed),
          ]
        );

        return { prev, next };
      });

      await logAuditEvent({
        action: "admin.calendar.update",
        entity: "org_calendar",
        entityId: orgId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { orgId, note },
      });

      return successResponse({ orgId, ...result });
    }

    if (action === "rollback") {
      const { actor } = await requirePermissions([
        "UPDATE_HOURS_OF_OPERATION",
        "UPDATE_ORG_UNIT_CLOSING",
      ]);
      await ensureCalendarTables();

      if (!body.versionId) return errorResponse("versionId required", 400);
      const versionId = body.versionId;

      const result = await withTransaction(async (client) => {
        const verRes = await client.query(
          `select id, org_id, prev_hours, prev_closed from library.calendar_versions where id = $1`,
          [versionId]
        );
        const ver = verRes.rows[0];
        if (!ver) return null;
        if (ver.org_id !== orgId) return null;

        const prev = await readCalendarSnapshot(client, orgId);
        const targetHours = ver.prev_hours ?? null;
        const targetClosed = ver.prev_closed ?? null;

        if (targetHours) {
          await writeHours(
            client,
            orgId,
            HoursSchema.parse(targetHours as Record<string, HoursDay>) as Record<string, HoursDay>
          );
        }
        await replaceClosedDates(
          client,
          orgId,
          Array.isArray(targetClosed)
            ? (targetClosed as Array<z.infer<typeof ClosedDateSchema>>)
            : []
        );

        const next = await readCalendarSnapshot(client, orgId);
        await client.query(
          `
            insert into library.calendar_versions (org_id, created_by, note, prev_hours, next_hours, prev_closed, next_closed)
            values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)
          `,
          [
            orgId,
            actor?.id ?? null,
            `Rollback to version ${versionId}`,
            JSON.stringify(prev.hours),
            JSON.stringify(next.hours),
            JSON.stringify(prev.closed),
            JSON.stringify(next.closed),
          ]
        );

        return { prev, next };
      });

      if (!result) return errorResponse("Version not found for org", 404);

      await logAuditEvent({
        action: "admin.calendar.rollback",
        entity: "org_calendar",
        entityId: orgId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { orgId, versionId },
      });

      return successResponse({ orgId, ...result });
    }

    return errorResponse("Invalid action", 400);
  } catch (error: unknown) {
    return serverErrorResponse(error, "Calendars POST", req);
  }
}
