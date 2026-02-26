import type { PoolClient } from "pg";
import { logger } from "@/lib/logger";
import { ensureLibrarySchemaExists } from "@/lib/db/library-schema";
import { query, withTransaction } from "@/lib/db/evergreen";

export type EventRegistrationStatus = "registered" | "waitlisted" | "canceled";
export type EventReminderChannel = "none" | "email" | "sms" | "both";

type EventRegistrationRow = {
  id: number | string;
  event_id: string;
  patron_id: number;
  status: EventRegistrationStatus;
  waitlist_position: number | null;
  reminder_channel: EventReminderChannel;
  reminder_opt_in: boolean;
  reminder_scheduled_for: string | null;
  reminder_sent_at: string | null;
  registered_at: string;
  canceled_at: string | null;
  updated_at: string;
};

export type EventRegistrationRecord = {
  id: number;
  eventId: string;
  patronId: number;
  status: EventRegistrationStatus;
  waitlistPosition: number | null;
  reminderChannel: EventReminderChannel;
  reminderOptIn: boolean;
  reminderScheduledFor: string | null;
  reminderSentAt: string | null;
  registeredAt: string;
  canceledAt: string | null;
  updatedAt: string;
};

export type EventRegistrationMetrics = {
  registeredCount: number;
  waitlistedCount: number;
};

export type EventRegistrationActionResult = {
  registration: EventRegistrationRecord;
  action: "registered" | "waitlisted" | "already_registered" | "already_waitlisted";
  promotedFromWaitlist: boolean;
};

export type EventCancellationResult = {
  registration: EventRegistrationRecord | null;
  canceled: boolean;
  promotedWaitlist: boolean;
};

let opacEventTablesReady = false;
let opacEventTablesInit: Promise<void> | null = null;

function normalizeReminderChannel(value: unknown): EventReminderChannel {
  const raw = String(value || "email")
    .trim()
    .toLowerCase();
  if (raw === "none" || raw === "email" || raw === "sms" || raw === "both") return raw;
  return "email";
}

function toRegistrationRecord(row: EventRegistrationRow): EventRegistrationRecord {
  return {
    id: typeof row.id === "number" ? row.id : parseInt(String(row.id), 10),
    eventId: row.event_id,
    patronId: row.patron_id,
    status: row.status,
    waitlistPosition: row.waitlist_position ?? null,
    reminderChannel: row.reminder_channel,
    reminderOptIn: Boolean(row.reminder_opt_in),
    reminderScheduledFor: row.reminder_scheduled_for,
    reminderSentAt: row.reminder_sent_at,
    registeredAt: row.registered_at,
    canceledAt: row.canceled_at,
    updatedAt: row.updated_at,
  };
}

function computeReminderSchedule(
  eventDate: string,
  reminderOptIn: boolean,
  channel: EventReminderChannel
): string | null {
  if (!reminderOptIn || channel === "none") return null;

  const eventDateObj = new Date(`${eventDate}T09:00:00`);
  if (Number.isNaN(eventDateObj.getTime())) return null;

  eventDateObj.setDate(eventDateObj.getDate() - 1);
  if (eventDateObj.getTime() <= Date.now()) return null;

  return eventDateObj.toISOString();
}

async function ensureOpacEventTables(): Promise<void> {
  if (opacEventTablesReady) return;
  if (opacEventTablesInit) {
    await opacEventTablesInit;
    return;
  }

  opacEventTablesInit = (async () => {
    await ensureLibrarySchemaExists();

    await query(`
      CREATE TABLE IF NOT EXISTS library.opac_event_registrations (
        id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        patron_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('registered', 'waitlisted', 'canceled')),
        waitlist_position INTEGER,
        reminder_channel TEXT NOT NULL DEFAULT 'email' CHECK (reminder_channel IN ('none', 'email', 'sms', 'both')),
        reminder_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
        reminder_scheduled_for TIMESTAMP,
        reminder_sent_at TIMESTAMP,
        registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
        canceled_at TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (event_id, patron_id)
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_opac_event_registrations_event_status
      ON library.opac_event_registrations (event_id, status, waitlist_position)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_opac_event_registrations_patron_status
      ON library.opac_event_registrations (patron_id, status, updated_at DESC)
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS library.opac_event_registration_history (
        id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        patron_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_opac_event_registration_history_event_patron
      ON library.opac_event_registration_history (event_id, patron_id, created_at DESC)
    `);

    opacEventTablesReady = true;
    logger.info({}, "OPAC event registration tables initialized");
  })();

  try {
    await opacEventTablesInit;
  } finally {
    opacEventTablesInit = null;
  }
}

async function recordHistory(
  client: PoolClient,
  params: {
    eventId: string;
    patronId: number;
    action: string;
    fromStatus: EventRegistrationStatus | null;
    toStatus: EventRegistrationStatus | null;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO library.opac_event_registration_history (
        event_id,
        patron_id,
        action,
        from_status,
        to_status,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      params.eventId,
      params.patronId,
      params.action,
      params.fromStatus,
      params.toStatus,
      JSON.stringify(params.metadata || {}),
    ]
  );
}

export async function getEventRegistrationMetrics(
  eventIds: string[]
): Promise<Record<string, EventRegistrationMetrics>> {
  await ensureOpacEventTables();
  if (!Array.isArray(eventIds) || eventIds.length === 0) return {};

  const rows = await query<{
    event_id: string;
    registered_count: number;
    waitlisted_count: number;
  }>(
    `
      SELECT
        event_id,
        COUNT(*) FILTER (WHERE status = 'registered')::int AS registered_count,
        COUNT(*) FILTER (WHERE status = 'waitlisted')::int AS waitlisted_count
      FROM library.opac_event_registrations
      WHERE event_id = ANY($1::text[])
      GROUP BY event_id
    `,
    [eventIds]
  );

  const out: Record<string, EventRegistrationMetrics> = {};
  for (const row of rows) {
    out[row.event_id] = {
      registeredCount: Number(row.registered_count) || 0,
      waitlistedCount: Number(row.waitlisted_count) || 0,
    };
  }
  return out;
}

export async function listPatronEventRegistrations(
  patronId: number,
  options?: {
    eventIds?: string[];
    includeCanceled?: boolean;
  }
): Promise<EventRegistrationRecord[]> {
  await ensureOpacEventTables();

  const filters: string[] = ["patron_id = $1"];
  const params: unknown[] = [patronId];
  let p = 2;

  if (options?.eventIds && options.eventIds.length > 0) {
    filters.push(`event_id = ANY($${p}::text[])`);
    params.push(options.eventIds);
    p++;
  }

  if (!options?.includeCanceled) {
    filters.push("status <> 'canceled'");
  }

  const rows = await query<EventRegistrationRow>(
    `
      SELECT
        id,
        event_id,
        patron_id,
        status,
        waitlist_position,
        reminder_channel,
        reminder_opt_in,
        reminder_scheduled_for,
        reminder_sent_at,
        registered_at,
        canceled_at,
        updated_at
      FROM library.opac_event_registrations
      WHERE ${filters.join(" AND ")}
      ORDER BY updated_at DESC, id DESC
    `,
    params as any[]
  );

  return rows.map(toRegistrationRecord);
}

export async function registerPatronForEvent(args: {
  eventId: string;
  patronId: number;
  eventDate: string;
  capacity: number | null;
  reminderChannel?: EventReminderChannel;
  reminderOptIn?: boolean;
}): Promise<EventRegistrationActionResult> {
  await ensureOpacEventTables();

  const eventId = String(args.eventId || "").trim();
  if (!eventId) throw new Error("eventId required");

  const reminderChannel = normalizeReminderChannel(args.reminderChannel);
  const reminderOptIn = args.reminderOptIn ?? reminderChannel !== "none";
  const reminderScheduledFor = computeReminderSchedule(
    args.eventDate,
    reminderOptIn,
    reminderChannel
  );

  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1));", [eventId]);

    const existingRes = await client.query<EventRegistrationRow>(
      `
        SELECT
          id,
          event_id,
          patron_id,
          status,
          waitlist_position,
          reminder_channel,
          reminder_opt_in,
          reminder_scheduled_for,
          reminder_sent_at,
          registered_at,
          canceled_at,
          updated_at
        FROM library.opac_event_registrations
        WHERE event_id = $1 AND patron_id = $2
        FOR UPDATE
      `,
      [eventId, args.patronId]
    );
    const existing = existingRes.rows[0] || null;

    const countsRes = await client.query<{ registered_count: number; waitlisted_count: number }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'registered')::int AS registered_count,
          COUNT(*) FILTER (WHERE status = 'waitlisted')::int AS waitlisted_count
        FROM library.opac_event_registrations
        WHERE event_id = $1
      `,
      [eventId]
    );

    const registeredCount = Number(countsRes.rows[0]?.registered_count || 0);
    const waitlistedCount = Number(countsRes.rows[0]?.waitlisted_count || 0);

    let targetStatus: EventRegistrationStatus = "registered";
    let waitlistPosition: number | null = null;
    let action: EventRegistrationActionResult["action"] = "registered";
    let promotedFromWaitlist = false;

    if (existing?.status === "registered") {
      action = "already_registered";
      targetStatus = "registered";
    } else if (
      existing?.status === "waitlisted" &&
      args.capacity !== null &&
      registeredCount < args.capacity
    ) {
      // Capacity opened up since the user was waitlisted.
      targetStatus = "registered";
      waitlistPosition = null;
      promotedFromWaitlist = true;
      action = "registered";

      if (existing.waitlist_position && Number.isFinite(existing.waitlist_position)) {
        await client.query(
          `
            UPDATE library.opac_event_registrations
            SET waitlist_position = waitlist_position - 1,
                updated_at = NOW()
            WHERE event_id = $1
              AND status = 'waitlisted'
              AND waitlist_position > $2
          `,
          [eventId, existing.waitlist_position]
        );
      }
    } else if (existing?.status === "waitlisted") {
      targetStatus = "waitlisted";
      waitlistPosition = existing.waitlist_position;
      action = "already_waitlisted";
    } else {
      const atCapacity = args.capacity !== null && registeredCount >= args.capacity;
      if (atCapacity) {
        targetStatus = "waitlisted";
        waitlistPosition = waitlistedCount + 1;
        action = "waitlisted";
      } else {
        targetStatus = "registered";
        waitlistPosition = null;
        action = "registered";
      }
    }

    const upsertRes = await client.query<EventRegistrationRow>(
      `
        INSERT INTO library.opac_event_registrations (
          event_id,
          patron_id,
          status,
          waitlist_position,
          reminder_channel,
          reminder_opt_in,
          reminder_scheduled_for,
          reminder_sent_at,
          registered_at,
          canceled_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NOW(), NULL, NOW())
        ON CONFLICT (event_id, patron_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          waitlist_position = EXCLUDED.waitlist_position,
          reminder_channel = EXCLUDED.reminder_channel,
          reminder_opt_in = EXCLUDED.reminder_opt_in,
          reminder_scheduled_for = EXCLUDED.reminder_scheduled_for,
          reminder_sent_at = NULL,
          canceled_at = NULL,
          registered_at = CASE
            WHEN library.opac_event_registrations.status = 'canceled' THEN NOW()
            ELSE library.opac_event_registrations.registered_at
          END,
          updated_at = NOW()
        RETURNING
          id,
          event_id,
          patron_id,
          status,
          waitlist_position,
          reminder_channel,
          reminder_opt_in,
          reminder_scheduled_for,
          reminder_sent_at,
          registered_at,
          canceled_at,
          updated_at
      `,
      [
        eventId,
        args.patronId,
        targetStatus,
        waitlistPosition,
        reminderChannel,
        reminderOptIn,
        reminderScheduledFor,
      ]
    );

    const saved = toRegistrationRecord(upsertRes.rows[0]!);

    await recordHistory(client, {
      eventId,
      patronId: args.patronId,
      action,
      fromStatus: existing?.status ?? null,
      toStatus: saved.status,
      metadata: {
        capacity: args.capacity,
        waitlistPosition: saved.waitlistPosition,
      },
    });

    // Update queue positions if user moved from waitlist to registered.
    if (
      existing?.status === "waitlisted" &&
      saved.status === "registered" &&
      existing.waitlist_position
    ) {
      await client.query(
        `
          UPDATE library.opac_event_registrations
          SET waitlist_position = waitlist_position - 1,
              updated_at = NOW()
          WHERE event_id = $1
            AND status = 'waitlisted'
            AND waitlist_position > $2
        `,
        [eventId, existing.waitlist_position]
      );
    }

    return {
      registration: saved,
      action,
      promotedFromWaitlist,
    };
  });
}

export async function cancelPatronEventRegistration(args: {
  eventId: string;
  patronId: number;
  eventDate: string;
  capacity: number | null;
}): Promise<EventCancellationResult> {
  await ensureOpacEventTables();

  const eventId = String(args.eventId || "").trim();
  if (!eventId) throw new Error("eventId required");

  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1));", [eventId]);

    const existingRes = await client.query<EventRegistrationRow>(
      `
        SELECT
          id,
          event_id,
          patron_id,
          status,
          waitlist_position,
          reminder_channel,
          reminder_opt_in,
          reminder_scheduled_for,
          reminder_sent_at,
          registered_at,
          canceled_at,
          updated_at
        FROM library.opac_event_registrations
        WHERE event_id = $1 AND patron_id = $2
        FOR UPDATE
      `,
      [eventId, args.patronId]
    );

    const existing = existingRes.rows[0] || null;
    if (!existing || existing.status === "canceled") {
      return {
        registration: existing ? toRegistrationRecord(existing) : null,
        canceled: false,
        promotedWaitlist: false,
      };
    }

    const oldStatus = existing.status;
    const oldWaitlistPosition = existing.waitlist_position;

    const canceledRes = await client.query<EventRegistrationRow>(
      `
        UPDATE library.opac_event_registrations
        SET
          status = 'canceled',
          waitlist_position = NULL,
          reminder_channel = 'none',
          reminder_opt_in = FALSE,
          reminder_scheduled_for = NULL,
          reminder_sent_at = NULL,
          canceled_at = NOW(),
          updated_at = NOW()
        WHERE event_id = $1 AND patron_id = $2
        RETURNING
          id,
          event_id,
          patron_id,
          status,
          waitlist_position,
          reminder_channel,
          reminder_opt_in,
          reminder_scheduled_for,
          reminder_sent_at,
          registered_at,
          canceled_at,
          updated_at
      `,
      [eventId, args.patronId]
    );

    const canceled = toRegistrationRecord(canceledRes.rows[0]!);

    await recordHistory(client, {
      eventId,
      patronId: args.patronId,
      action: "cancel",
      fromStatus: oldStatus,
      toStatus: "canceled",
      metadata: {
        waitlistPosition: oldWaitlistPosition,
      },
    });

    if (oldStatus === "waitlisted" && oldWaitlistPosition && Number.isFinite(oldWaitlistPosition)) {
      await client.query(
        `
          UPDATE library.opac_event_registrations
          SET waitlist_position = waitlist_position - 1,
              updated_at = NOW()
          WHERE event_id = $1
            AND status = 'waitlisted'
            AND waitlist_position > $2
        `,
        [eventId, oldWaitlistPosition]
      );
    }

    let promotedWaitlist = false;

    if (oldStatus === "registered" && args.capacity !== null) {
      const promoteRes = await client.query<EventRegistrationRow>(
        `
          SELECT
            id,
            event_id,
            patron_id,
            status,
            waitlist_position,
            reminder_channel,
            reminder_opt_in,
            reminder_scheduled_for,
            reminder_sent_at,
            registered_at,
            canceled_at,
            updated_at
          FROM library.opac_event_registrations
          WHERE event_id = $1 AND status = 'waitlisted'
          ORDER BY waitlist_position ASC NULLS LAST, updated_at ASC
          LIMIT 1
          FOR UPDATE
        `,
        [eventId]
      );

      const promoted = promoteRes.rows[0] || null;
      if (promoted) {
        promotedWaitlist = true;

        const promotedReminderSchedule = computeReminderSchedule(
          args.eventDate,
          Boolean(promoted.reminder_opt_in),
          normalizeReminderChannel(promoted.reminder_channel)
        );

        await client.query(
          `
            UPDATE library.opac_event_registrations
            SET
              status = 'registered',
              waitlist_position = NULL,
              reminder_scheduled_for = $3,
              canceled_at = NULL,
              updated_at = NOW()
            WHERE id = $1
          `,
          [promoted.id, eventId, promotedReminderSchedule]
        );

        if (promoted.waitlist_position && Number.isFinite(promoted.waitlist_position)) {
          await client.query(
            `
              UPDATE library.opac_event_registrations
              SET waitlist_position = waitlist_position - 1,
                  updated_at = NOW()
              WHERE event_id = $1
                AND status = 'waitlisted'
                AND waitlist_position > $2
            `,
            [eventId, promoted.waitlist_position]
          );
        }

        await recordHistory(client, {
          eventId,
          patronId: promoted.patron_id,
          action: "promoted",
          fromStatus: "waitlisted",
          toStatus: "registered",
          metadata: {
            promotedFrom: promoted.waitlist_position,
          },
        });
      }
    }

    return {
      registration: canceled,
      canceled: true,
      promotedWaitlist,
    };
  });
}

export async function updatePatronEventReminder(args: {
  eventId: string;
  patronId: number;
  eventDate: string;
  reminderChannel: EventReminderChannel;
  reminderOptIn?: boolean;
}): Promise<EventRegistrationRecord | null> {
  await ensureOpacEventTables();

  const reminderChannel = normalizeReminderChannel(args.reminderChannel);
  const reminderOptIn = args.reminderOptIn ?? reminderChannel !== "none";
  const reminderScheduledFor = computeReminderSchedule(
    args.eventDate,
    reminderOptIn,
    reminderChannel
  );

  const rows = await query<EventRegistrationRow>(
    `
      UPDATE library.opac_event_registrations
      SET
        reminder_channel = $3,
        reminder_opt_in = $4,
        reminder_scheduled_for = $5,
        reminder_sent_at = NULL,
        updated_at = NOW()
      WHERE event_id = $1
        AND patron_id = $2
        AND status IN ('registered', 'waitlisted')
      RETURNING
        id,
        event_id,
        patron_id,
        status,
        waitlist_position,
        reminder_channel,
        reminder_opt_in,
        reminder_scheduled_for,
        reminder_sent_at,
        registered_at,
        canceled_at,
        updated_at
    `,
    [args.eventId, args.patronId, reminderChannel, reminderOptIn, reminderScheduledFor]
  );

  const row = rows[0];
  return row ? toRegistrationRecord(row) : null;
}

export async function listPatronEventHistory(
  patronId: number,
  options?: { eventId?: string; limit?: number }
): Promise<
  Array<{
    id: number;
    eventId: string;
    patronId: number;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    metadata: Record<string, any>;
    createdAt: string;
  }>
> {
  await ensureOpacEventTables();

  const filters: string[] = ["patron_id = $1"];
  const params: unknown[] = [patronId];
  let p = 2;

  if (options?.eventId) {
    filters.push(`event_id = $${p}`);
    params.push(options.eventId);
    p++;
  }

  const limit = Number.isFinite(Number(options?.limit))
    ? Math.max(1, Math.min(200, Number(options?.limit)))
    : 50;
  params.push(limit);

  const rows = await query<{
    id: number | string;
    event_id: string;
    patron_id: number;
    action: string;
    from_status: string | null;
    to_status: string | null;
    metadata: unknown;
    created_at: string;
  }>(
    `
      SELECT
        id,
        event_id,
        patron_id,
        action,
        from_status,
        to_status,
        metadata,
        created_at
      FROM library.opac_event_registration_history
      WHERE ${filters.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${p}
    `,
    params as any[]
  );

  return rows.map((row) => ({
    id: typeof row.id === "number" ? row.id : parseInt(String(row.id), 10),
    eventId: row.event_id,
    patronId: row.patron_id,
    action: row.action,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, any>)
        : {},
    createdAt: row.created_at,
  }));
}
