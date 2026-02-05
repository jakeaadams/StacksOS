import { logger } from "@/lib/logger";
import { query, querySingle } from "./evergreen";
import { ensureLibrarySchemaExists } from "./library-schema";

let collaborationTablesInitialized = false;

async function ensureCollaborationTables(): Promise<void> {
  if (collaborationTablesInitialized) return;

  await ensureLibrarySchemaExists();

  await query(`
    CREATE TABLE IF NOT EXISTS library.record_presence (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      actor_id INTEGER,
      record_type TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      activity TEXT NOT NULL,
      user_agent TEXT,
      ip TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      last_seen_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(session_id, record_type, record_id)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_record_presence_record
    ON library.record_presence(record_type, record_id, last_seen_at DESC)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS library.record_tasks (
      id SERIAL PRIMARY KEY,
      record_type TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to INTEGER,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_record_tasks_record
    ON library.record_tasks(record_type, record_id, created_at DESC)
  `);

  collaborationTablesInitialized = true;
  logger.info({}, "Collaboration tables initialized");
}

export type RecordPresence = {
  actorId: number | null;
  actorName: string | null;
  activity: "viewing" | "editing";
  lastSeenAt: string;
  sessionId: string;
};

export async function upsertRecordPresence(args: {
  sessionId: string;
  actorId?: number | null;
  recordType: string;
  recordId: number;
  activity: "viewing" | "editing";
  userAgent?: string | null;
  ip?: string | null;
}): Promise<void> {
  await ensureCollaborationTables();

  await query(
    `
      INSERT INTO library.record_presence (
        session_id, actor_id, record_type, record_id, activity, user_agent, ip, last_seen_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (session_id, record_type, record_id)
      DO UPDATE SET
        actor_id = excluded.actor_id,
        activity = excluded.activity,
        user_agent = excluded.user_agent,
        ip = excluded.ip,
        last_seen_at = NOW()
    `,
    [
      args.sessionId,
      args.actorId || null,
      args.recordType,
      args.recordId,
      args.activity,
      args.userAgent || null,
      args.ip || null,
    ]
  );
}

export async function listRecordPresence(args: {
  recordType: string;
  recordId: number;
  activeWithinSeconds?: number;
  excludeSessionId?: string | null;
}): Promise<RecordPresence[]> {
  await ensureCollaborationTables();
  const within = Number(args.activeWithinSeconds || 90);

  const rows = await query<{
    session_id: string;
    actor_id: number | null;
    activity: string;
    last_seen_at: string;
    actor_name: string | null;
  }>(
    `
      SELECT
        p.session_id,
        p.actor_id,
        p.activity,
        p.last_seen_at,
        COALESCE(u.usrname, NULL) as actor_name
      FROM library.record_presence p
      LEFT JOIN actor.usr u ON u.id = p.actor_id
      WHERE p.record_type = $1
        AND p.record_id = $2
        AND p.last_seen_at > (NOW() - ($3 || ' seconds')::interval)
        AND ($4::text IS NULL OR p.session_id <> $4)
      ORDER BY p.activity DESC, p.last_seen_at DESC
      LIMIT 25
    `,
    [args.recordType, args.recordId, within, args.excludeSessionId || null]
  );

  return rows.map((r) => ({
    sessionId: r.session_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    activity: r.activity === "editing" ? "editing" : "viewing",
    lastSeenAt: r.last_seen_at,
  }));
}

export type RecordTask = {
  id: number;
  recordType: string;
  recordId: number;
  title: string;
  body: string | null;
  status: "open" | "done" | "canceled";
  assignedTo: number | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export async function listRecordTasks(args: { recordType: string; recordId: number }): Promise<RecordTask[]> {
  await ensureCollaborationTables();
  const rows = await query<RecordTask>(
    `
      SELECT
        id,
        record_type as "recordType",
        record_id as "recordId",
        title,
        body,
        status,
        assigned_to as "assignedTo",
        created_by as "createdBy",
        updated_by as "updatedBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM library.record_tasks
      WHERE record_type = $1 AND record_id = $2
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [args.recordType, args.recordId]
  );
  return rows;
}

export async function createRecordTask(args: {
  recordType: string;
  recordId: number;
  title: string;
  body?: string | null;
  assignedTo?: number | null;
  createdBy?: number | null;
}): Promise<RecordTask> {
  await ensureCollaborationTables();
  const assignedTo = args.assignedTo !== undefined && args.assignedTo !== null ? args.assignedTo : args.createdBy || null;
  const row = await querySingle<RecordTask>(
    `
      INSERT INTO library.record_tasks (
        record_type, record_id, title, body, assigned_to, created_by, updated_by, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$6,NOW(),NOW())
      RETURNING
        id,
        record_type as "recordType",
        record_id as "recordId",
        title,
        body,
        status,
        assigned_to as "assignedTo",
        created_by as "createdBy",
        updated_by as "updatedBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [args.recordType, args.recordId, args.title, args.body || null, assignedTo, args.createdBy || null]
  );
  if (!row) throw new Error("Failed to create task");
  return row;
}

export async function updateRecordTask(args: {
  id: number;
  title?: string;
  body?: string | null;
  status?: "open" | "done" | "canceled";
  assignedTo?: number | null;
  updatedBy?: number | null;
}): Promise<RecordTask | null> {
  await ensureCollaborationTables();

  const status = args.status ? String(args.status) : null;
  if (status && !["open", "done", "canceled"].includes(status)) {
    throw new Error("Invalid status");
  }

  const row = await querySingle<RecordTask>(
    `
      UPDATE library.record_tasks
      SET
        title = COALESCE($2, title),
        body = COALESCE($3, body),
        status = COALESCE($4, status),
        assigned_to = COALESCE($5, assigned_to),
        updated_by = $6,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        record_type as "recordType",
        record_id as "recordId",
        title,
        body,
        status,
        assigned_to as "assignedTo",
        created_by as "createdBy",
        updated_by as "updatedBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      args.id,
      args.title || null,
      args.body !== undefined ? args.body : null,
      status,
      args.assignedTo !== undefined ? args.assignedTo : null,
      args.updatedBy || null,
    ]
  );
  return row;
}
