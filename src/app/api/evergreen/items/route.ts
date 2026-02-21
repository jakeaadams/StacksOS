import { NextRequest } from "next/server";
import {
  callOpenSRF,
  encodeFieldmapper,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  requireAuthToken,
  getErrorMessage,
  isOpenSRFEvent,
  fmBoolean,
  parseJsonBodyWithSchema,
  getRequestMeta,
} from "@/lib/api";
import { query } from "@/lib/db/evergreen";
import { requirePermissions } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";

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
          } catch {
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

    const circModifierRaw = (copy as any).circ_modifier;
    const circModifierCode =
      typeof circModifierRaw === "object" && circModifierRaw
        ? String((circModifierRaw as any).code || "").trim() || null
        : typeof circModifierRaw === "string"
          ? circModifierRaw.trim() || null
          : null;

    const loanDurationRaw = (copy as any).loan_duration;
    const loanDurationParsed =
      typeof loanDurationRaw === "number"
        ? loanDurationRaw
        : parseInt(String(loanDurationRaw ?? ""), 10);
    const loanDuration = Number.isFinite(loanDurationParsed) ? loanDurationParsed : null;

    const fineLevelRaw = (copy as any).fine_level;
    const fineLevelParsed =
      typeof fineLevelRaw === "number" ? fineLevelRaw : parseInt(String(fineLevelRaw ?? ""), 10);
    const fineLevel = Number.isFinite(fineLevelParsed) ? fineLevelParsed : null;

    const floatingRaw = (copy as any).floating;
    const floatingGroupId =
      typeof floatingRaw === "object" && floatingRaw
        ? getId(floatingRaw)
        : typeof floatingRaw === "number"
          ? floatingRaw
          : parseInt(String(floatingRaw ?? ""), 10);

    let circModifierName: string | null = null;
    let floatingGroupName: string | null = null;
    let statCatEntries: Array<{
      mapId: number;
      statCatId: number;
      statCatName: string;
      entryId: number;
      entryValue: string;
    }> = [];

    try {
      const lookupRows = await query<{
        circ_modifier_name: string | null;
        floating_group_name: string | null;
      }>(
        `
          select
            ccm.name as circ_modifier_name,
            cfg.name as floating_group_name
          from asset.copy acp
          left join config.circ_modifier ccm on ccm.code = acp.circ_modifier
          left join config.floating_group cfg on cfg.id = acp.floating
          where acp.id = $1
          limit 1
        `,
        [copy.id]
      );

      if (lookupRows.length > 0) {
        circModifierName = lookupRows[0]!.circ_modifier_name ?? null;
        floatingGroupName = lookupRows[0]!.floating_group_name ?? null;
      }
    } catch {
      // Best-effort enrichment only.
    }

    try {
      const statRows = await query<{
        map_id: number;
        stat_cat_id: number;
        stat_cat_name: string;
        entry_id: number;
        entry_value: string;
      }>(
        `
          select
            m.id as map_id,
            e.stat_cat as stat_cat_id,
            c.name as stat_cat_name,
            e.id as entry_id,
            e.value as entry_value
          from asset.stat_cat_entry_copy_map m
          join asset.stat_cat_entry e on e.id = m.stat_cat_entry
          join asset.stat_cat c on c.id = e.stat_cat
          where m.owning_copy = $1
          order by c.name asc, e.value asc
        `,
        [copy.id]
      );

      statCatEntries = statRows.map((row) => ({
        mapId: Number(row.map_id) || 0,
        statCatId: Number(row.stat_cat_id) || 0,
        statCatName: String(row.stat_cat_name || "").trim(),
        entryId: Number(row.entry_id) || 0,
        entryValue: String(row.entry_value || "").trim(),
      }));
    } catch {
      // Best-effort enrichment only.
    }

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
      circModifier: circModifierCode || undefined,
      circModifierName: circModifierName || undefined,
      loanDuration: loanDuration ?? undefined,
      fineLevel: fineLevel ?? undefined,
      floatingGroupId:
        typeof floatingGroupId === "number" && Number.isFinite(floatingGroupId)
          ? floatingGroupId
          : undefined,
      floatingGroupName: floatingGroupName || undefined,
      statCatEntries,
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
  const { ip, userAgent, requestId } = getRequestMeta(req);
  let actorIdForAudit: number | null = null;
  try {
    const { authtoken, actor } = await requirePermissions(["CREATE_COPY", "CREATE_VOLUME"]);
    const bodyParsed = await parseJsonBodyWithSchema(
      req,
      z.object({
        bibId: z.coerce.number().int().positive(),
        barcode: z.string().trim().min(1),
        callNumber: z.string().trim().min(1),
        circLib: z.coerce.number().int().positive(),
        owningLib: z.coerce.number().int().positive().optional(),
        locationId: z.coerce.number().int().positive().optional(),
        status: z.coerce.number().int().optional().default(0),
        price: z.union([z.number(), z.string()]).optional(),
        holdable: z.boolean().optional().default(true),
        circulate: z.boolean().optional().default(true),
        opacVisible: z.boolean().optional().default(true),
      }).passthrough()
    );
    if (bodyParsed instanceof Response) return bodyParsed as any;
    const body = bodyParsed;

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

    const effectiveOwningLib = owningLib || circLib;
    const actorIdRaw = actor?.id ?? actor?.usr ?? actor?.user_id;
    const actorId = typeof actorIdRaw === "number" ? actorIdRaw : parseInt(String(actorIdRaw ?? ""), 10);
    if (!Number.isFinite(actorId)) {
      return errorResponse("Unable to resolve staff user id for item creation", 500);
    }
    actorIdForAudit = actorId;

    // Verify bib exists (via OpenSRF, not direct DB; the StacksOS DB user is intentionally least-privileged).
    const bibRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.bre", [authtoken, bibId]);
    const bib = bibRes?.payload?.[0];
    if (!bib || bib.ilsevent || (bib as any)?.deleted === "t" || (bib as any)?.deleted === true) {
      await logAuditEvent({
        action: "catalog.item.create",
        status: "failure",
        actor: { id: actorId },
        ip,
        userAgent,
        requestId,
        details: { barcode, bibId },
        error: "bib_not_found",
      });
      return notFoundResponse("Bib record not found");
    }

    // Check if barcode already exists (OpenSRF is authoritative).
    const existingCopyRes = await callOpenSRF("open-ils.search", "open-ils.search.asset.copy.find_by_barcode", [
      barcode,
    ]);
    const existingCopy = existingCopyRes?.payload?.[0];
    if (existingCopy && !existingCopy.ilsevent) {
      await logAuditEvent({
        action: "catalog.item.create",
        status: "failure",
        actor: { id: actorId },
        ip,
        userAgent,
        requestId,
        details: { barcode, bibId, owningLib: effectiveOwningLib, circLib },
        error: "barcode_exists",
      });
      return errorResponse(`Barcode ${barcode} already exists`, 409);
    }

    const normalizedPrice =
      price === null || price === undefined || price === ""
        ? null
        : typeof price === "number"
          ? Number.isFinite(price) ? price : null
          : Number.isFinite(parseFloat(String(price)))
            ? parseFloat(String(price))
            : null;

    // Find or create a call number (volume)
    const volSearchRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acn.atomic", [
      authtoken,
      { record: bibId, owning_lib: effectiveOwningLib, label: callNumber, deleted: "f" },
      { limit: 1 },
    ]);
    const volRows = Array.isArray(volSearchRes?.payload?.[0]) ? (volSearchRes.payload[0] as any[]) : [];
    const existingVol = volRows[0];

    let resolvedVolumeId: number;
    const existingVolumeId =
      typeof existingVol?.id === "number" ? existingVol.id : parseInt(String(existingVol?.id ?? ""), 10);
    if (Number.isFinite(existingVolumeId) && existingVolumeId > 0) {
      resolvedVolumeId = existingVolumeId;
    } else {
      const payload: any = encodeFieldmapper("acn", {
        creator: actorId,
        editor: actorId,
        record: bibId,
        owning_lib: effectiveOwningLib,
        label: callNumber,
        label_class: 1,
        deleted: "f",
        isnew: 1,
        ischanged: 1,
      });

      const createVolRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acn", [authtoken, payload]);
      const volResult = createVolRes?.payload?.[0];
      const createdId =
        typeof volResult === "number"
          ? volResult
          : typeof (volResult as any)?.id === "number"
            ? (volResult as any).id
            : parseInt(String((volResult as any)?.id ?? volResult ?? ""), 10);
      if (!Number.isFinite(createdId) || createdId <= 0) {
        const msg = getErrorMessage(volResult, "Failed to create call number");
        return errorResponse(msg, 400, volResult);
      }
      resolvedVolumeId = createdId;
    }

    const boolToEg = (v: boolean) => (v ? "t" : "f");
    const copyPayload: any = encodeFieldmapper("acp", {
      barcode,
      call_number: resolvedVolumeId,
      circ_lib: circLib,
      creator: actorId,
      editor: actorId,
      status,
      location: locationId || 1,
      holdable: boolToEg(Boolean(holdable)),
      circulate: boolToEg(Boolean(circulate)),
      opac_visible: boolToEg(Boolean(opacVisible)),
      price: normalizedPrice,
      loan_duration: 2,
      fine_level: 2,
      deleted: "f",
      isnew: 1,
      ischanged: 1,
    });

    const createCopyRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acp", [authtoken, copyPayload]);
    const copyResult = createCopyRes?.payload?.[0];
    const copyId =
      typeof copyResult === "number"
        ? copyResult
        : typeof (copyResult as any)?.id === "number"
          ? (copyResult as any).id
          : parseInt(String((copyResult as any)?.id ?? copyResult ?? ""), 10);

    if (!Number.isFinite(copyId) || copyId <= 0 || isOpenSRFEvent(copyResult) || (copyResult as any)?.ilsevent) {
      const msg = getErrorMessage(copyResult, "Failed to create item");
      return errorResponse(msg, 400, copyResult);
    }

    await logAuditEvent({
      action: "catalog.item.create",
      status: "success",
      actor: { id: actorId },
      ip,
      userAgent,
      requestId,
      details: { barcode, bibId, circLib, owningLib: effectiveOwningLib, copyId, volumeId: resolvedVolumeId },
    });

    return successResponse({
      ok: true,
      copyId,
      volumeId: resolvedVolumeId,
      barcode,
      message: "Item created successfully",
    });

  } catch (error) {
    try {
      await logAuditEvent({
        action: "catalog.item.create",
        status: "failure",
        actor: actorIdForAudit ? { id: actorIdForAudit } : { username: "unknown" },
        ip,
        userAgent,
        requestId,
        error: getErrorMessage(error as any, "internal_error"),
      });
    } catch {
      // ignore audit failures
    }
    return serverErrorResponse(error, "Create Item", req);
  }
}
