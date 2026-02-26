import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  isSuccessResult,
  getErrorMessage,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { withIdempotency } from "@/lib/idempotency";
import { z } from "zod";

/**
 * Batch Cataloging Operations API
 *
 * Supports:
 * - Batch item status updates
 * - Batch call number changes
 * - Batch delete (with confirmation)
 * - Batch transfer between locations
 */

const ACTION_PERMS: Record<string, string[]> = {
  update_status: ["UPDATE_COPY"],
  update_call_number: ["UPDATE_VOLUME"],
  delete: ["DELETE_COPY"],
  transfer: ["TRANSFER_COPY"],
  update_location: ["UPDATE_COPY"],
  update_circ_modifier: ["UPDATE_COPY"],
};

const resolvePerms = (action?: string) => ACTION_PERMS[action || ""] || ["STAFF_LOGIN"];

interface BatchItem {
  copyId?: number;
  barcode?: string;
}

interface BatchResult {
  success: boolean;
  copyId?: number;
  barcode?: string;
  error?: string;
  details?: Record<string, any>;
}

async function resolveCopyId(
  authtoken: string,
  item: BatchItem
): Promise<{ copyId: number | null; barcode: string; error?: string }> {
  if (item.copyId) {
    return { copyId: item.copyId, barcode: item.barcode || `copy:${item.copyId}` };
  }

  if (!item.barcode) {
    return { copyId: null, barcode: "", error: "No copyId or barcode provided" };
  }

  const copyResponse = await callOpenSRF(
    "open-ils.search",
    "open-ils.search.asset.copy.find_by_barcode",
    [item.barcode]
  );

  const copy = copyResponse?.payload?.[0];
  if (!copy || copy.ilsevent) {
    return { copyId: null, barcode: item.barcode, error: `Item not found: ${item.barcode}` };
  }

  return { copyId: copy.id, barcode: item.barcode };
}

// POST - Execute batch operations
const catalogBatchPostSchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .passthrough();

export async function POST(req: NextRequest) {
  return withIdempotency(req, "api.evergreen.catalog.batch.POST", async () => {
    const { ip, userAgent, requestId } = getRequestMeta(req);

    try {
      const body = catalogBatchPostSchema.parse(await req.json());
      const { action, items, confirm } = body;

      if (!action) {
        return errorResponse("Action required", 400);
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return errorResponse("Items array required", 400);
      }

      if (items.length > 500) {
        return errorResponse("Maximum 500 items per batch", 400);
      }

      const { authtoken, actor } = await requirePermissions(resolvePerms(action));

      const audit = async (
        status: "success" | "failure",
        details?: Record<string, any>,
        error?: string
      ) =>
        logAuditEvent({
          action: `catalog.batch.${action}`,
          status,
          actor,
          ip,
          userAgent,
          requestId,
          details,
          error: error || null,
        });

      logger.info(
        { requestId, route: "api.evergreen.catalog.batch", action, itemCount: items.length },
        "Batch catalog operation"
      );

      switch (action) {
        /**
         * Batch Status Update
         * Updates the status of multiple copies
         */
        case "update_status": {
          const { statusId } = body;

          if (statusId === undefined || statusId === null) {
            return errorResponse("statusId required for update_status", 400);
          }

          const results: BatchResult[] = [];
          let successCount = 0;
          let failCount = 0;

          for (const item of items as BatchItem[]) {
            const { copyId, barcode, error } = await resolveCopyId(authtoken, item);

            if (error || !copyId) {
              results.push({ success: false, barcode, error: error || "Unknown error" });
              failCount++;
              continue;
            }

            try {
              // Use pcrud to update copy status
              const updateResponse = await callOpenSRF(
                "open-ils.pcrud",
                "open-ils.pcrud.update.acp",
                [authtoken, { id: copyId, status: statusId }]
              );

              const result = updateResponse?.payload?.[0];

              if (isSuccessResult(result) || (result && !result.ilsevent)) {
                results.push({ success: true, copyId, barcode, details: { newStatus: statusId } });
                successCount++;
              } else {
                const errMsg = getErrorMessage(result, "Update failed");
                results.push({ success: false, copyId, barcode, error: errMsg });
                failCount++;
              }
            } catch (err) {
              results.push({ success: false, copyId, barcode, error: String(err) });
              failCount++;
            }
          }

          await audit("success", { successCount, failCount, statusId });

          return successResponse({
            action: "update_status",
            statusId,
            total: items.length,
            successCount,
            failCount,
            results,
          });
        }

        /**
         * Batch Call Number Change
         * Changes call numbers for multiple copies
         */
        case "update_call_number": {
          const { callNumber, prefix, suffix } = body;

          if (!callNumber) {
            return errorResponse("callNumber required for update_call_number", 400);
          }

          const results: BatchResult[] = [];
          let successCount = 0;
          let failCount = 0;

          for (const item of items as BatchItem[]) {
            const { copyId, barcode, error } = await resolveCopyId(authtoken, item);

            if (error || !copyId) {
              results.push({ success: false, barcode, error: error || "Unknown error" });
              failCount++;
              continue;
            }

            try {
              // Get the copy to find its call number
              const copyResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.asset.copy.retrieve",
                [copyId]
              );

              const copy = copyResponse?.payload?.[0];
              if (!copy || copy.ilsevent) {
                results.push({ success: false, copyId, barcode, error: "Copy not found" });
                failCount++;
                continue;
              }

              const volumeId =
                typeof copy.call_number === "object" ? copy.call_number.id : copy.call_number;

              // Update the volume/call number
              const volumeUpdate: Record<string, any> = {
                id: volumeId,
                label: callNumber,
              };

              if (prefix !== undefined) {
                volumeUpdate.prefix = prefix;
              }
              if (suffix !== undefined) {
                volumeUpdate.suffix = suffix;
              }

              const updateResponse = await callOpenSRF(
                "open-ils.pcrud",
                "open-ils.pcrud.update.acn",
                [authtoken, volumeUpdate]
              );

              const result = updateResponse?.payload?.[0];

              if (isSuccessResult(result) || (result && !result.ilsevent)) {
                results.push({
                  success: true,
                  copyId,
                  barcode,
                  details: { newCallNumber: callNumber, volumeId },
                });
                successCount++;
              } else {
                const errMsg = getErrorMessage(result, "Update failed");
                results.push({ success: false, copyId, barcode, error: errMsg });
                failCount++;
              }
            } catch (err) {
              results.push({ success: false, copyId, barcode, error: String(err) });
              failCount++;
            }
          }

          await audit("success", { successCount, failCount, callNumber });

          return successResponse({
            action: "update_call_number",
            callNumber,
            total: items.length,
            successCount,
            failCount,
            results,
          });
        }

        /**
         * Batch Delete
         * Deletes multiple copies (requires confirmation)
         */
        case "delete": {
          if (!confirm) {
            // Return preview of what would be deleted
            const preview: Array<{ copyId?: number; barcode?: string; title?: string }> = [];

            for (const item of items as BatchItem[]) {
              const { copyId, barcode, error } = await resolveCopyId(authtoken, item);

              if (error || !copyId) {
                preview.push({ barcode, copyId: undefined });
                continue;
              }

              // Get item details for preview
              try {
                const copyResponse = await callOpenSRF(
                  "open-ils.search",
                  "open-ils.search.asset.copy.retrieve",
                  [copyId, { flesh: 1, flesh_fields: { acp: ["call_number"] } }]
                );

                const copy = copyResponse?.payload?.[0];
                let title = "Unknown";

                if (copy?.call_number?.record) {
                  const bibResponse = await callOpenSRF(
                    "open-ils.search",
                    "open-ils.search.biblio.record.mods_slim.retrieve",
                    [copy.call_number.record]
                  );
                  const bib = bibResponse?.payload?.[0];
                  title = bib?.title || "Unknown";
                }

                preview.push({ copyId, barcode, title });
              } catch {
                preview.push({ copyId, barcode });
              }
            }

            return successResponse({
              action: "delete",
              requiresConfirmation: true,
              message: "Send confirm: true to execute deletion",
              preview,
            });
          }

          // Execute deletion
          const results: BatchResult[] = [];
          let successCount = 0;
          let failCount = 0;

          for (const item of items as BatchItem[]) {
            const { copyId, barcode, error } = await resolveCopyId(authtoken, item);

            if (error || !copyId) {
              results.push({ success: false, barcode, error: error || "Unknown error" });
              failCount++;
              continue;
            }

            try {
              // Check if copy has open circulations
              const circResponse = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.copy_circ_status",
                [authtoken, copyId]
              );

              const circStatus = circResponse?.payload?.[0];
              if (circStatus?.id) {
                results.push({
                  success: false,
                  copyId,
                  barcode,
                  error: "Cannot delete: Item has open circulation",
                });
                failCount++;
                continue;
              }

              // Delete the copy using cat service
              const deleteResponse = await callOpenSRF(
                "open-ils.cat",
                "open-ils.cat.asset.copy.delete",
                [authtoken, copyId]
              );

              const result = deleteResponse?.payload?.[0];

              if (isSuccessResult(result) || result === 1 || result === copyId) {
                results.push({ success: true, copyId, barcode });
                successCount++;
              } else {
                const errMsg = getErrorMessage(result, "Delete failed");
                results.push({ success: false, copyId, barcode, error: errMsg });
                failCount++;
              }
            } catch (err) {
              results.push({ success: false, copyId, barcode, error: String(err) });
              failCount++;
            }
          }

          await audit("success", { successCount, failCount, confirmed: true });

          return successResponse({
            action: "delete",
            total: items.length,
            successCount,
            failCount,
            results,
          });
        }

        /**
         * Batch Transfer
         * Transfers copies between locations/libraries
         */
        case "transfer": {
          const { targetOrgId, targetLocation } = body;

          if (!targetOrgId && !targetLocation) {
            return errorResponse("targetOrgId or targetLocation required for transfer", 400);
          }

          const results: BatchResult[] = [];
          let successCount = 0;
          let failCount = 0;

          for (const item of items as BatchItem[]) {
            const { copyId, barcode, error } = await resolveCopyId(authtoken, item);

            if (error || !copyId) {
              results.push({ success: false, barcode, error: error || "Unknown error" });
              failCount++;
              continue;
            }

            try {
              const updateFields: Record<string, any> = { id: copyId };

              if (targetOrgId) {
                updateFields.circ_lib = targetOrgId;
              }

              if (targetLocation) {
                updateFields.location = targetLocation;
              }

              // Use pcrud to update copy
              const updateResponse = await callOpenSRF(
                "open-ils.pcrud",
                "open-ils.pcrud.update.acp",
                [authtoken, updateFields]
              );

              const result = updateResponse?.payload?.[0];

              if (isSuccessResult(result) || (result && !result.ilsevent)) {
                results.push({
                  success: true,
                  copyId,
                  barcode,
                  details: { targetOrgId, targetLocation },
                });
                successCount++;
              } else {
                const errMsg = getErrorMessage(result, "Transfer failed");
                results.push({ success: false, copyId, barcode, error: errMsg });
                failCount++;
              }
            } catch (err) {
              results.push({ success: false, copyId, barcode, error: String(err) });
              failCount++;
            }
          }

          await audit("success", { successCount, failCount, targetOrgId, targetLocation });

          return successResponse({
            action: "transfer",
            targetOrgId,
            targetLocation,
            total: items.length,
            successCount,
            failCount,
            results,
          });
        }

        /**
         * Batch Location Update
         * Updates shelving location for multiple copies
         */
        case "update_location": {
          const { locationId } = body;

          if (!locationId) {
            return errorResponse("locationId required for update_location", 400);
          }

          const results: BatchResult[] = [];
          let successCount = 0;
          let failCount = 0;

          for (const item of items as BatchItem[]) {
            const { copyId, barcode, error } = await resolveCopyId(authtoken, item);

            if (error || !copyId) {
              results.push({ success: false, barcode, error: error || "Unknown error" });
              failCount++;
              continue;
            }

            try {
              const updateResponse = await callOpenSRF(
                "open-ils.pcrud",
                "open-ils.pcrud.update.acp",
                [authtoken, { id: copyId, location: locationId }]
              );

              const result = updateResponse?.payload?.[0];

              if (isSuccessResult(result) || (result && !result.ilsevent)) {
                results.push({
                  success: true,
                  copyId,
                  barcode,
                  details: { newLocation: locationId },
                });
                successCount++;
              } else {
                const errMsg = getErrorMessage(result, "Update failed");
                results.push({ success: false, copyId, barcode, error: errMsg });
                failCount++;
              }
            } catch (err) {
              results.push({ success: false, copyId, barcode, error: String(err) });
              failCount++;
            }
          }

          await audit("success", { successCount, failCount, locationId });

          return successResponse({
            action: "update_location",
            locationId,
            total: items.length,
            successCount,
            failCount,
            results,
          });
        }

        /**
         * Batch Circulation Modifier Update
         * Updates circ modifier for multiple copies
         */
        case "update_circ_modifier": {
          const { circModifier } = body;

          if (circModifier === undefined) {
            return errorResponse("circModifier required for update_circ_modifier", 400);
          }

          const results: BatchResult[] = [];
          let successCount = 0;
          let failCount = 0;

          for (const item of items as BatchItem[]) {
            const { copyId, barcode, error } = await resolveCopyId(authtoken, item);

            if (error || !copyId) {
              results.push({ success: false, barcode, error: error || "Unknown error" });
              failCount++;
              continue;
            }

            try {
              const updateResponse = await callOpenSRF(
                "open-ils.pcrud",
                "open-ils.pcrud.update.acp",
                [authtoken, { id: copyId, circ_modifier: circModifier || null }]
              );

              const result = updateResponse?.payload?.[0];

              if (isSuccessResult(result) || (result && !result.ilsevent)) {
                results.push({
                  success: true,
                  copyId,
                  barcode,
                  details: { newCircModifier: circModifier },
                });
                successCount++;
              } else {
                const errMsg = getErrorMessage(result, "Update failed");
                results.push({ success: false, copyId, barcode, error: errMsg });
                failCount++;
              }
            } catch (err) {
              results.push({ success: false, copyId, barcode, error: String(err) });
              failCount++;
            }
          }

          await audit("success", { successCount, failCount, circModifier });

          return successResponse({
            action: "update_circ_modifier",
            circModifier,
            total: items.length,
            successCount,
            failCount,
            results,
          });
        }

        default:
          await audit("failure", { action }, "Invalid action");
          return errorResponse(
            `Invalid action: ${action}. Valid actions: update_status, update_call_number, delete, transfer, update_location, update_circ_modifier`,
            400
          );
      }
    } catch (error) {
      return serverErrorResponse(error, "Catalog Batch POST", req);
    }
  });
}

// GET - Get available options for batch operations
export async function GET(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);
    const searchParams = req.nextUrl.searchParams;
    const optionType = searchParams.get("type");

    switch (optionType) {
      case "statuses": {
        // Get copy statuses
        const statusResponse = await callOpenSRF(
          "open-ils.search",
          "open-ils.search.config.copy_status.retrieve.all"
        );

        const statuses = statusResponse?.payload?.[0] || [];
        const formattedStatuses = (Array.isArray(statuses) ? statuses : []).map((s) => ({
          id: s.id || s.__p?.[0],
          name: s.name || s.__p?.[1],
          holdable: s.holdable === "t" || s.__p?.[2] === "t",
          opacVisible: s.opac_visible === "t" || s.__p?.[3] === "t",
          copyActive: s.copy_active === "t" || s.__p?.[4] === "t",
        }));

        return successResponse({ statuses: formattedStatuses });
      }

      case "locations": {
        // Get shelving locations for an org unit
        const orgId = parseInt(searchParams.get("org_id") || "1", 10);

        const locationResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.copy_location.retrieve.all",
          [orgId]
        );

        const locations = locationResponse?.payload?.[0] || [];
        const formattedLocations = (Array.isArray(locations) ? locations : []).map((l) => ({
          id: l.id || l.__p?.[0],
          name: l.name || l.__p?.[1],
          owningLib: l.owning_lib || l.__p?.[2],
          holdable: l.holdable === "t" || l.__p?.[3] === "t",
          opacVisible: l.opac_visible === "t" || l.__p?.[4] === "t",
          circulate: l.circulate === "t" || l.__p?.[5] === "t",
        }));

        return successResponse({ locations: formattedLocations });
      }

      case "circ_modifiers": {
        // Get circulation modifiers
        const modResponse = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.ccm.atomic",
          [authtoken, { code: { "!=": null } }, { limit: 500 }]
        );

        const modifiers = modResponse?.payload?.[0] || [];
        const formattedModifiers = (Array.isArray(modifiers) ? modifiers : []).map((m) => ({
          code: m.code || m.__p?.[0],
          name: m.name || m.__p?.[1],
          description: m.description || m.__p?.[2],
          sip2MediaType: m.sip2_media_type || m.__p?.[3],
        }));

        return successResponse({ circModifiers: formattedModifiers });
      }

      case "orgs": {
        // Get org tree for transfer targets
        const orgResponse = await callOpenSRF("open-ils.actor", "open-ils.actor.org_tree.retrieve");

        const tree = orgResponse?.payload?.[0];
        const flattenOrgs = (node: any, depth = 0): any[] => {
          if (!node) return [];
          const org = {
            id: node.id || node.__p?.[0],
            shortname: node.shortname || node.__p?.[1] || node.__p?.[2],
            name: node.name || node.__p?.[3] || node.__p?.[1],
            depth,
            ouType: node.ou_type || node.__p?.[4],
          };
          const children = node.children || node.__p?.[5] || [];
          return [
            org,
            ...(Array.isArray(children)
              ? children.flatMap((c: any) => flattenOrgs(c, depth + 1))
              : []),
          ];
        };

        return successResponse({ orgs: flattenOrgs(tree) });
      }

      default:
        return successResponse({
          availableTypes: ["statuses", "locations", "circ_modifiers", "orgs"],
          actions: [
            { name: "update_status", description: "Update copy status", requires: ["statusId"] },
            {
              name: "update_call_number",
              description: "Change call number",
              requires: ["callNumber"],
            },
            { name: "delete", description: "Delete copies", requires: ["confirm: true"] },
            {
              name: "transfer",
              description: "Transfer to different location/library",
              requires: ["targetOrgId or targetLocation"],
            },
            {
              name: "update_location",
              description: "Update shelving location",
              requires: ["locationId"],
            },
            {
              name: "update_circ_modifier",
              description: "Update circ modifier",
              requires: ["circModifier"],
            },
          ],
        });
    }
  } catch (error) {
    return serverErrorResponse(error, "Catalog Batch GET", req);
  }
}
