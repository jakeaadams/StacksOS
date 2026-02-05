import { withTransaction, query } from "@/lib/db/evergreen";
import { assertLibrarySchemaExists } from "@/lib/db/library-schema";
import { logger } from "@/lib/logger";

export type PatronChangeAction =
  | "patron.create"
  | "patron.update"
  | "patron.pin.change"
  | "patron.block.add"
  | "patron.block.remove"
  | "patron.note.add"
  | "patron.note.delete"
  | "patron.note.create"
  | "patron.penalty.apply"
  | "patron.penalty.remove"
  | string;

export interface PatronChangeActor {
  id?: number | null;
  username?: string | null;
  name?: string | null;
  workstation?: string | null;
}

export interface RecordPatronChangeEventArgs {
  patronId: number;
  action: PatronChangeAction;
  actor?: PatronChangeActor | null;
  requestId?: string | null;
  changes?: Record<string, unknown> | null;
}

export interface ListPatronChangeEventsArgs {
  limit: number;
  offset: number;
  patronId?: number;
  startDate?: string;
  endDate?: string;
}

export interface PatronChangeEventRow {
  id: number;
  occurred_at: string;
  patron_id: number;
  action: string;
  actor_id: number | null;
  actor_username: string | null;
  actor_name: string | null;
  workstation: string | null;
  request_id: string | null;
  changes: Record<string, unknown> | null;
}

let tablesReady = false;

export async function ensurePatronChangeTables(): Promise<void> {
  if (tablesReady) return;
  if (!process.env.EVERGREEN_DB_PASSWORD) {
    throw new Error("EVERGREEN_DB_PASSWORD is not set; cannot access Evergreen DB");
  }

  await withTransaction(async (client) => {
    await assertLibrarySchemaExists(client);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.stacksos_patron_change_events (
        id SERIAL PRIMARY KEY,
        occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
        patron_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        actor_id INTEGER,
        actor_username TEXT,
        actor_name TEXT,
        workstation TEXT,
        request_id TEXT,
        changes JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stacksos_patron_change_events_time
      ON library.stacksos_patron_change_events(occurred_at DESC, id DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stacksos_patron_change_events_patron
      ON library.stacksos_patron_change_events(patron_id, occurred_at DESC, id DESC)
    `);
  });

  tablesReady = true;
  logger.info({ component: "patron-change" }, "Patron-change event tables ready");
}

function toSafeChangesObject(
  action: string,
  changes: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (changes && typeof changes === "object") {
    const keys = Object.keys(changes).slice(0, 32);
    for (const key of keys) out[String(key)] = true;
  }

  if (Object.keys(out).length > 0) return out;

  // Default “marker” fields that are safe to store/display.
  if (action === "patron.create") return { created: true };
  if (action === "patron.update") return { updated: true };
  if (action === "patron.pin.change") return { pin: true };
  if (action.startsWith("patron.block.")) return { block: true };
  if (action.startsWith("patron.note.")) return { note: true };
  if (action.startsWith("patron.penalty.")) return { penalty: true };

  return { changed: true };
}

export async function recordPatronChangeEvent(args: RecordPatronChangeEventArgs): Promise<void> {
  try {
    await ensurePatronChangeTables();

    const changes = toSafeChangesObject(args.action, args.changes);
    await query(
      `
        insert into library.stacksos_patron_change_events
          (patron_id, action, actor_id, actor_username, actor_name, workstation, request_id, changes)
        values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      `,
      [
        args.patronId,
        args.action,
        args.actor?.id ?? null,
        args.actor?.username ?? null,
        args.actor?.name ?? null,
        args.actor?.workstation ?? null,
        args.requestId ?? null,
        JSON.stringify(changes),
      ]
    );
  } catch (error) {
    logger.warn({ error: String(error), component: "patron-change" }, "Failed to record patron-change event");
  }
}

export async function listPatronChangeEvents(args: ListPatronChangeEventsArgs): Promise<PatronChangeEventRow[]> {
  await ensurePatronChangeTables();

  const limit = Math.min(Math.max(1, args.limit), 200);
  const offset = Math.max(0, args.offset);

  const where: string[] = [];
  const params: any[] = [];

  if (typeof args.patronId === "number" && Number.isFinite(args.patronId)) {
    params.push(args.patronId);
    where.push(`patron_id = $${params.length}`);
  }

  if (args.startDate) {
    params.push(args.startDate);
    where.push(`occurred_at >= $${params.length}::timestamptz`);
  }
  if (args.endDate) {
    params.push(args.endDate);
    where.push(`occurred_at <= $${params.length}::timestamptz`);
  }

  params.push(limit);
  params.push(offset);

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  return await query<PatronChangeEventRow>(
    `
      select
        id,
        occurred_at,
        patron_id,
        action,
        actor_id,
        actor_username,
        actor_name,
        workstation,
        request_id,
        changes
      from library.stacksos_patron_change_events
      ${whereSql}
      order by occurred_at desc, id desc
      limit $${params.length - 1}
      offset $${params.length}
    `,
    params
  );
}
