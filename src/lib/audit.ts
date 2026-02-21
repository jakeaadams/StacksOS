import "server-only";

import fs from "fs/promises";
import path from "path";
import { callOpenSRF, isOpenSRFEvent } from "@/lib/api";
import { logger } from "@/lib/logger";
import { recordPatronChangeEvent } from "@/lib/db/patron-change";

export interface AuditActor {
  id?: number;
  username?: string;
  name?: string;
  home_ou?: number;
  ws_ou?: number;
  workstation?: string;
}

export interface AuditEvent {
  action: string;
  entity?: string;
  entityId?: string | number;
  status: "success" | "failure";
  details?: Record<string, unknown>;
  actor?: AuditActor | null;
  orgId?: number;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  error?: string | null;
}

const AUDIT_LOG_PATH =
  process.env.STACKSOS_AUDIT_LOG_PATH || path.join(process.cwd(), ".logs", "audit.log");
const AUDIT_MODE = process.env.STACKSOS_AUDIT_MODE || "file"; // file | stdout | off

const REDACT_KEYS = new Set([
  "password",
  "passwd",
  "pin",
  "secret",
  "token",
  "authtoken",
  "session",
]);

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[redacted-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item: any) => scrub(item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = scrub(val, depth + 1);
  }
  return output;
}

export async function getActorFromToken(authtoken?: string | null): Promise<AuditActor | null> {
  if (!authtoken) return null;
  try {
    const response = await callOpenSRF("open-ils.auth", "open-ils.auth.session.retrieve", [
      authtoken,
    ]);
    const user = response?.payload?.[0] as any as any;
    if (!user || isOpenSRFEvent(user)) return null;

    const first = user.first_given_name || "";
    const last = user.family_name || "";

    return {
      id: typeof user.id === "number" ? user.id : undefined,
      username: user.usrname || undefined,
      name: `${first} ${last}`.trim() || undefined,
      home_ou: user.home_ou || undefined,
      ws_ou: user.ws_ou || user.work_ou || undefined,
      workstation: user.workstation || undefined,
    };
  } catch {
    return null;
  }
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  if (AUDIT_MODE === "off") return;

  const sanitized = scrub(event) as AuditEvent;
  const record = {
    ts: new Date().toISOString(),
    channel: "audit",
    ...sanitized,
  };
  const line = `${JSON.stringify(record)}\n`;

  if (AUDIT_MODE === "stdout") {
    process.stdout.write(line);
  } else {
    try {
      await fs.mkdir(path.dirname(AUDIT_LOG_PATH), { recursive: true });
      await fs.appendFile(AUDIT_LOG_PATH, line, "utf8");
    } catch (err: any) {
      const e =
        err instanceof Error ? { name: err.name, message: err.message } : { message: String(err) };
      logger.warn({ error: e, path: AUDIT_LOG_PATH }, "Failed to write audit log");
    }
  }

  // Best-effort: persist patron-change activity into the Evergreen "library" schema.
  // This powers the Staff Activity feed even when Evergreen doesn't expose patron-change history.
  try {
    if (!process.env.EVERGREEN_DB_PASSWORD) return;
    if (sanitized.status !== "success" || sanitized.entity !== "patron") return;
    const rawId = sanitized.entityId;
    const patronId = typeof rawId === "number" ? rawId : parseInt(String(rawId ?? ""), 10);
    if (!Number.isFinite(patronId)) return;

    const details = sanitized.details as any;
    const updates = Array.isArray(details?.updates) ? details.updates : null;
    const changes =
      updates && updates.length
        ? Object.fromEntries(
            updates
              .map((k: unknown) => String(k || "").trim())
              .filter(Boolean)
              .slice(0, 32)
              .map((k: string) => [k, true])
          )
        : null;

    await recordPatronChangeEvent({
      patronId,
      action: sanitized.action,
      actor: {
        id: sanitized.actor?.id,
        username: sanitized.actor?.username,
        name: sanitized.actor?.name,
        workstation: sanitized.actor?.workstation,
      },
      requestId: sanitized.requestId ?? null,
      changes,
    });
  } catch (error: any) {
    logger.warn({ error: String(error) }, "Failed to persist audit activity");
  }
}
