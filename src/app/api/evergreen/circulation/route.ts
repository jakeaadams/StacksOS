import { NextRequest } from "next/server";
import {

  callOpenSRF,
  requireAuthToken,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  isSuccessResult,
  getErrorMessage,
  getCopyByBarcode,
  getRequestMeta,
  parseJsonBodyWithSchema,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { z } from "zod";


const ACTION_PERMS: Record<string, string[]> = {
  checkout: ["COPY_CHECKOUT"],
  checkin: ["COPY_CHECKIN"],
  renew: ["RENEW_CIRC"],
  place_hold: ["TITLE_HOLDS"],
  cancel_hold: ["CANCEL_HOLDS"],
  suspend_hold: ["UPDATE_HOLD"],
  activate_hold: ["UPDATE_HOLD"],
  pay_bills: ["CREATE_PAYMENT"],
  in_house_use: ["CREATE_IN_HOUSE_USE"],
};

const circulationBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("checkout"),
    patronBarcode: z.string().trim().min(1),
    itemBarcode: z.string().trim().min(1),
    override: z.boolean().optional(),
    overrideReason: z.string().trim().max(256).optional(),
  }).passthrough(),
  z.object({
    action: z.literal("checkin"),
    itemBarcode: z.string().trim().min(1).optional(),
    copyId: z.coerce.number().int().positive().optional(),
  }).refine((b) => Boolean(b.itemBarcode) || Boolean(b.copyId), {
    message: "itemBarcode or copyId required",
    path: ["itemBarcode"],
  }).passthrough(),
  z.object({
    action: z.literal("renew"),
    itemBarcode: z.string().trim().min(1).optional(),
    copyId: z.coerce.number().int().positive().optional(),
  }).refine((b) => Boolean(b.itemBarcode) || Boolean(b.copyId), {
    message: "itemBarcode or copyId required",
    path: ["itemBarcode"],
  }).passthrough(),
  z.object({
    action: z.literal("place_hold"),
    patron_id: z.coerce.number().int().positive(),
    target_id: z.union([z.coerce.number().int().positive(), z.string().trim().min(1)]),
    pickup_lib: z.coerce.number().int().positive(),
    hold_type: z.enum(["T", "V", "C"]).optional(),
  }).passthrough(),
  z.object({
    action: z.literal("cancel_hold"),
    hold_id: z.coerce.number().int().positive(),
  }).passthrough(),
  z.object({
    action: z.literal("suspend_hold"),
    hold_id: z.coerce.number().int().positive(),
  }).passthrough(),
  z.object({
    action: z.literal("activate_hold"),
    hold_id: z.coerce.number().int().positive(),
  }).passthrough(),
  z.object({
    action: z.literal("pay_bills"),
    patron_id: z.coerce.number().int().positive(),
    payment_type: z.string().trim().min(1).optional(),
    payments: z.array(z.object({
      amount: z.union([z.number(), z.string()]),
    }).passthrough()).min(1),
  }).passthrough(),
  z.object({
    action: z.literal("in_house_use"),
    itemBarcode: z.string().trim().min(1),
    orgId: z.coerce.number().int().positive().optional(),
    count: z.coerce.number().int().positive().optional(),
  }).passthrough(),
]);

function resolvePerms(action: string, body: any) {
  if (action === "place_hold" && body?.hold_type === "C") {
    return ["COPY_HOLDS"];
  }
  return ACTION_PERMS[action] || ["STAFF_LOGIN"];
}

function fmGet(value: unknown, key: string, index?: number) {
  if (!value || typeof value !== "object") return undefined;

  const direct = (value as Record<string, any>)[key];
  if (direct !== undefined) return direct;

  const arr = (value as Record<string, any>).__p;
  if (Array.isArray(arr) && typeof index === "number") {
    return arr[index];
  }

  return undefined;
}

function fmNumber(value: unknown, key: string, index?: number): number | undefined {
  const raw = fmGet(value, key, index);
  if (typeof raw === "number") return raw;
  const parsed = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fmString(value: unknown, key: string, index?: number): string | undefined {
  const raw = fmGet(value, key, index);
  if (raw === null || raw === undefined) return undefined;
  return typeof raw === "string" ? raw : String(raw);
}

// POST - Checkout, Checkin, Renew, Hold operations
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const bodyParsed = await parseJsonBodyWithSchema(req, circulationBodySchema);
    if (bodyParsed instanceof Response) return bodyParsed;
    const body = bodyParsed;
    const {
      action,
      patronBarcode,
      itemBarcode,
      copyId,
      hold_id,
      patron_id,
      target_id,
      pickup_lib,
      hold_type,
      override,
      overrideReason,
    } = body as Record<string, any>;

    const { authtoken, actor } = await requirePermissions(resolvePerms(action, body));

    const audit = async (status: "success" | "failure", details?: Record<string, any>, error?: string) => {
      await logAuditEvent({
        action: `circ.${action}`,
        status,
        actor,
        ip,
        userAgent,
        requestId,
        details,
        error: error || null,
      });
    };

    logger.info({ requestId, route: "api.evergreen.circulation", action }, "Circulation action");

    switch (action) {
      case "checkout": {
        if (!patronBarcode || !itemBarcode) {
          return errorResponse("Patron and item barcode required", 400);
        }

        const checkoutMethod = override
          ? "open-ils.circ.checkout.full.override"
          : "open-ils.circ.checkout.full";

        const checkoutResponse = await callOpenSRF(
          "open-ils.circ",
          checkoutMethod,
          [authtoken, { patron_barcode: patronBarcode, copy_barcode: itemBarcode }]
        );

        const result = checkoutResponse?.payload?.[0] as any;

        if (result?.ilsevent === 0 || result?.payload?.circ) {
          const circ = result.payload?.circ || result.circ;
          const circId = fmNumber(circ, "id", 10);
          const dueDate = fmString(circ, "due_date", 6);
          const itemInfo = await fetchItemDetailsByBarcode(itemBarcode);

          await audit("success", {
            patronBarcode,
            itemBarcode,
            circId,
            override: Boolean(override),
            overrideReason: overrideReason ? String(overrideReason).slice(0, 256) : null,
          });

          return successResponse({
            action: "checkout",
            circulation: {
              id: circId,
              dueDate,
              copyBarcode: itemBarcode,
              ...itemInfo,
            },
          });
        }

        const code = typeof result?.textcode === "string" ? result.textcode : undefined;
        const desc = typeof result?.desc === "string" ? result.desc.trim() : "";
        const message = desc || code || getErrorMessage(result, "Checkout failed");

        const overridePerm = code ? `${code}.override` : null;
        const overrideEligible =
          Boolean(overridePerm) &&
          !["OPEN_CIRCULATION_EXISTS", "ASSET_COPY_NOT_FOUND", "ACTOR_USER_NOT_FOUND"].includes(code || "");

        await audit(
          "failure",
          {
            patronBarcode,
            itemBarcode,
            code,
            override: Boolean(override),
            overridePerm,
            overrideEligible,
            overrideReason: overrideReason ? String(overrideReason).slice(0, 256) : null,
          },
          message
        );

        return errorResponse(message, 409, {
          code,
          desc,
          overridePerm,
          overrideEligible,
          requestId,
        });
      }

      case "checkin": {
        if (!itemBarcode && !copyId) {
          return errorResponse("Item barcode required", 400);
        }

        const checkinMethod = override
          ? "open-ils.circ.checkin.override"
          : "open-ils.circ.checkin";

        const checkinResponse = await callOpenSRF(
          "open-ils.circ",
          checkinMethod,
          [authtoken, { copy_barcode: itemBarcode, copy_id: copyId, override: Boolean(override) }]
        );

        const result = checkinResponse?.payload?.[0] as any;

        if (result?.ilsevent === 0 || result?.payload) {
          const resolvedBarcode =
            typeof itemBarcode === "string" && itemBarcode.trim()
              ? itemBarcode.trim()
              : (typeof (result as any)?.payload?.copy_barcode === "string"
                  ? String((result as any).payload.copy_barcode)
                  : "");
          const itemInfo = resolvedBarcode
            ? await fetchItemDetailsByBarcode(resolvedBarcode)
            : { title: "Item", author: "", callNumber: "" };
          const response: Record<string, any> = {
            action: "checkin",
            copyBarcode: resolvedBarcode || null,
            status: "checked_in",
            ...itemInfo,
          };

          if (result.payload?.hold) {
            response.hold = { id: result.payload.hold.id, patronId: result.payload.hold.usr };
            response.status = "hold_captured";
          } else if (result.payload?.transit) {
            response.transit = { destination: result.payload.transit.dest };
            response.status = "in_transit";
          }

          const circ = result.payload?.circ;
          const dueRaw = fmString(circ, "due_date", 6);
          const checkinRaw = fmString(circ, "checkin_time", 2);

          if (dueRaw && checkinRaw) {
            const dueDate = new Date(dueRaw);
            const checkinTime = new Date(checkinRaw);
            if (!Number.isNaN(dueDate.getTime()) && !Number.isNaN(checkinTime.getTime())) {
              response.wasOverdue = checkinTime > dueDate;
            }
          }

          await audit("success", {
            itemBarcode,
            status: response.status,
            holdId: response.hold?.id,
            transit: response.transit?.destination,
            override: Boolean(override),
          });

          return successResponse(response);
        }

        const message = getErrorMessage(result, "Checkin failed");
        await audit("failure", { itemBarcode, override: Boolean(override) }, message);
        return errorResponse(message, 400, result);
      }

      case "renew": {
        if (!itemBarcode && !copyId) {
          return errorResponse("Item barcode required", 400);
        }

        const renewResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.renew",
          [authtoken, { copy_barcode: itemBarcode, copy_id: copyId }]
        );

        const result = renewResponse?.payload?.[0] as any;

        if (result?.ilsevent === 0 || result?.payload?.circ) {
          const circ = result.payload?.circ || result.circ;
          const circId = fmNumber(circ, "id", 10);
          const dueDate = fmString(circ, "due_date", 6);
          const resolvedBarcode =
            typeof itemBarcode === "string" && itemBarcode.trim()
              ? itemBarcode.trim()
              : (typeof (result as any)?.payload?.copy_barcode === "string"
                  ? String((result as any).payload.copy_barcode)
                  : "");

          await audit("success", {
            itemBarcode,
            circId,
          });

          return successResponse({
            action: "renew",
            circulation: { id: circId, dueDate, copyBarcode: resolvedBarcode || null },
          });
        }

        const message = getErrorMessage(result, "Renewal failed");
        await audit("failure", { itemBarcode }, message);
        return errorResponse(message, 400, result);
      }

      case "place_hold": {
        if (!patron_id || !target_id || !pickup_lib) {
          return errorResponse("patron_id, target_id, and pickup_lib required", 400);
        }

        const params: Record<string, any> = {
          patronid: patron_id,
          pickup_lib,
          hold_type: hold_type || "T",
        };

        const holdResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.holds.test_and_create.batch",
          [authtoken, params, [target_id]]
        );

        const raw = holdResponse?.payload?.[0] as any;
        const result = Array.isArray(raw) ? raw[0] : raw;

        if (result && !result.ilsevent) {
          await audit("success", {
            patron_id,
            target_id,
            pickup_lib,
            hold_type: hold_type || "T",
            hold_id: result,
          });
          return successResponse({ action: "place_hold", hold_id: result });
        }

        const message = getErrorMessage(result, "Failed to place hold");
        await audit("failure", { patron_id, target_id, pickup_lib }, message);
        return errorResponse(message, 400, result);
      }

      case "cancel_hold": {
        if (!hold_id) {
          return errorResponse("hold_id required", 400);
        }

        const cancelResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.hold.cancel",
          [authtoken, hold_id, 5, "Cancelled by staff"]
        );

        const result = cancelResponse?.payload?.[0] as any;
        if (isSuccessResult(result) || result === hold_id) {
          await audit("success", { hold_id });
          return successResponse({ action: "cancel_hold", hold_id });
        }

        const message = getErrorMessage(result, "Failed to cancel hold");
        await audit("failure", { hold_id }, message);
        return errorResponse(message, 400, result);
      }

      case "suspend_hold": {
        if (!hold_id) {
          return errorResponse("hold_id required", 400);
        }

        const suspendResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.hold.update",
          [authtoken, null, { id: hold_id, frozen: true }]
        );

        const result = suspendResponse?.payload?.[0] as any;
        if (isSuccessResult(result) || result === hold_id) {
          await audit("success", { hold_id });
          return successResponse({ action: "suspend_hold", hold_id });
        }

        const message = getErrorMessage(result, "Failed to suspend hold");
        await audit("failure", { hold_id }, message);
        return errorResponse(message, 400, result);
      }

      case "activate_hold": {
        if (!hold_id) {
          return errorResponse("hold_id required", 400);
        }

        const activateResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.hold.update",
          [authtoken, null, { id: hold_id, frozen: false }]
        );

        const result = activateResponse?.payload?.[0] as any;
        if (isSuccessResult(result) || result === hold_id) {
          await audit("success", { hold_id });
          return successResponse({ action: "activate_hold", hold_id });
        }

        const message = getErrorMessage(result, "Failed to activate hold");
        await audit("failure", { hold_id }, message);
        return errorResponse(message, 400, result);
      }

      case "pay_bills": {
        const { payments, payment_type } = body as Record<string, any>;
        if (!patron_id || !payments || payments.length === 0) {
          return errorResponse("patron_id and payments required", 400);
        }

        const payResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.money.payment",
          [
            authtoken,
            { userid: patron_id, payments, payment_type: payment_type || "cash_payment" },
            patron_id,
          ]
        );

        const result = payResponse?.payload?.[0] as any;
        if (result && !result.ilsevent) {
          const total = Array.isArray(payments)
            ? payments.reduce((sum: number, p) => sum + Number(p.amount || 0), 0)
            : 0;
          await audit("success", {
            patron_id,
            payment_type: payment_type || "cash_payment",
            total,
          });
          return successResponse({ action: "pay_bills", result });
        }

        const message = getErrorMessage(result, "Payment failed");
        await audit("failure", { patron_id }, message);
        return errorResponse(message, 400, result);
      }

      case "in_house_use": {
        if (!itemBarcode) {
          return errorResponse("Item barcode required", 400);
        }

        const copy = await getCopyByBarcode(itemBarcode);
        if (!copy || copy.ilsevent) {
          return notFoundResponse("Item not found");
        }

        const location = body.orgId || copy.circ_lib || copy.call_number?.owning_lib;

        const inHouseResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.in_house_use.create",
          [authtoken, { copyid: copy.id, location, count: body.count || 1 }]
        );

        const result = inHouseResponse?.payload?.[0] as any;
        if (isSuccessResult(result) || result) {
          const itemInfo = await fetchItemDetailsByBarcode(itemBarcode);

          await audit("success", {
            copyId: copy.id,
            itemBarcode,
            location,
            count: body.count || 1,
          });

          return successResponse({
            action: "in_house_use",
            copyId: copy.id,
            copyBarcode: itemBarcode,
            location,
            count: body.count || 1,
            item: itemInfo,
          });
        }

        const message = getErrorMessage(result, "Failed to record in-house use");
        await audit("failure", { itemBarcode, copyId: copy.id }, message);
        return errorResponse(message, 400, result);
      }

      default:
        return errorResponse("Invalid action", 400);
    }
  } catch (error: any) {
    return serverErrorResponse(error, "Circulation POST", req);
  }
}

// GET - Retrieve patron checkouts, holds, bills, or item status
export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action");
    const patronId = searchParams.get("patron_id") || searchParams.get("patronId");
    const itemBarcode = searchParams.get("itemBarcode");
    const orgId = searchParams.get("org_id");

    // Get patron holds
    if (action === "holds" && patronId) {
      const holdsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.holds.retrieve",
        [authtoken, parseInt(patronId)]
      );

      const holds = holdsResponse?.payload?.[0] as any;

      if (Array.isArray(holds)) {
        const enrichedHolds = await Promise.all(
          holds.map(async (hold) => {
            let bibInfo = null;
            if (hold.target) {
              try {
                const bibResponse = await callOpenSRF(
                  "open-ils.search",
                  "open-ils.search.biblio.record.mods_slim.retrieve",
                  [hold.hold_type === "T" ? hold.target : hold.current_copy]
                );
                bibInfo = bibResponse?.payload?.[0];
              } catch (_error: any) {
                // Ignore bib fetch _errors
              }
            }
            return {
              ...hold,
              title: bibInfo?.title || hold.title,
              author: bibInfo?.author || hold.author,
            };
          })
        );
        return successResponse({ holds: enrichedHolds });
      }
      return successResponse({ holds: [] });
    }

    // Get patron bills/fines
    if (action === "bills" && patronId) {
      const billsResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.transactions.have_balance.fleshed",
        [authtoken, parseInt(patronId)]
      );

      const bills = billsResponse?.payload?.[0] as any;
      return successResponse({ bills: Array.isArray(bills) ? bills : [] });
    }

    // Get holds shelf for an org
    if (action === "holds_shelf" && orgId) {
      const shelfResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.captured_holds.on_shelf.retrieve",
        [authtoken, parseInt(orgId)]
      );

      const holds = shelfResponse?.payload?.[0] as any;
      return successResponse({ holds: Array.isArray(holds) ? holds : [] });
    }

    // Get patron checkouts (normalized)
    if (patronId && !action) {
      const checkoutsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.actor.user.checked_out",
        [authtoken, parseInt(patronId)]
      );

      const payload = checkoutsResponse?.payload?.[0] as any;
      const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];

      const callNumberCache = new Map<number, string>();

      const getCallNumberLabel = async (callNumberId?: number): Promise<string> => {
        if (!callNumberId || !Number.isFinite(callNumberId)) return "";
        const cached = callNumberCache.get(callNumberId);
        if (cached !== undefined) return cached;

        try {
          const cnResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.asset.call_number.retrieve",
            [callNumberId]
          );

          const cn = cnResponse?.payload?.[0] as any;
          const label = fmString(cn, "label", 7) || fmString(cn, "label", 13) || "";
          callNumberCache.set(callNumberId, label);
          return label;
        } catch {
          callNumberCache.set(callNumberId, "");
          return "";
        }
      };

      const now = Date.now();
      const out: Record<string, any>[] = [];
      const overdue: Record<string, any>[] = [];
      for (const entry of rows) {
        const circ = entry?.circ;
        const copy = entry?.copy;
        const record = entry?.record;

        const circId = fmNumber(circ, "id", 10);
        const dueDate = fmString(circ, "due_date", 6);
        const checkoutDate = fmString(circ, "xact_start", 24) || fmString(circ, "xact_start", 25);

        const barcode = fmString(copy, "barcode", 2) || "";
        const title = fmString(record, "title", 0) || "Item";
        const author = fmString(record, "author", 1) || "";

        const callNumberId = fmNumber(copy, "call_number", 3);
        const callNumber = await getCallNumberLabel(callNumberId);

        let isOverdue = false;
        if (dueDate) {
          const dueMs = new Date(dueDate).getTime();
          if (!Number.isNaN(dueMs)) {
            isOverdue = dueMs < now;
          }
        }

        const item = {
          id: circId ?? Math.floor(Math.random() * 1e9),
          circId: circId ?? null,
          barcode,
          title,
          author,
          callNumber,
          checkoutDate,
          dueDate,
          isOverdue,
        };

        (isOverdue ? overdue : out).push(item);
      }

      return successResponse({
        checkouts: {
          out,
          overdue,
          claims_returned: [],
          long_overdue: [],
          lost: [],
        },
      });
    }

    // Get item/copy status
    if (itemBarcode) {
      const copyResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.asset.copy.find_by_barcode",
        [itemBarcode]
      );

      const copy = copyResponse?.payload?.[0] as any;

      if (copy && !copy.ilsevent) {
        return successResponse({
          copy: {
            id: copy.id,
            barcode: copy.barcode,
            status: copy.status,
            location: copy.location,
            callNumber: copy.call_number,
            circLib: copy.circ_lib,
          },
        });
      }
      return notFoundResponse("Copy not found");
    }

    return errorResponse("Invalid request parameters", 400);
  } catch (_error: any) {
    return serverErrorResponse(_error, "Circulation GET", req);
  }
}

// Helper: Fetch item details by barcode
async function fetchItemDetailsByBarcode(barcode: string) {
  const key = String(barcode || "").trim();
  if (!key) return { title: "Item", author: "", callNumber: "" };

  // Hot-path cache (perf harness + staff workflows often reuse the same barcode).
  // This is process-local; TTL keeps data reasonably fresh.
  const now = Date.now();
  const cached = itemDetailsCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const copyResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.asset.copy.find_by_barcode",
      [key]
    );
    const copy = copyResponse?.payload?.[0] as any;

    if (copy?.call_number) {
      const cnObj =
        typeof copy.call_number === "object" && copy.call_number !== null ? copy.call_number : null;
      const cnId = cnObj ? cnObj.id : copy.call_number;
      const cnLabel = cnObj && typeof cnObj.label === "string" ? cnObj.label : "";
      const cnRecord =
        cnObj && (typeof cnObj.record === "number" || typeof cnObj.record === "string")
          ? cnObj.record
          : null;

      let callNumber = cnLabel;
      let recordId: number | null = null;

      if (cnRecord !== null) {
        const n = Number.parseInt(String(cnRecord), 10);
        recordId = Number.isFinite(n) ? n : null;
      }

      if (!callNumber || recordId === null) {
        const cnResponse = await callOpenSRF(
          "open-ils.search",
          "open-ils.search.asset.call_number.retrieve",
          [cnId]
        );
        const cn = cnResponse?.payload?.[0] as any;
        callNumber = callNumber || cn?.label || "";
        if (recordId === null && cn?.record !== undefined && cn?.record !== null) {
          const n = Number.parseInt(String(cn.record), 10);
          recordId = Number.isFinite(n) ? n : null;
        }
      }

      if (recordId !== null) {
        const bibResponse = await callOpenSRF(
          "open-ils.search",
          "open-ils.search.biblio.record.mods_slim.retrieve",
          [recordId]
        );
        const bib = bibResponse?.payload?.[0] as any;
        const value = { title: bib?.title || "Item", author: bib?.author || "", callNumber };
        itemDetailsCache.set(key, { value, expiresAt: now + ITEM_DETAILS_TTL_MS });
        if (itemDetailsCache.size > ITEM_DETAILS_MAX) pruneItemDetailsCache();
        return value;
      }

      const value = { title: "Item", author: "", callNumber: callNumber || "" };
      itemDetailsCache.set(key, { value, expiresAt: now + ITEM_DETAILS_TTL_MS });
      if (itemDetailsCache.size > ITEM_DETAILS_MAX) pruneItemDetailsCache();
      return value;
    }
  } catch {
    // Ignore errors
  }
  const value = { title: "Item", author: "", callNumber: "" };
  itemDetailsCache.set(key, { value, expiresAt: now + ITEM_DETAILS_TTL_MS });
  if (itemDetailsCache.size > ITEM_DETAILS_MAX) pruneItemDetailsCache();
  return value;
}

const ITEM_DETAILS_TTL_MS = 60_000;
const ITEM_DETAILS_MAX = 500;
const itemDetailsCache = new Map<
  string,
  { value: { title: string; author: string; callNumber: string }; expiresAt: number }
>();

function pruneItemDetailsCache() {
  const now = Date.now();
  for (const [k, v] of itemDetailsCache.entries()) {
    if (v.expiresAt <= now) itemDetailsCache.delete(k);
  }
  if (itemDetailsCache.size <= ITEM_DETAILS_MAX) return;
  const keys = Array.from(itemDetailsCache.keys()).slice(0, itemDetailsCache.size - ITEM_DETAILS_MAX);
  for (const k of keys) itemDetailsCache.delete(k);
}
