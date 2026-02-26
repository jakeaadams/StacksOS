import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  parseJsonBody,
  encodeFieldmapper,
  getErrorMessage,
  isOpenSRFEvent,
} from "@/lib/api";
import { query } from "@/lib/db/evergreen";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/evergreen/items/[id]
 * Update a copy (asset.copy / acp)
 */
const itemPatchSchema = z
  .object({
    barcode: z.string().trim().optional().nullable(),
    alert_message: z.string().max(4096).optional().nullable(),
    alertMessage: z.string().max(4096).optional().nullable(),
    price: z.union([z.number(), z.string(), z.null()]).optional(),
    holdable: z.boolean().optional(),
    circulate: z.boolean().optional(),
    opac_visible: z.boolean().optional(),
    opacVisible: z.boolean().optional(),
    circ_modifier: z.union([z.string(), z.null()]).optional(),
    circModifier: z.union([z.string(), z.null()]).optional(),
    loan_duration: z.union([z.coerce.number().int(), z.null()]).optional(),
    loanDuration: z.union([z.coerce.number().int(), z.null()]).optional(),
    fine_level: z.union([z.coerce.number().int(), z.null()]).optional(),
    fineLevel: z.union([z.coerce.number().int(), z.null()]).optional(),
    floating: z.union([z.coerce.number().int(), z.null()]).optional(),
    floatingGroupId: z.union([z.coerce.number().int(), z.null()]).optional(),
    stat_cat_entry_ids: z.array(z.coerce.number().int().positive()).optional(),
    statCatEntryIds: z.array(z.coerce.number().int().positive()).optional(),
  })
  .passthrough();

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_COPY"]);
    const { id } = await params;
    const copyId = parseInt(id, 10);

    if (!Number.isFinite(copyId)) {
      return errorResponse("Invalid copy ID", 400);
    }

    const rawBody = await parseJsonBody<Record<string, any>>(req);
    if (rawBody instanceof Response) return rawBody;
    const body = itemPatchSchema.parse(rawBody);

    const barcode =
      body.barcode !== undefined && body.barcode !== null ? String(body.barcode).trim() : undefined;

    const alertMessageRaw =
      body.alert_message !== undefined
        ? body.alert_message
        : body.alertMessage !== undefined
          ? body.alertMessage
          : undefined;

    const priceRaw = body.price;
    const holdableRaw = body.holdable;
    const circulateRaw = body.circulate;
    const opacVisibleRaw =
      body.opac_visible !== undefined
        ? body.opac_visible
        : body.opacVisible !== undefined
          ? body.opacVisible
          : undefined;
    const circModifierRaw =
      body.circ_modifier !== undefined
        ? body.circ_modifier
        : body.circModifier !== undefined
          ? body.circModifier
          : undefined;
    const loanDurationRaw =
      body.loan_duration !== undefined
        ? body.loan_duration
        : body.loanDuration !== undefined
          ? body.loanDuration
          : undefined;
    const fineLevelRaw =
      body.fine_level !== undefined
        ? body.fine_level
        : body.fineLevel !== undefined
          ? body.fineLevel
          : undefined;
    const floatingRaw =
      body.floating !== undefined
        ? body.floating
        : body.floatingGroupId !== undefined
          ? body.floatingGroupId
          : undefined;
    const statCatEntryIdsRaw =
      body.stat_cat_entry_ids !== undefined
        ? body.stat_cat_entry_ids
        : body.statCatEntryIds !== undefined
          ? body.statCatEntryIds
          : undefined;

    if (barcode !== undefined && !barcode) {
      return errorResponse("Barcode cannot be empty", 400);
    }

    const parseIntOrNull = (value: unknown): number | null => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = typeof value === "number" ? value : parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parsedLoanDuration =
      loanDurationRaw !== undefined ? parseIntOrNull(loanDurationRaw) : undefined;
    if (parsedLoanDuration !== undefined && parsedLoanDuration !== null) {
      if (![1, 2, 3].includes(parsedLoanDuration)) {
        return errorResponse("loan_duration must be one of: 1, 2, 3", 400);
      }
    }

    const parsedFineLevel = fineLevelRaw !== undefined ? parseIntOrNull(fineLevelRaw) : undefined;
    if (parsedFineLevel !== undefined && parsedFineLevel !== null) {
      if (![1, 2, 3].includes(parsedFineLevel)) {
        return errorResponse("fine_level must be one of: 1, 2, 3", 400);
      }
    }

    const parsedFloating = floatingRaw !== undefined ? parseIntOrNull(floatingRaw) : undefined;
    if (parsedFloating !== undefined && parsedFloating !== null && parsedFloating <= 0) {
      return errorResponse("floating must be a positive integer or null", 400);
    }

    const parsedCircModifier =
      circModifierRaw !== undefined
        ? circModifierRaw === null || String(circModifierRaw).trim() === ""
          ? null
          : String(circModifierRaw).trim()
        : undefined;

    let parsedStatCatEntryIds: number[] | undefined = undefined;
    if (statCatEntryIdsRaw !== undefined) {
      if (!Array.isArray(statCatEntryIdsRaw)) {
        return errorResponse("stat_cat_entry_ids must be an array of integers", 400);
      }

      parsedStatCatEntryIds = [
        ...new Set(
          statCatEntryIdsRaw
            .map((v) => parseIntOrNull(v))
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
        ),
      ];
    }

    const fetchResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.acp", [
      authtoken,
      copyId,
    ]);

    const existing = fetchResponse?.payload?.[0];
    if (!existing || (existing as Record<string, any>)?.ilsevent) {
      return notFoundResponse("Item not found");
    }

    const updateData: Record<string, any> = { ...(existing as Record<string, any>) };

    if (barcode !== undefined) updateData.barcode = barcode;

    if (priceRaw !== undefined) {
      if (priceRaw === null || priceRaw === "") {
        updateData.price = null;
      } else {
        const priceNum = parseFloat(String(priceRaw));
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          return errorResponse("Invalid price", 400);
        }
        updateData.price = priceNum;
      }
    }

    if (holdableRaw !== undefined) updateData.holdable = holdableRaw === true ? "t" : "f";
    if (circulateRaw !== undefined) updateData.circulate = circulateRaw === true ? "t" : "f";
    if (opacVisibleRaw !== undefined) updateData.opac_visible = opacVisibleRaw === true ? "t" : "f";
    if (parsedCircModifier !== undefined) updateData.circ_modifier = parsedCircModifier;
    if (parsedLoanDuration !== undefined) updateData.loan_duration = parsedLoanDuration;
    if (parsedFineLevel !== undefined) updateData.fine_level = parsedFineLevel;
    if (parsedFloating !== undefined) updateData.floating = parsedFloating;

    if (alertMessageRaw !== undefined) {
      updateData.alert_message =
        alertMessageRaw === null ||
        alertMessageRaw === undefined ||
        String(alertMessageRaw).trim() === ""
          ? null
          : String(alertMessageRaw).trim();
    }

    // Keep required fields intact and record the editing user when possible.
    updateData.id = copyId;
    if ((actor as Record<string, any>)?.id) {
      updateData.editor = (actor as Record<string, any>).id;
    }

    updateData.ischanged = 1;
    const payload: unknown = encodeFieldmapper("acp", updateData);

    const updateResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.acp", [
      authtoken,
      payload,
    ]);

    const result = updateResponse?.payload?.[0];
    if (isOpenSRFEvent(result) || (result as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to update item"), 400, result);
    }

    if (parsedStatCatEntryIds !== undefined) {
      // Validate selected entries and ensure only one entry per stat category.
      if (parsedStatCatEntryIds.length > 0) {
        const validRows = await query<{ id: number; stat_cat: number }>(
          `
            select id, stat_cat
            from asset.stat_cat_entry
            where id = any($1::int[])
          `,
          [parsedStatCatEntryIds]
        );

        const validIds = new Set(validRows.map((r) => Number(r.id)));
        const missing = parsedStatCatEntryIds.filter((id) => !validIds.has(id));
        if (missing.length > 0) {
          return errorResponse(`Invalid stat cat entry id(s): ${missing.join(", ")}`, 400);
        }

        const byCategory = new Map<number, number>();
        for (const row of validRows) {
          const catId = Number(row.stat_cat);
          const entryId = Number(row.id);
          if (byCategory.has(catId)) {
            return errorResponse(
              `Only one entry per stat category is allowed (duplicate category ${catId})`,
              400
            );
          }
          byCategory.set(catId, entryId);
        }
      }

      const currentMapsResponse = await callOpenSRF(
        "open-ils.pcrud",
        "open-ils.pcrud.search.ascecm.atomic",
        [authtoken, { owning_copy: copyId }, { limit: 500 }]
      );

      const currentMapsRaw = Array.isArray(currentMapsResponse?.payload?.[0])
        ? (currentMapsResponse?.payload?.[0] as Record<string, any>[])
        : [];

      const currentMaps = currentMapsRaw
        .map((row) => {
          const mapId = typeof row?.id === "number" ? row.id : parseInt(String(row?.id ?? ""), 10);
          const entryId =
            typeof row?.stat_cat_entry === "number"
              ? row.stat_cat_entry
              : parseInt(String(row?.stat_cat_entry ?? ""), 10);
          if (!Number.isFinite(mapId) || !Number.isFinite(entryId)) return null;
          return { mapId, entryId };
        })
        .filter((v): v is { mapId: number; entryId: number } => Boolean(v));

      const desired = new Set(parsedStatCatEntryIds || []);
      const currentByEntry = new Map<number, number>();
      for (const map of currentMaps) {
        currentByEntry.set(map.entryId, map.mapId);
      }

      const toDeleteMapIds = currentMaps
        .filter((map) => !desired.has(map.entryId))
        .map((map) => map.mapId);

      const toCreateEntryIds = [...desired].filter((entryId) => !currentByEntry.has(entryId));

      for (const mapId of toDeleteMapIds) {
        const deleteResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.ascecm", [
          authtoken,
          mapId,
        ]);
        const deleteResult = deleteResponse?.payload?.[0];
        if (isOpenSRFEvent(deleteResult) || (deleteResult as Record<string, any>)?.ilsevent) {
          return errorResponse(
            getErrorMessage(deleteResult, "Failed to remove item stat category assignment"),
            400,
            deleteResult
          );
        }
      }

      for (const entryId of toCreateEntryIds) {
        const payload: unknown = encodeFieldmapper("ascecm", {
          owning_copy: copyId,
          stat_cat_entry: entryId,
          isnew: 1,
          ischanged: 1,
        });

        const createResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.ascecm", [
          authtoken,
          payload,
        ]);
        const createResult = createResponse?.payload?.[0];
        if (isOpenSRFEvent(createResult) || (createResult as Record<string, any>)?.ilsevent) {
          return errorResponse(
            getErrorMessage(createResult, "Failed to add item stat category assignment"),
            400,
            createResult
          );
        }
      }
    }

    return successResponse({ updated: true, id: copyId });
  } catch (error) {
    return serverErrorResponse(error, "Items PATCH", req);
  }
}
