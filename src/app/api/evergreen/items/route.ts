import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  requireAuthToken,
  getErrorMessage,
  isOpenSRFEvent,
  fmBoolean,
} from "@/lib/api";

function getId(value: any): number | undefined {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value.id === "number") return value.id;
  return undefined;
}

function getName(value: any): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value.name || value.label || value.shortname;
}

const ORG_CACHE_TTL_MS = 5 * 60 * 1000;
let orgCache: { loadedAt: number; map: Map<number, { name: string; shortname: string }> } | null = null;

async function getOrgMap(_authtoken: string): Promise<Map<number, { name: string; shortname: string }>> {
  if (orgCache && Date.now() - orgCache.loadedAt < ORG_CACHE_TTL_MS) {
    return orgCache.map;
  }

  const map = new Map<number, { name: string; shortname: string }>();

  orgCache = { loadedAt: Date.now(), map };
  return map;
}

async function getOrgName(authtoken: string, orgId?: number): Promise<string> {
  if (!orgId) return "";

  const cache = await getOrgMap(authtoken);
  if (cache.has(orgId)) {
    return cache.get(orgId)?.name || "";
  }

  const orgResponse = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.org_unit.retrieve",
    [authtoken, orgId]
  );

  const org = orgResponse?.payload?.[0];
  if (org && !org.ilsevent) {
    cache.set(orgId, {
      name: org.name || "",
      shortname: org.shortname || org.short_name || "",
    });
    return org.name || "";
  }

  return "";
}

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const searchParams = req.nextUrl.searchParams;
    const barcode = searchParams.get("barcode");
    const idRaw =
      searchParams.get("id") ||
      searchParams.get("copy_id") ||
      searchParams.get("copyId") ||
      searchParams.get("copyID");
    const copyId = idRaw ? parseInt(idRaw, 10) : NaN;
    const include = new Set(
      (searchParams.get("include") || "bib,circ")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const historyLimit = parseInt(
      searchParams.get("history_limit") || searchParams.get("historyLimit") || "10",
      10
    );

    if (!barcode && !Number.isFinite(copyId)) {
      return errorResponse("barcode or id is required", 400);
    }

    const copyResponse = barcode
      ? await callOpenSRF(
          "open-ils.search",
          "open-ils.search.asset.copy.find_by_barcode",
          [barcode]
        )
      : await callOpenSRF(
          "open-ils.search",
          "open-ils.search.asset.copy.retrieve",
          [copyId]
        );

    const copy = copyResponse?.payload?.[0];
    if (!copy || copy.ilsevent) {
      return notFoundResponse("Item not found");
    }

    const callNumberId = getId(copy.call_number);
    let callNumber: any = undefined;
    let recordId: number | undefined = undefined;

    if (callNumberId) {
      const cnResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.asset.call_number.retrieve",
        [callNumberId]
      );
      callNumber = cnResponse?.payload?.[0] || copy.call_number;
      recordId = getId(callNumber?.record) || getId(copy.call_number?.record);
    }

    let bib: any = undefined;
    if (include.has("bib") && recordId) {
      const bibResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.biblio.record.mods_slim.retrieve",
        [recordId]
      );
      bib = bibResponse?.payload?.[0];
    }

    const statusId = getId(copy.status) ?? copy.status;
    const statusName = getName(copy.status);

    const holdableRaw = fmBoolean(copy, "holdable");
    const circulateRaw = fmBoolean(copy, "circulate");
    const opacVisibleRaw = fmBoolean(copy, "opac_visible");
    const refRaw = fmBoolean(copy, "ref");

    const rawCircLibId = getId(copy.circ_lib) ?? copy.circ_lib;
    const rawOwningLibId = getId(callNumber?.owning_lib) ?? callNumber?.owning_lib;
    const circLibId = typeof rawCircLibId === "string" ? parseInt(rawCircLibId, 10) : rawCircLibId;
    const owningLibId = typeof rawOwningLibId === "string" ? parseInt(rawOwningLibId, 10) : rawOwningLibId;

    const circLibName = getName(copy.circ_lib) || (await getOrgName(authtoken, circLibId as number));
    const owningLibName = getName(callNumber?.owning_lib) || (await getOrgName(authtoken, owningLibId as number));

    let history: Array<Record<string, any>> | undefined = undefined;
    let historyError: string | undefined = undefined;

    if (include.has("history")) {
      const historyResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.copy_checkout_history.retrieve",
        [authtoken, copy.id, Number.isFinite(historyLimit) ? historyLimit : undefined]
      );

      const payload = historyResponse?.payload?.[0];
      if (isOpenSRFEvent(payload) || payload?.ilsevent) {
        historyError = getErrorMessage(payload, "Unable to load circulation history");
      } else if (Array.isArray(payload)) {
        history = payload.map((circ: any) => ({
          id: circ.id,
          patronId: circ.usr,
          checkoutDate: circ.xact_start,
          dueDate: circ.due_date,
          checkinDate: circ.checkin_time || circ.xact_finish || null,
          status: circ.checkin_time || circ.xact_finish ? "Returned" : "Checked Out",
          renewCount: circ.renew_count ?? circ.renewal_count ?? circ.renewals ?? circ.renewal_remaining,
          circLibId: circ.circ_lib,
          checkinLibId: circ.checkin_lib,
          billingTotal: circ.billing_total,
          paymentTotal: circ.payment_total,
        }));
      } else {
        history = [];
      }
    }

    // Fetch patron barcodes for circulation history
    if (history && history.length > 0) {
      const patronIds = [...new Set(history.map((h: any) => h.patronId).filter(Boolean))];
      if (patronIds.length > 0 && patronIds.length <= 20) {
        const patronMap = new Map();
        for (const patronId of patronIds) {
          try {
            const patronResponse = await callOpenSRF(
              "open-ils.actor",
              "open-ils.actor.user.fleshed.retrieve",
              [authtoken, patronId, ["card"]]
            );
            const patron = patronResponse?.payload?.[0];
            if (patron && !patron.ilsevent && patron.card) {
              patronMap.set(patronId, {
                barcode: typeof patron.card === "object" ? patron.card.barcode : patron.card,
                name: [patron.family_name, patron.first_given_name].filter(Boolean).join(", "),
              });
            }
          } catch (err) {
            // Skip on error
          }
        }
        
        // Add patron barcodes to history
        history = history.map((h: any) => {
          const patronInfo = patronMap.get(h.patronId);
          return {
            ...h,
            patronBarcode: patronInfo?.barcode,
            patronName: patronInfo?.name,
          };
        });
      }
    }

    const priceRaw = copy.price;
    const price =
      priceRaw === null || priceRaw === undefined || priceRaw === ""
        ? undefined
        : typeof priceRaw === "number"
          ? priceRaw
          : Number.isFinite(parseFloat(String(priceRaw)))
            ? parseFloat(String(priceRaw))
            : undefined;

    const depositRaw = (copy as any).deposit_amount ?? (copy as any).depositAmount;
    const depositAmount =
      depositRaw === null || depositRaw === undefined || depositRaw === ""
        ? undefined
        : typeof depositRaw === "number"
          ? depositRaw
          : Number.isFinite(parseFloat(String(depositRaw)))
            ? parseFloat(String(depositRaw))
            : undefined;

    const item = {
      id: copy.id,
      barcode: copy.barcode,
      statusId,
      statusName,
      callNumber: callNumber?.label || callNumber?.label_sortkey || "",
      callNumberId,
      recordId: recordId || undefined,
      location: getName(copy.location) || "",
      locationId: getId(copy.location) ?? copy.location,
      circLib: circLibName || "",
      circLibId: circLibId ?? undefined,
      owningLib: owningLibName || "",
      owningLibId: owningLibId ?? undefined,
      copyNumber: copy.copy_number || 1,
      price,
      depositAmount,
      createDate: (copy as any).create_date ?? (copy as any).createDate,
      editDate: (copy as any).edit_date ?? (copy as any).editDate,
      activeDate: (copy as any).active_date ?? (copy as any).activeDate,
      alertMessage: (copy as any).alert_message ?? (copy as any).alertMessage ?? "",
      holdable: holdableRaw !== false,
      circulate: circulateRaw !== false,
      refItem: refRaw === true,
      opacVisible: opacVisibleRaw !== false,
      title: bib?.title || "",
      author: bib?.author || "",
      isbn: bib?.isbn || "",
      publisher: bib?.publisher || "",
      pubdate: bib?.pubdate || "",
      edition: bib?.edition || "",
      format: bib?.icon_format_label || "",
      history,
      historyError,
    };

    return successResponse({ item });
  } catch (error) {
    return serverErrorResponse(error, "Items GET", req);
  }
}
