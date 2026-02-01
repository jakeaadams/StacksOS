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
import { requirePermissions } from "@/lib/permissions";

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

        // Defensive: some Evergreen installs return duplicated entries for this call
        // (or proxies can duplicate payload elements). De-dupe by a stable key so the
        // UI doesn't look "fake" when it isn't.
        const seen = new Set<string>();
        history = history.filter((h: any) => {
          const key = [
            h?.id ?? "",
            h?.patronId ?? "",
            h?.checkoutDate ?? "",
            h?.dueDate ?? "",
            h?.checkinDate ?? "",
          ].join("|");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
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

// ============================================================================
// POST - Create a new item (copy) with call number
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["CREATE_COPY"]);
    const body = await req.json();

    const {
      bibId,
      barcode,
      callNumber,
      circLib,
      owningLib,
      locationId,
      status = 0,
      price,
      holdable = true,
      circulate = true,
      opacVisible = true,
    } = body;

    // Validate required fields
    if (!bibId) return errorResponse("bibId is required", 400);
    if (!barcode) return errorResponse("barcode is required", 400);
    if (!callNumber) return errorResponse("callNumber is required", 400);
    if (!circLib) return errorResponse("circLib is required", 400);

    const effectiveOwningLib = owningLib || circLib;

    // Check if barcode already exists
    const existingCopy = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.asset.copy.find_by_barcode",
      [barcode]
    );

    if (existingCopy?.payload?.[0] && !existingCopy.payload[0].ilsevent) {
      return errorResponse(`Barcode ${barcode} already exists`, 409);
    }

    // Step 1: Find or create call number (volume)
    // First, search for existing call number with same label on this record
    const existingVolumes = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.asset.call_number.retrieve_by_label",
      [callNumber, bibId, effectiveOwningLib]
    );

    let volumeId: number;

    if (existingVolumes?.payload?.[0] && !existingVolumes.payload[0].ilsevent) {
      // Use existing volume
      volumeId = existingVolumes.payload[0].id || existingVolumes.payload[0];
    } else {
      // Create new call number (volume)
      const volumeResult = await callOpenSRF(
        "open-ils.cat",
        "open-ils.cat.call_number.create",
        [
          authtoken,
          {
            "__c": "acn",
            "__p": {
              "record": bibId,
              "owning_lib": effectiveOwningLib,
              "label": callNumber,
              "label_class": 1, // Generic
            }
          }
        ]
      );

      if (!volumeResult?.payload?.[0] || volumeResult.payload[0].ilsevent) {
        // Try alternative method
        const altResult = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.create.acn",
          [
            authtoken,
            {
              "__c": "acn",
              "__p": [
                null, // id
                null, // creator
                null, // create_date
                null, // editor
                null, // edit_date
                bibId, // record
                effectiveOwningLib, // owning_lib
                callNumber, // label
                null, // deleted
                null, // prefix
                null, // suffix
                1, // label_class
              ]
            }
          ]
        );

        if (!altResult?.payload?.[0] || altResult.payload[0].ilsevent) {
          const errMsg = getErrorMessage(altResult?.payload?.[0], "Failed to create call number") || "Failed to create call number";
          return errorResponse(errMsg, 500);
        }
        volumeId = altResult.payload[0].id || altResult.payload[0];
      } else {
        volumeId = volumeResult.payload[0].id || volumeResult.payload[0];
      }
    }

    // Step 2: Create the copy (item)
    const copyResult = await callOpenSRF(
      "open-ils.cat",
      "open-ils.cat.copy.create",
      [
        authtoken,
        {
          "__c": "acp",
          "__p": {
            "call_number": volumeId,
            "circ_lib": circLib,
            "barcode": barcode,
            "status": status,
            "location": locationId || 1,
            "holdable": holdable ? "t" : "f",
            "circulate": circulate ? "t" : "f",
            "opac_visible": opacVisible ? "t" : "f",
            "price": price || null,
            "loan_duration": 2, // Normal
            "fine_level": 2, // Normal
          }
        }
      ]
    );

    let copyId: number;

    if (!copyResult?.payload?.[0] || copyResult.payload[0].ilsevent) {
      // Try pcrud method
      const pcrudResult = await callOpenSRF(
        "open-ils.pcrud",
        "open-ils.pcrud.create.acp",
        [
          authtoken,
          {
            "__c": "acp",
            "__p": [
              null, // id
              volumeId, // call_number
              barcode, // barcode
              null, // creator
              null, // create_date
              null, // editor
              null, // edit_date
              null, // copy_number
              status, // status
              locationId || 1, // location
              null, // loan_duration
              null, // fine_level
              null, // age_protect
              circLib, // circ_lib
              null, // circ_modifier
              circulate ? "t" : "f", // circulate
              null, // deposit
              null, // deposit_amount
              null, // ref
              holdable ? "t" : "f", // holdable
              null, // price
              null, // barcode_checksum
              null, // floating
              null, // dummy_title
              null, // dummy_author
              null, // alert_message
              opacVisible ? "t" : "f", // opac_visible
              null, // deleted
              null, // circ_as_type
              null, // dummy_isbn
              null, // preset_search
              null, // mint_condition
              null, // cost
            ]
          }
        ]
      );

      if (!pcrudResult?.payload?.[0] || pcrudResult.payload[0].ilsevent) {
        const errMsg = getErrorMessage(pcrudResult?.payload?.[0], "Failed to create item") || "Failed to create item";
        return errorResponse(errMsg, 500);
      }
      copyId = pcrudResult.payload[0].id || pcrudResult.payload[0];
    } else {
      copyId = copyResult.payload[0].id || copyResult.payload[0];
    }

    return successResponse({
      ok: true,
      copyId,
      volumeId,
      barcode,
      message: "Item created successfully",
    });

  } catch (error) {
    return serverErrorResponse(error, "Create Item", req);
  }
}
