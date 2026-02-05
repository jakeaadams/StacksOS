import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { listPatronChangeEvents } from "@/lib/db/patron-change";

/**
 * Activity Log API
 * Unified activity feed from multiple Evergreen tables:
 * - actor.usr_activity (logins)
 * - action.circulation (checkouts/checkins)
 * - action.hold_request (holds)
 * - money.payment (payments)
 * - auditor.actor_usr_history (patron changes)
 */

// Activity types
type ActivityType = "login" | "checkout" | "checkin" | "hold" | "payment" | "patron_change";

interface Activity {
  id: string;
  type: ActivityType;
  timestamp: string;
  actor: {
    id: number | null;
    username: string | null;
    name: string | null;
  };
  target?: {
    type: string;
    id: number | string;
    label: string;
  };
  details: Record<string, any>;
  workstation?: string;
}

// Helper to safely extract fieldmapper values
function fmGet(value: any, key: string, index?: number): any {
  if (!value || typeof value !== "object") return undefined;
  const direct = (value as any)[key];
  if (direct !== undefined) return direct;
  const arr = (value as any).__p;
  if (Array.isArray(arr) && typeof index === "number") {
    return arr[index];
  }
  return undefined;
}

function fmNumber(value: any, key: string, index?: number): number | undefined {
  const raw = fmGet(value, key, index);
  if (typeof raw === "number") return raw;
  const parsed = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fmString(value: any, key: string, index?: number): string | undefined {
  const raw = fmGet(value, key, index);
  if (raw === null || raw === undefined) return undefined;
  return typeof raw === "string" ? raw : String(raw);
}

// Build date range filter for pcrud queries
function buildDateFilter(startDate?: string, endDate?: string, fieldName: string = "event_time"): Record<string, any> {
  const filter: Record<string, any> = {};

  if (startDate && endDate) {
    filter[fieldName] = { "between": [startDate, endDate] };
  } else if (startDate) {
    filter[fieldName] = { ">=" : startDate };
  } else if (endDate) {
    filter[fieldName] = { "<=" : endDate };
  }

  return filter;
}

// Cache for user lookups
const userCache = new Map<number, { username: string; name: string }>();

// Capability cache: some Evergreen installs do not expose patron-change history
// via pcrud. Avoid repeated calls/log spam if the method is missing.
let patronChangeEvergreenCapability: "unknown" | "supported" | "unsupported" = "unknown";
let patronChangeStacksosCapability: "unknown" | "supported" | "unsupported" = "unknown";

async function getUserInfo(authtoken: string, userId: number): Promise<{ username: string; name: string } | null> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  try {
    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.retrieve",
      [authtoken, userId]
    );
    const user = response?.payload?.[0];
    if (user && !user.ilsevent) {
      const info = {
        username: fmString(user, "usrname", 23) || user.usrname || "unknown",
        name: `${fmString(user, "first_given_name", 26) || user.first_given_name || ""} ${fmString(user, "family_name", 25) || user.family_name || ""}`.trim() || "Unknown",
      };
      userCache.set(userId, info);
      return info;
    }
  } catch {
    // Ignore lookup errors
  }
  return null;
}

// Fetch login activities from actor.usr_activity
async function fetchLoginActivities(
  authtoken: string,
  limit: number,
  offset: number,
  userId?: number,
  startDate?: string,
  endDate?: string
): Promise<Activity[]> {
  const filter: Record<string, any> = { id: { "!=" : null } };

  if (userId) {
    filter.usr = userId;
  }

  Object.assign(filter, buildDateFilter(startDate, endDate, "event_time"));

  try {
    const response = await callOpenSRF(
      "open-ils.pcrud",
      "open-ils.pcrud.search.auact.atomic",
      [authtoken, filter, { limit, offset, order_by: { auact: "event_time DESC" } }]
    );

    const activities = response?.payload?.[0];
    if (!Array.isArray(activities)) return [];

    const results: Activity[] = [];
    for (const act of activities) {
      const actorId = fmNumber(act, "usr", 3);
      const userInfo = actorId ? await getUserInfo(authtoken, actorId) : null;

      results.push({
        id: `login-${fmNumber(act, "id", 0) || act.id}`,
        type: "login",
        timestamp: fmString(act, "event_time", 1) || act.event_time || new Date().toISOString(),
        actor: {
          id: actorId || null,
          username: userInfo?.username || null,
          name: userInfo?.name || null,
        },
        details: {
          etype: fmNumber(act, "etype", 2) || act.etype,
        },
        workstation: undefined,
      });
    }

    return results;
  } catch (error) {
    logger.warn({ error: String(error) }, "Failed to fetch login activities");
    return [];
  }
}

// Fetch circulation activities (checkouts/checkins) from action.circulation
async function fetchCirculationActivities(
  authtoken: string,
  limit: number,
  offset: number,
  activityType: "checkout" | "checkin" | "all",
  userId?: number,
  startDate?: string,
  endDate?: string
): Promise<Activity[]> {
  const filter: Record<string, any> = { id: { "!=" : null } };

  if (userId) {
    filter.usr = userId;
  }

  // For checkouts, use xact_start; for checkins, use checkin_time
  if (activityType === "checkin") {
    filter.checkin_time = { "!=" : null };
    Object.assign(filter, buildDateFilter(startDate, endDate, "checkin_time"));
  } else if (activityType === "checkout") {
    Object.assign(filter, buildDateFilter(startDate, endDate, "xact_start"));
  } else {
    // For "all", we just filter by xact_start
    Object.assign(filter, buildDateFilter(startDate, endDate, "xact_start"));
  }

  try {
    const orderField = activityType === "checkin" ? "checkin_time" : "xact_start";
    const response = await callOpenSRF(
      "open-ils.pcrud",
      "open-ils.pcrud.search.circ.atomic",
      [authtoken, filter, {
        limit,
        offset,
        order_by: { circ: `${orderField} DESC` },
        flesh: 1,
        flesh_fields: { circ: ["target_copy"] }
      }]
    );

    const circs = response?.payload?.[0];
    if (!Array.isArray(circs)) return [];

    const results: Activity[] = [];
    for (const circ of circs) {
      const patronId = fmNumber(circ, "usr", 5);
      const userInfo = patronId ? await getUserInfo(authtoken, patronId) : null;
      const copyBarcode = fmString(circ.target_copy, "barcode", 2) || circ.target_copy?.barcode || "Unknown";
      const copyId = fmNumber(circ, "target_copy", 12) || circ.target_copy?.id;

      const checkinTime = fmString(circ, "checkin_time", 2) || circ.checkin_time;
      const xactStart = fmString(circ, "xact_start", 24) || circ.xact_start;
      const dueDate = fmString(circ, "due_date", 6) || circ.due_date;

      // Determine if this is a checkout or checkin record
      const isCheckin = Boolean(checkinTime);
      const timestamp = isCheckin ? checkinTime : xactStart;
      const type: ActivityType = isCheckin ? "checkin" : "checkout";

      // Skip if filtering by specific type and this doesn't match
      if (activityType === "checkout" && isCheckin) continue;
      if (activityType === "checkin" && !isCheckin) continue;

      results.push({
        id: `circ-${fmNumber(circ, "id", 10) || circ.id}-${type}`,
        type,
        timestamp: timestamp || new Date().toISOString(),
        actor: {
          id: patronId || null,
          username: userInfo?.username || null,
          name: userInfo?.name || null,
        },
        target: {
          type: "copy",
          id: copyId || 0,
          label: copyBarcode,
        },
        details: {
          circ_id: fmNumber(circ, "id", 10) || circ.id,
          due_date: dueDate,
          circ_lib: fmNumber(circ, "circ_lib", 4) || circ.circ_lib,
        },
        workstation: fmString(circ, "workstation", 27) || circ.workstation || undefined,
      });
    }

    return results;
  } catch (error) {
    logger.warn({ error: String(error) }, "Failed to fetch circulation activities");
    return [];
  }
}

// Fetch hold activities from action.hold_request
async function fetchHoldActivities(
  authtoken: string,
  limit: number,
  offset: number,
  userId?: number,
  startDate?: string,
  endDate?: string
): Promise<Activity[]> {
  const filter: Record<string, any> = { id: { "!=" : null } };

  if (userId) {
    filter.usr = userId;
  }

  Object.assign(filter, buildDateFilter(startDate, endDate, "request_time"));

  try {
    const response = await callOpenSRF(
      "open-ils.pcrud",
      "open-ils.pcrud.search.ahr.atomic",
      [authtoken, filter, {
        limit,
        offset,
        order_by: { ahr: "request_time DESC" }
      }]
    );

    const holds = response?.payload?.[0];
    if (!Array.isArray(holds)) return [];

    const results: Activity[] = [];
    for (const hold of holds) {
      const patronId = fmNumber(hold, "usr", 3);
      const userInfo = patronId ? await getUserInfo(authtoken, patronId) : null;
      const holdType = fmString(hold, "hold_type", 5) || hold.hold_type || "T";
      const targetId = fmNumber(hold, "target", 6) || hold.target;

      results.push({
        id: `hold-${fmNumber(hold, "id", 0) || hold.id}`,
        type: "hold",
        timestamp: fmString(hold, "request_time", 1) || hold.request_time || new Date().toISOString(),
        actor: {
          id: patronId || null,
          username: userInfo?.username || null,
          name: userInfo?.name || null,
        },
        target: {
          type: holdType === "T" ? "title" : holdType === "C" ? "copy" : holdType === "V" ? "volume" : "item",
          id: targetId || 0,
          label: `${holdType} hold #${fmNumber(hold, "id", 0) || hold.id}`,
        },
        details: {
          hold_id: fmNumber(hold, "id", 0) || hold.id,
          hold_type: holdType,
          pickup_lib: fmNumber(hold, "pickup_lib", 7) || hold.pickup_lib,
          frozen: fmGet(hold, "frozen", 14) || hold.frozen,
          fulfillment_time: fmString(hold, "fulfillment_time", 15) || hold.fulfillment_time,
          cancel_time: fmString(hold, "cancel_time", 17) || hold.cancel_time,
        },
        workstation: undefined,
      });
    }

    return results;
  } catch (error) {
    logger.warn({ error: String(error) }, "Failed to fetch hold activities");
    return [];
  }
}

// Fetch payment activities from money.payment
async function fetchPaymentActivities(
  authtoken: string,
  limit: number,
  offset: number,
  userId?: number,
  startDate?: string,
  endDate?: string
): Promise<Activity[]> {
  const filter: Record<string, any> = { id: { "!=" : null } };

  // Payments link to xact (transaction), which links to usr
  // We'll filter by xact if user specified

  Object.assign(filter, buildDateFilter(startDate, endDate, "payment_ts"));

  try {
    const response = await callOpenSRF(
      "open-ils.pcrud",
      "open-ils.pcrud.search.mp.atomic",
      [authtoken, filter, {
        limit,
        offset,
        order_by: { mp: "payment_ts DESC" },
        flesh: 1,
        flesh_fields: { mp: ["xact"] }
      }]
    );

    const payments = response?.payload?.[0];
    if (!Array.isArray(payments)) return [];

    const results: Activity[] = [];
    for (const payment of payments) {
      const xact = payment.xact;
      const patronId = xact ? (fmNumber(xact, "usr", 5) || xact.usr) : null;

      // Skip if filtering by user and this doesn't match
      if (userId && patronId !== userId) continue;

      const userInfo = patronId ? await getUserInfo(authtoken, patronId) : null;
      const amount = fmString(payment, "amount", 3) || payment.amount || "0.00";
      const paymentType = fmString(payment, "payment_type", 5) || payment.payment_type || "unknown";

      results.push({
        id: `payment-${fmNumber(payment, "id", 0) || payment.id}`,
        type: "payment",
        timestamp: fmString(payment, "payment_ts", 2) || payment.payment_ts || new Date().toISOString(),
        actor: {
          id: patronId || null,
          username: userInfo?.username || null,
          name: userInfo?.name || null,
        },
        target: {
          type: "transaction",
          id: fmNumber(payment, "xact", 1) || payment.xact?.id || 0,
          label: `Payment of $${amount}`,
        },
        details: {
          payment_id: fmNumber(payment, "id", 0) || payment.id,
          amount: parseFloat(amount),
          payment_type: paymentType,
          note: fmString(payment, "note", 7) || payment.note,
          accepting_usr: fmNumber(payment, "accepting_usr", 4) || payment.accepting_usr,
        },
        workstation: undefined,
      });
    }

    return results;
  } catch (error) {
    logger.warn({ error: String(error) }, "Failed to fetch payment activities");
    return [];
  }
}

// Fetch patron change activities from auditor.actor_usr_history
async function fetchPatronChangeActivities(
  authtoken: string,
  limit: number,
  offset: number,
  userId?: number,
  startDate?: string,
  endDate?: string
): Promise<Activity[]> {
  const desiredWindow = Math.min(limit + offset, 200);
  const evergreenSupported = patronChangeEvergreenCapability !== "unsupported";

  function auditLogPath(): string {
    return (
      process.env.STACKSOS_AUDIT_LOG_PATH ||
      path.join(process.cwd(), ".logs", "audit.log")
    );
  }

  async function fetchStacksosFromAuditLog(): Promise<Activity[]> {
    const mode = process.env.STACKSOS_AUDIT_MODE || "file";
    if (mode === "off") return [];

    const filePath = auditLogPath();
    const maxBytes = 1024 * 1024; // 1MB tail window

    const stat = await fs.stat(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fh = await fs.open(filePath, "r");
    try {
      const buf = Buffer.alloc(stat.size - start);
      const read = await fh.read(buf, 0, buf.length, start);
      const text = buf.toString("utf8", 0, read.bytesRead);
      const rawLines = text.split(/\r?\n/);
      const lines = start > 0 ? rawLines.slice(1) : rawLines;

      const results: Activity[] = [];
      for (let i = lines.length - 1; i >= 0 && results.length < desiredWindow; i--) {
        const line = lines[i];
        if (!line || line.length < 2) continue;
        let rec: any;
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }

        if (rec?.channel !== "audit" || rec?.status !== "success" || rec?.entity !== "patron") continue;

        const rawId = rec?.entityId;
        const patronId = typeof rawId === "number" ? rawId : parseInt(String(rawId ?? ""), 10);
        if (!Number.isFinite(patronId)) continue;
        if (userId && patronId !== userId) continue;

        const ts = typeof rec?.ts === "string" ? rec.ts : "";
        if (startDate && ts && ts < startDate) continue;
        if (endDate && ts && ts > endDate) continue;

        const updates = Array.isArray(rec?.details?.updates) ? rec.details.updates : null;
        const changes =
          updates && updates.length
            ? Object.fromEntries(
                updates
                  .map((k: unknown) => String(k || "").trim())
                  .filter(Boolean)
                  .slice(0, 32)
                  .map((k: string) => [k, true])
              )
            : {};

        const patronInfo = await getUserInfo(authtoken, patronId);

        results.push({
          id: `patron_change-stacksos-log-${rec?.requestId || rec?.ts || i}-${patronId}`,
          type: "patron_change",
          timestamp: ts || new Date().toISOString(),
          actor: {
            id: rec?.actor?.id ?? null,
            username: rec?.actor?.username ?? null,
            name: rec?.actor?.name ?? null,
          },
          target: {
            type: "patron",
            id: patronId,
            label: patronInfo?.name || `Patron #${patronId}`,
          },
          details: {
            source: "stacksos",
            action: rec?.action,
            changes,
          },
          workstation: rec?.actor?.workstation || undefined,
        });
      }

      return results;
    } finally {
      await fh.close();
    }
  }

  async function fetchStacksos(): Promise<{ activities: Activity[]; available: boolean }> {
    try {
      const rows = await listPatronChangeEvents({
        limit: desiredWindow,
        offset: 0,
        patronId: userId,
        startDate,
        endDate,
      });

      const results: Activity[] = [];
      for (const row of rows) {
        const patronId = row.patron_id;
        const patronInfo = await getUserInfo(authtoken, patronId);
        const actorLabel = row.actor_name || row.actor_username || null;

        results.push({
          id: `patron_change-stacksos-${row.id}`,
          type: "patron_change",
          timestamp: row.occurred_at ? new Date(row.occurred_at).toISOString() : new Date().toISOString(),
          actor: {
            id: row.actor_id ?? null,
            username: row.actor_username ?? null,
            name: actorLabel,
          },
          target: {
            type: "patron",
            id: patronId,
            label: patronInfo?.name || `Patron #${patronId}`,
          },
          details: {
            source: "stacksos",
            action: row.action,
            changes: row.changes || {},
          },
          workstation: row.workstation || undefined,
        });
      }

      patronChangeStacksosCapability = "supported";
      return { activities: results, available: true };
    } catch (error) {
      // DB fallback may be unavailable if the Evergreen DB user lacks CREATE privileges in `library`.
      // Fall back to parsing the StacksOS audit log file (best-effort).
      try {
        const fromLog = await fetchStacksosFromAuditLog();
        if (fromLog.length > 0 || (process.env.STACKSOS_AUDIT_MODE || "file") !== "off") {
          patronChangeStacksosCapability = "supported";
          return { activities: fromLog, available: true };
        }
      } catch (e) {
        logger.warn({ error: String(e) }, "StacksOS audit-log patron-change fallback unavailable");
      }

      logger.warn({ error: String(error) }, "StacksOS patron-change fallback unavailable");
      patronChangeStacksosCapability = "unsupported";
      return { activities: [], available: false };
    }
  }

  async function fetchEvergreen(): Promise<Activity[]> {
    if (!evergreenSupported) return [];

    const filter: Record<string, any> = { id: { "!=": null } };

    if (userId) {
      filter.id = userId; // In history table, id is the user id
    }

    Object.assign(filter, buildDateFilter(startDate, endDate, "audit_time"));

    try {
      let response: any;
      try {
        response = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.auacth.atomic",
          [
            authtoken,
            filter,
            {
              limit: desiredWindow,
              offset: 0,
              order_by: { auacth: "audit_time DESC" },
            },
          ]
        );
      } catch (error) {
        const code = typeof (error as any)?.code === "string" ? String((error as any).code) : "";
        // Some Evergreen installs expose the non-atomic variant only.
        if (code === "OSRF_METHOD_NOT_FOUND") {
          response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.search.auacth",
            [
              authtoken,
              filter,
              {
                limit: desiredWindow,
                offset: 0,
                order_by: { auacth: "audit_time DESC" },
              },
            ]
          );
        } else {
          throw error;
        }
      }

      const history = response?.payload?.[0];
      if (!Array.isArray(history)) return [];

      patronChangeEvergreenCapability = "supported";

      const results: Activity[] = [];
      for (const record of history) {
        const patronId = fmNumber(record, "id", 0) || record.id;
        const userInfo = patronId ? await getUserInfo(authtoken, patronId) : null;

        results.push({
          id: `patron_change-${record.audit_id || fmNumber(record, "audit_id")}-${patronId}`,
          type: "patron_change",
          timestamp: fmString(record, "audit_time") || record.audit_time || new Date().toISOString(),
          // Evergreen-side payloads vary by version/install. When we don't have a reliable staff actor
          // column, treat this as a patron-targeted audit row and surface the patron as the primary label.
          actor: {
            id: patronId || null,
            username: userInfo?.username || null,
            name: userInfo?.name || null,
          },
          target: {
            type: "patron",
            id: patronId || 0,
            label: userInfo?.name || `Patron #${patronId}`,
          },
          details: {
            source: "evergreen",
            audit_id: record.audit_id || fmNumber(record, "audit_id"),
            changes: extractPatronChanges(record),
          },
          workstation: undefined,
        });
      }

      return [];
    } catch (error) {
      const code = typeof (error as any)?.code === "string" ? String((error as any).code) : "";
      if (code === "OSRF_METHOD_NOT_FOUND") {
        patronChangeEvergreenCapability = "unsupported";
        return [];
      }
      logger.warn({ error: String(error) }, "Failed to fetch patron change activities");
      return [];
    }
  }

  const [evergreen, stacksos] = await Promise.all([fetchEvergreen(), fetchStacksos()]);
  const activities = [...evergreen, ...stacksos.activities].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeB - timeA;
  });

  return activities.slice(offset, offset + limit);
}

// Extract meaningful changes from patron history record
function extractPatronChanges(record: any): Record<string, any> {
  const changes: Record<string, any> = {};
  const fields = ["email", "day_phone", "evening_phone", "other_phone", "home_ou", "profile", "expire_date", "barred", "active"];

  for (const field of fields) {
    const value = fmGet(record, field) || record[field];
    if (value !== undefined && value !== null) {
      changes[field] = value;
    }
  }

  return changes;
}

export async function GET(req: NextRequest) {
  try {
    const { authtoken, actor: _actor } = await requirePermissions(["STAFF_LOGIN"]);
    const searchParams = req.nextUrl.searchParams;

    // Parse query parameters
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const type = searchParams.get("type") || "all";
    const userIdParam = searchParams.get("user_id");
    const userId = userIdParam ? parseInt(userIdParam, 10) : undefined;
    const startDate = searchParams.get("start_date") || undefined;
    const endDate = searchParams.get("end_date") || undefined;

    logger.debug({
      route: "api.evergreen.activity",
      type,
      limit,
      offset,
      userId,
      startDate,
      endDate
    }, "Activity log request");

    // Validate type parameter
    const validTypes = ["login", "circulation", "checkout", "checkin", "hold", "payment", "patron_change", "all"];
    if (!validTypes.includes(type)) {
      return errorResponse(`Invalid type. Must be one of: ${validTypes.join(", ")}`, 400);
    }

    let activities: Activity[] = [];

    // Fetch activities based on type
    if (type === "all") {
      // Fetch from all sources in parallel with reduced limits
      // For offset pagination across multiple sources, we need enough rows from each
      // source so that sorting + slicing can return the requested window.
      // This is not perfect (new rows can shift pages), but it avoids "page 2 is empty"
      // when offset > 0.
      const perSourceLimit = Math.min(Math.ceil((limit + offset) / 5), 200);

      const [logins, circs, holds, payments, patronChanges] = await Promise.all([
        fetchLoginActivities(authtoken, perSourceLimit, 0, userId, startDate, endDate),
        fetchCirculationActivities(authtoken, perSourceLimit, 0, "all", userId, startDate, endDate),
        fetchHoldActivities(authtoken, perSourceLimit, 0, userId, startDate, endDate),
        fetchPaymentActivities(authtoken, perSourceLimit, 0, userId, startDate, endDate),
        fetchPatronChangeActivities(authtoken, perSourceLimit, 0, userId, startDate, endDate),
      ]);

      activities = [...logins, ...circs, ...holds, ...payments, ...patronChanges];
    } else if (type === "login") {
      activities = await fetchLoginActivities(authtoken, limit, offset, userId, startDate, endDate);
    } else if (type === "circulation") {
      activities = await fetchCirculationActivities(authtoken, limit, offset, "all", userId, startDate, endDate);
    } else if (type === "checkout") {
      activities = await fetchCirculationActivities(authtoken, limit, offset, "checkout", userId, startDate, endDate);
    } else if (type === "checkin") {
      activities = await fetchCirculationActivities(authtoken, limit, offset, "checkin", userId, startDate, endDate);
    } else if (type === "hold") {
      activities = await fetchHoldActivities(authtoken, limit, offset, userId, startDate, endDate);
    } else if (type === "payment") {
      activities = await fetchPaymentActivities(authtoken, limit, offset, userId, startDate, endDate);
    } else if (type === "patron_change") {
      activities = await fetchPatronChangeActivities(authtoken, limit, offset, userId, startDate, endDate);
    }

    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    // Apply limit for "all" type (since we fetched from multiple sources)
    if (type === "all") {
      activities = activities.slice(offset, offset + limit);
    }

    // Clear user cache after request (to avoid memory leaks)
    userCache.clear();

    return successResponse({
      activities,
      capabilities: {
        patron_change: !(
          patronChangeEvergreenCapability === "unsupported" &&
          patronChangeStacksosCapability === "unsupported"
        ),
      },
      pagination: {
        limit,
        offset,
        count: activities.length,
        type,
      },
      filters: {
        user_id: userId || null,
        start_date: startDate || null,
        end_date: endDate || null,
      },
    });
  } catch (err: any) {
    if (err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Activity GET", req);
  }
}
