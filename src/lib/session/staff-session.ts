import { cookies, headers } from "next/headers";
import { AuthenticationError } from "@/lib/api";
import { withTransaction } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";
import { assertLibrarySchemaExists } from "@/lib/db/library-schema";

let sessionsReady = false;

async function ensureSessionsTable() {
  if (sessionsReady) return;
  await withTransaction(async (client) => {
    await assertLibrarySchemaExists(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS library.staff_sessions (
        id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen_at TIMESTAMP DEFAULT NOW(),
        ip TEXT,
        user_agent TEXT,
        revoked_at TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_sessions_actor_id ON library.staff_sessions(actor_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_sessions_last_seen ON library.staff_sessions(last_seen_at)`);
  });
  sessionsReady = true;
}

async function getHeader(name: string): Promise<string | null> {
  const h = await headers();
  const v = h.get(name);
  return v && v.trim() ? v.trim() : null;
}

async function getClientIpFromHeaders(): Promise<string | null> {
  const xff = await getHeader("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return await getHeader("x-real-ip");
}

async function getUserAgentFromHeaders(): Promise<string | null> {
  return await getHeader("user-agent");
}

function idleTimeoutMinutes(): number | null {
  const raw = process.env.STACKSOS_IDLE_TIMEOUT_MINUTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(8 * 60, Math.max(1, Math.floor(n)));
}

export async function requireStaffSession(actorId: number): Promise<{ sessionId: string }> {
  await ensureSessionsTable();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("stacksos_session_id")?.value || "";
  if (!sessionId) throw new AuthenticationError("Session missing");

  const ip = await getClientIpFromHeaders();
  const userAgent = await getUserAgentFromHeaders();
  const idleMinutes = idleTimeoutMinutes();

  const now = new Date();

  const row = await withTransaction(async (client) => {
    const existingRes = await client.query(
      `select id, revoked_at, last_seen_at from library.staff_sessions where id = $1 and actor_id = $2`,
      [sessionId, actorId]
    );
    const existing = existingRes.rows[0] || null;

    if (existing?.revoked_at) {
      return { revoked: true, idleExpired: false };
    }

    if (idleMinutes && existing?.last_seen_at) {
      const lastSeen = new Date(existing.last_seen_at);
      const diffMs = now.getTime() - lastSeen.getTime();
      if (diffMs > idleMinutes * 60_000) {
        await client.query(`update library.staff_sessions set revoked_at = now() where id = $1`, [sessionId]);
        return { revoked: true, idleExpired: true };
      }
    }

    await client.query(
      `
        insert into library.staff_sessions (id, actor_id, ip, user_agent, last_seen_at)
        values ($1, $2, $3, $4, now())
        on conflict (id) do update set last_seen_at = now(), ip = $3, user_agent = $4
      `,
      [sessionId, actorId, ip, userAgent]
    );

    return { revoked: false, idleExpired: false };
  });

  if (row.revoked) {
    const msg = row.idleExpired ? "Session expired due to inactivity" : "Session revoked";
    logger.warn({ component: "security", actorId, sessionId }, msg);
    throw new AuthenticationError(msg);
  }

  return { sessionId };
}
