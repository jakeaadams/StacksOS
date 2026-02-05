import { withTransaction, query, querySingle } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";
import { assertLibrarySchemaExists } from "@/lib/db/library-schema";

let tablesReady = false;

export async function ensureSupportTables() {
  if (tablesReady) return;
  await withTransaction(async (client) => {
    await assertLibrarySchemaExists(client);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.incident_banners (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        active BOOLEAN NOT NULL DEFAULT true,
        starts_at TIMESTAMP DEFAULT NOW(),
        ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_incident_banners_active ON library.incident_banners(active, id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.support_tickets (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        requester_email TEXT,
        requester_name TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        priority TEXT NOT NULL DEFAULT 'normal',
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON library.support_tickets(status, id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library.release_notes (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER,
        version TEXT,
        title TEXT NOT NULL,
        body TEXT NOT NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_release_notes_created_at ON library.release_notes(created_at)`);
  });
  tablesReady = true;
  logger.info({ component: "support" }, "Support/ops tables ready");
}

export async function getActiveIncident() {
  await ensureSupportTables();
  return await querySingle<any>(
    `
      select id, message, severity, starts_at, ends_at
      from library.incident_banners
      where active = true and (ends_at is null or ends_at > now())
      order by id desc
      limit 1
    `
  );
}

export async function listIncidents(limit = 50) {
  await ensureSupportTables();
  return await query<any>(
    `select id, message, severity, active, starts_at, ends_at, created_at, created_by from library.incident_banners order by id desc limit $1`,
    [limit]
  );
}

export async function createIncident(args: { message: string; severity: string; endsAt?: string | null; createdBy?: number | null }) {
  await ensureSupportTables();
  const { message, severity, endsAt = null, createdBy = null } = args;
  return await querySingle<{ id: number }>(
    `
      insert into library.incident_banners (message, severity, active, ends_at, created_by)
      values ($1, $2, true, $3, $4)
      returning id
    `,
    [message, severity, endsAt, createdBy]
  );
}

export async function resolveIncident(id: number) {
  await ensureSupportTables();
  await query(`update library.incident_banners set active = false, ends_at = coalesce(ends_at, now()) where id = $1`, [id]);
}

export async function createTicket(args: {
  createdBy?: number | null;
  requesterEmail?: string | null;
  requesterName?: string | null;
  category: string;
  priority: string;
  subject: string;
  body: string;
}) {
  await ensureSupportTables();
  const { createdBy = null, requesterEmail = null, requesterName = null, category, priority, subject, body } = args;
  return await querySingle<{ id: number }>(
    `
      insert into library.support_tickets (created_by, requester_email, requester_name, category, priority, subject, body)
      values ($1,$2,$3,$4,$5,$6,$7)
      returning id
    `,
    [createdBy, requesterEmail, requesterName, category, priority, subject, body]
  );
}

export async function listTickets(limit = 100) {
  await ensureSupportTables();
  return await query<any>(
    `
      select id, created_at, created_by, requester_email, requester_name, category, priority, subject, status
      from library.support_tickets
      order by id desc
      limit $1
    `,
    [limit]
  );
}

export async function addReleaseNote(args: { createdBy?: number | null; version?: string | null; title: string; body: string }) {
  await ensureSupportTables();
  const { createdBy = null, version = null, title, body } = args;
  return await querySingle<{ id: number }>(
    `
      insert into library.release_notes (created_by, version, title, body)
      values ($1,$2,$3,$4)
      returning id
    `,
    [createdBy, version, title, body]
  );
}

export async function listReleaseNotes(limit = 50) {
  await ensureSupportTables();
  return await query<any>(
    `select id, created_at, created_by, version, title, body from library.release_notes order by id desc limit $1`,
    [limit]
  );
}
