import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
  payloadFirst,
  payloadFirstArray,
  fieldValue,
  fieldBool,
  PGT_FIELDS,
  PPL_FIELDS,
  PGPM_FIELDS,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { featureFlags } from "@/lib/feature-flags";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { z } from "zod";

// ============================================================================
// GET - Fetch permission groups and permissions
// ============================================================================

const permissionsPostSchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // groups, permissions, group_perms
    const groupId = searchParams.get("group_id");
    const limit = parseInt(searchParams.get("limit") || "500", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);

    logger.info({ requestId, route: "api.evergreen.permissions", type }, "Permissions request");

    switch (type) {
      case "groups": {
        // Query permission.grp_tree for all permission groups
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.pgt.atomic", [
          authtoken,
          { id: { "!=": null } },
          {
            flesh: 1,
            flesh_fields: { pgt: ["parent"] },
            limit,
            offset,
            order_by: { pgt: "id" },
          },
        ]);

        const groups = payloadFirstArray(response).map((g: any) => ({
          id: fieldValue(g, "id", PGT_FIELDS),
          name: fieldValue(g, "name", PGT_FIELDS),
          parent: fieldValue(g, "parent", PGT_FIELDS),
          parentName:
            typeof g?.parent === "object" ? fieldValue(g.parent, "name", PGT_FIELDS) : null,
          description: fieldValue(g, "description", PGT_FIELDS),
          permInterval: fieldValue(g, "perm_interval", PGT_FIELDS),
          application_perm: fieldValue(g, "application_perm", PGT_FIELDS),
          userPenaltyThreshold: fieldValue(g, "usergroup", PGT_FIELDS),
          holdPriority: fieldValue(g, "hold_priority", PGT_FIELDS),
        }));

        return successResponse({ groups });
      }

      case "permissions": {
        // Query permission.perm_list for all available permissions
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.ppl.atomic", [
          authtoken,
          { id: { "!=": null } },
          { limit: 1000, order_by: { ppl: "code" } },
        ]);

        const permissions = payloadFirstArray(response).map((p: any) => ({
          id: fieldValue(p, "id", PPL_FIELDS),
          code: fieldValue(p, "code", PPL_FIELDS),
          description: fieldValue(p, "description", PPL_FIELDS),
        }));

        return successResponse({ permissions });
      }

      case "group_perms": {
        if (!groupId) {
          return errorResponse("group_id is required for group_perms type", 400);
        }

        // Query permission.grp_perm_map for permissions assigned to this group
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.pgpm.atomic", [
          authtoken,
          { grp: parseInt(groupId, 10) },
          {
            flesh: 2,
            flesh_fields: {
              pgpm: ["perm", "grp"],
              ppl: [],
            },
            limit,
            offset,
          },
        ]);

        const groupPerms = payloadFirstArray(response).map((gp: any) => {
          const permObj = gp?.perm ?? null;

          return {
            id: fieldValue(gp, "id", PGPM_FIELDS),
            grp: fieldValue(gp, "grp", PGPM_FIELDS),
            perm: fieldValue(gp, "perm", PGPM_FIELDS),
            permCode: typeof permObj === "object" ? fieldValue(permObj, "code", PPL_FIELDS) : null,
            permDescription:
              typeof permObj === "object" ? fieldValue(permObj, "description", PPL_FIELDS) : null,
            depth: fieldValue(gp, "depth", PGPM_FIELDS),
            grantable: fieldBool(gp, "grantable", PGPM_FIELDS) ?? false,
          };
        });

        return successResponse({ groupPerms, groupId: parseInt(groupId, 10) });
      }

      default:
        return errorResponse(
          "Invalid type parameter. Use: groups, permissions, or group_perms",
          400
        );
    }
  } catch (error: any) {
    return serverErrorResponse(error, "Permissions GET", req);
  }
}

// ============================================================================
// POST - Create or update permission groups and mappings
// ============================================================================

export async function POST(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    if (!featureFlags.permissionsExplorer) {
      return errorResponse("Permission editors are disabled", 403);
    }

    const body = permissionsPostSchema.parse(await req.json());
    const { action } = body;
    const { type, data } = body as Record<string, any>;

    // Require admin permissions for modifications
    const { authtoken, actor } = await requirePermissions(["GROUP_APPLICATION_PERM"]);

    logger.info(
      { requestId, route: "api.evergreen.permissions", action, type },
      "Permissions update"
    );

    const requestMeta = getRequestMeta(req);
    const auditBase = {
      actor,
      orgId: actor?.ws_ou ?? actor?.home_ou,
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
      requestId: requestMeta.requestId,
    };

    const audit = async (event: {
      action: string;
      entity: string;
      entityId?: string | number;
      status: "success" | "failure";
      details?: Record<string, any>;
      error?: string | null;
    }) => {
      try {
        await logAuditEvent({
          ...auditBase,
          ...event,
        });
      } catch {
        // Audit must never break the request path.
      }
    };

    switch (type) {
      case "group": {
        if (action === "create") {
          if (!data?.name) {
            return errorResponse("Group name is required", 400);
          }

          const newGroup = {
            __c: "pgt",
            __p: [
              null, // id
              data.name,
              data.parent || null,
              data.description || null,
              data.permInterval || null,
              data.applicationPerm || null,
              data.userPenaltyThreshold || null,
              data.holdPriority || null,
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.pgt", [
            authtoken,
            newGroup,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "perm.group.create",
              entity: "pgt",
              status: "failure",
              error: result.textcode || "Failed to create group",
              details: {
                name: data.name,
                parent: data.parent || null,
                applicationPerm: data.applicationPerm || null,
              },
            });
            return errorResponse(result.textcode || "Failed to create group", 400, result);
          }

          const createdId = result?.id ?? result?.__p?.[PGT_FIELDS.id];
          await audit({
            action: "perm.group.create",
            entity: "pgt",
            entityId: createdId,
            status: "success",
            details: {
              name: data.name,
              parent: data.parent || null,
              applicationPerm: data.applicationPerm || null,
            },
          });

          return successResponse({
            created: true,
            id: createdId,
            name: data.name,
          });
        }

        if (action === "update") {
          if (!data?.id) {
            return errorResponse("Group ID is required", 400);
          }

          // Fetch existing group first
          const fetchResponse = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.pgt", [
            authtoken,
            data.id,
          ]);

          const existing = payloadFirst(fetchResponse);
          if (!existing) {
            return errorResponse("Group not found", 404);
          }

          const updatePayload = {
            __c: "pgt",
            __p: [
              data.id,
              data.name ?? existing?.name ?? existing?.__p?.[1],
              data.parent ?? existing?.parent ?? existing?.__p?.[2],
              data.description ?? existing?.description ?? existing?.__p?.[3],
              data.permInterval ?? existing?.perm_interval ?? existing?.__p?.[4],
              data.applicationPerm ?? existing?.application_perm ?? existing?.__p?.[5],
              data.userPenaltyThreshold ?? existing?.userpenalty ?? existing?.__p?.[6],
              data.holdPriority ?? existing?.hold_priority ?? existing?.__p?.[7],
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.pgt", [
            authtoken,
            updatePayload,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "perm.group.update",
              entity: "pgt",
              entityId: data.id,
              status: "failure",
              error: result.textcode || "Failed to update group",
              details: { id: data.id, name: data.name ?? null, parent: data.parent ?? null },
            });
            return errorResponse(result.textcode || "Failed to update group", 400, result);
          }

          await audit({
            action: "perm.group.update",
            entity: "pgt",
            entityId: data.id,
            status: "success",
            details: { id: data.id, name: data.name ?? null, parent: data.parent ?? null },
          });

          return successResponse({
            updated: true,
            id: data.id,
          });
        }

        return errorResponse("Invalid action for group type", 400);
      }

      case "group_perm": {
        if (action === "add") {
          if (!data?.grp || !data?.perm) {
            return errorResponse("Group ID and permission ID are required", 400);
          }

          const newMapping = {
            __c: "pgpm",
            __p: [
              null, // id
              data.grp,
              data.perm,
              data.depth ?? 0,
              data.grantable ? "t" : "f",
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.pgpm", [
            authtoken,
            newMapping,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "perm.group_perm.add",
              entity: "pgpm",
              status: "failure",
              error: result.textcode || "Failed to add permission",
              details: {
                grp: data.grp,
                perm: data.perm,
                depth: data.depth ?? 0,
                grantable: Boolean(data.grantable),
              },
            });
            return errorResponse(result.textcode || "Failed to add permission", 400, result);
          }

          const createdId = result?.id ?? result?.__p?.[PGPM_FIELDS.id];
          await audit({
            action: "perm.group_perm.add",
            entity: "pgpm",
            entityId: createdId,
            status: "success",
            details: {
              grp: data.grp,
              perm: data.perm,
              depth: data.depth ?? 0,
              grantable: Boolean(data.grantable),
            },
          });

          return successResponse({
            added: true,
            id: createdId,
            grp: data.grp,
            perm: data.perm,
          });
        }

        if (action === "remove") {
          if (!data?.id) {
            return errorResponse("Mapping ID is required", 400);
          }

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.pgpm", [
            authtoken,
            data.id,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "perm.group_perm.remove",
              entity: "pgpm",
              entityId: data.id,
              status: "failure",
              error: result.textcode || "Failed to remove permission",
              details: { id: data.id },
            });
            return errorResponse(result.textcode || "Failed to remove permission", 400, result);
          }

          await audit({
            action: "perm.group_perm.remove",
            entity: "pgpm",
            entityId: data.id,
            status: "success",
            details: { id: data.id },
          });

          return successResponse({
            removed: true,
            id: data.id,
          });
        }

        if (action === "update") {
          if (!data?.id) {
            return errorResponse("Mapping ID is required", 400);
          }

          // Fetch existing mapping
          const fetchResponse = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.retrieve.pgpm",
            [authtoken, data.id]
          );

          const existing = payloadFirst(fetchResponse);
          if (!existing) {
            return errorResponse("Permission mapping not found", 404);
          }

          const updatePayload = {
            __c: "pgpm",
            __p: [
              data.id,
              existing?.grp ?? existing?.__p?.[1],
              existing?.perm ?? existing?.__p?.[2],
              data.depth ?? existing?.depth ?? existing?.__p?.[3],
              data.grantable !== undefined
                ? data.grantable
                  ? "t"
                  : "f"
                : (existing?.grantable ?? existing?.__p?.[4]),
            ],
          };

          const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.pgpm", [
            authtoken,
            updatePayload,
          ]);

          const result = payloadFirst(response);

          if (result?.ilsevent && result.ilsevent !== 0) {
            await audit({
              action: "perm.group_perm.update",
              entity: "pgpm",
              entityId: data.id,
              status: "failure",
              error: result.textcode || "Failed to update mapping",
              details: {
                id: data.id,
                depth: data.depth ?? null,
                grantable: data.grantable ?? null,
              },
            });
            return errorResponse(result.textcode || "Failed to update mapping", 400, result);
          }

          await audit({
            action: "perm.group_perm.update",
            entity: "pgpm",
            entityId: data.id,
            status: "success",
            details: { id: data.id, depth: data.depth ?? null, grantable: data.grantable ?? null },
          });

          return successResponse({
            updated: true,
            id: data.id,
          });
        }

        return errorResponse("Invalid action for group_perm type", 400);
      }

      default:
        return errorResponse("Invalid type. Use: group or group_perm", 400);
    }
  } catch (error: any) {
    return serverErrorResponse(error, "Permissions POST", req);
  }
}
