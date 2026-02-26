import { NextRequest } from "next/server";
import {
  callOpenSRF,
  getRequestMeta,
  isOpenSRFEvent,
  requireAuthToken,
  successResponse,
  serverErrorResponse,
} from "@/lib/api";
import { getActorFromToken } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z as _z } from "zod";

function normalizePermPayload(payload: unknown, perms: string[]): Record<string, boolean> | null {
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
      payload.forEach((entry) => {
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
        map[perm] = Boolean((payload as Record<string, any>)[perm]);
      }
    }
    if (Object.keys(map).length > 0) return map;
  }

  return null;
}

async function checkPerms(
  authtoken: string,
  perms: string[],
  orgId?: number
): Promise<Record<string, boolean> | null> {
  const attempts: unknown[][] = [];
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
    if (map) return map;
  }

  if (lastEvent) {
    logger.warn({ event: lastEvent, perms, orgId }, "Permission check returned OpenSRF event");
  }

  return null;
}

// GET /api/evergreen/perm-check?perms=COPY_CHECKOUT,COPY_CHECKIN,VIEW_USER
export async function GET(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const authtoken = await requireAuthToken();
    const actor = await getActorFromToken(authtoken);
    const orgId = actor?.ws_ou ?? actor?.home_ou;

    const raw = String(req.nextUrl.searchParams.get("perms") || "").trim();
    const perms = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 200);

    if (perms.length === 0) {
      return successResponse({ perms: {}, orgId: orgId || null });
    }

    const map = await checkPerms(authtoken, perms, orgId);
    if (!map) {
      return successResponse({
        perms: Object.fromEntries(perms.map((p) => [p, false])),
        orgId: orgId || null,
        message: "Permission check failed; returning all false",
        requestId,
      });
    }

    return successResponse({ perms: map, orgId: orgId || null });
  } catch (error) {
    return serverErrorResponse(error, "Perm-check GET", req);
  }
}
