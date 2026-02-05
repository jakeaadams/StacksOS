import { callOpenSRF, isOpenSRFEvent, requireAuthToken } from "@/lib/api";
import { getActorFromToken } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { requireStaffSession } from "@/lib/session/staff-session";

export type RbacMode = "strict" | "warn" | "off";

export interface PermissionCheckResult {
  ok: boolean;
  missing: string[];
  perms: Record<string, boolean>;
  orgId?: number;
}

export class PermissionError extends Error {
  missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = "PermissionError";
    this.missing = missing;
  }
}

function resolveRbacMode(): RbacMode {
  const raw = String(process.env.STACKSOS_RBAC_MODE || "").trim().toLowerCase();
  if (raw === "strict" || raw === "warn" || raw === "off") return raw;
  return process.env.NODE_ENV === "production" ? "strict" : "warn";
}

const RBAC_MODE = resolveRbacMode();

function normalizePermPayload(payload: any, perms: string[]): Record<string, boolean> | null {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    if (payload.length === perms.length) {
      const map: Record<string, boolean> = {};
      perms.forEach((perm, idx) => {
        map[perm] = Boolean(payload[idx]);
      });
      return map;
    }

    if (payload.length > 0 && typeof payload[0] === "object") {
      const map: Record<string, boolean> = {};
      payload.forEach((entry: any) => {
        const key = entry.perm || entry.code || entry.name;
        if (key) map[key] = Boolean(entry.value ?? entry.allowed ?? entry.granted ?? entry.result);
      });
      if (Object.keys(map).length > 0) return map;
    }
  }

  if (typeof payload === "object") {
    const map: Record<string, boolean> = {};
    for (const perm of perms) {
      if (perm in payload) {
        map[perm] = Boolean(payload[perm]);
      }
    }
    if (Object.keys(map).length > 0) return map;
  }

  return null;
}

async function tryPermCheck(authtoken: string, perms: string[], orgId?: number) {
  const attempts: any[][] = [];
  attempts.push([authtoken, perms]);
  if (orgId) {
    attempts.push([authtoken, orgId, perms]);
    attempts.push([authtoken, perms, orgId]);
  }

  let lastEvent: any = null;
  for (const params of attempts) {
    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.has_work_perm_at.batch",
      params
    );
    const payload = response?.payload?.[0];
    if (isOpenSRFEvent(payload)) {
      lastEvent = payload;
      continue;
    }
    const map = normalizePermPayload(payload, perms);
    if (map) {
      return { map, event: null };
    }
  }

  return { map: null as Record<string, boolean> | null, event: lastEvent };
}

export async function requirePermissions(perms: string[], orgId?: number): Promise<{
  authtoken: string;
  actor: any;
  result: PermissionCheckResult;
}> {
  const authtoken = await requireAuthToken();

  if (RBAC_MODE === "off") {
    return {
      authtoken,
      actor: await getActorFromToken(authtoken),
      result: { ok: true, missing: [], perms: {}, orgId },
    };
  }

  const actor = await getActorFromToken(authtoken);
  const actorId = typeof actor?.id === "number" ? actor.id : parseInt(String(actor?.id ?? ""), 10);
  if (Number.isFinite(actorId)) {
    await requireStaffSession(actorId);
  }
  const resolvedOrgId = orgId ?? actor?.ws_ou ?? actor?.home_ou;

  const { map, event } = await tryPermCheck(authtoken, perms, resolvedOrgId);

  if (!map) {
    const message = event?.textcode || event?.desc || "Permission check failed";
    if (RBAC_MODE === "warn") {
      logger.warn({ component: "rbac", orgId: resolvedOrgId, perms, message }, "RBAC warn: permission check failed");
      return {
        authtoken,
        actor,
        result: { ok: true, missing: [], perms: {}, orgId: resolvedOrgId },
      };
    }
    throw new PermissionError(message);
  }

  const missing = perms.filter((perm) => !map[perm]);

  if (missing.length > 0) {
    if (RBAC_MODE === "warn") {
      logger.warn({ component: "rbac", orgId: resolvedOrgId, missing }, "RBAC warn: missing permissions");
      return {
        authtoken,
        actor,
        result: { ok: true, missing: [], perms: map, orgId: resolvedOrgId },
      };
    }
    throw new PermissionError("Permission denied", missing);
  }

  return {
    authtoken,
    actor,
    result: { ok: true, missing: [], perms: map, orgId: resolvedOrgId },
  };
}
