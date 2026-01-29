import { NextRequest } from "next/server";
import {

  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";


// ============================================================================
// GET - Fetch permission groups and permissions
// ============================================================================

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
        const response = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.pgt.atomic",
          [
            authtoken,
            { id: { "!=": null } },
            {
              flesh: 1,
              flesh_fields: { pgt: ["parent"] },
              limit,
              offset,
              order_by: { pgt: "id" },
            },
          ]
        );

        const groups = (response?.payload?.[0] || []).map((g: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] ?? obj?.__p?.[idx];
          };

          return {
            id: extract(g, "id", 0),
            name: extract(g, "name", 1),
            parent: extract(g, "parent", 2),
            parentName: typeof g?.parent === "object" 
              ? (g.parent?.name ?? g.parent?.__p?.[1]) 
              : null,
            description: extract(g, "description", 3),
            permInterval: extract(g, "perm_interval", 4),
            application_perm: extract(g, "application_perm", 5),
            userPenaltyThreshold: extract(g, "userpenalty", 6),
            holdPriority: extract(g, "hold_priority", 7),
          };
        });

        return successResponse({ groups });
      }

      case "permissions": {
        // Query permission.perm_list for all available permissions
        const response = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.ppl.atomic",
          [
            authtoken,
            { id: { "!=": null } },
            { limit: 1000, order_by: { ppl: "code" } },
          ]
        );

        const permissions = (response?.payload?.[0] || []).map((p: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] ?? obj?.__p?.[idx];
          };

          return {
            id: extract(p, "id", 0),
            code: extract(p, "code", 1),
            description: extract(p, "description", 2),
          };
        });

        return successResponse({ permissions });
      }

      case "group_perms": {
        if (!groupId) {
          return errorResponse("group_id is required for group_perms type", 400);
        }

        // Query permission.grp_perm_map for permissions assigned to this group
        const response = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.pgpm.atomic",
          [
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
          ]
        );

        const groupPerms = (response?.payload?.[0] || []).map((gp: any) => {
          const extract = (obj: any, field: string, idx: number) => {
            if (!obj) return null;
            return obj?.[field] ?? obj?.__p?.[idx];
          };

          const permObj = gp?.perm ?? null;

          return {
            id: extract(gp, "id", 0),
            grp: extract(gp, "grp", 1),
            perm: extract(gp, "perm", 2),
            permCode: typeof permObj === "object"
              ? (permObj?.code ?? permObj?.__p?.[1])
              : null,
            permDescription: typeof permObj === "object"
              ? (permObj?.description ?? permObj?.__p?.[2])
              : null,
            depth: extract(gp, "depth", 3),
            grantable: extract(gp, "grantable", 4) === "t" || extract(gp, "grantable", 4) === true,
          };
        });

        return successResponse({ groupPerms, groupId: parseInt(groupId, 10) });
      }

      default:
        return errorResponse("Invalid type parameter. Use: groups, permissions, or group_perms", 400);
    }
  } catch (error) {
    return serverErrorResponse(error, "Permissions GET", req);
  }
}

// ============================================================================
// POST - Create or update permission groups and mappings
// ============================================================================

export async function POST(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const body = await req.json();
    const { action, type, data } = body;

    // Require admin permissions for modifications
    const { authtoken } = await requirePermissions(["GROUP_APPLICATION_PERM"]);

    logger.info({ requestId, route: "api.evergreen.permissions", action, type }, "Permissions update");

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

          const response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.create.pgt",
            [authtoken, newGroup]
          );

          const result = response?.payload?.[0];

          if (result?.ilsevent && result.ilsevent !== 0) {
            return errorResponse(result.textcode || "Failed to create group", 400, result);
          }

          return successResponse({
            created: true,
            id: result?.id ?? result?.__p?.[0],
            name: data.name,
          });
        }

        if (action === "update") {
          if (!data?.id) {
            return errorResponse("Group ID is required", 400);
          }

          // Fetch existing group first
          const fetchResponse = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.retrieve.pgt",
            [authtoken, data.id]
          );

          const existing = fetchResponse?.payload?.[0];
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

          const response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.update.pgt",
            [authtoken, updatePayload]
          );

          const result = response?.payload?.[0];

          if (result?.ilsevent && result.ilsevent !== 0) {
            return errorResponse(result.textcode || "Failed to update group", 400, result);
          }

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

          const response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.create.pgpm",
            [authtoken, newMapping]
          );

          const result = response?.payload?.[0];

          if (result?.ilsevent && result.ilsevent !== 0) {
            return errorResponse(result.textcode || "Failed to add permission", 400, result);
          }

          return successResponse({
            added: true,
            id: result?.id ?? result?.__p?.[0],
            grp: data.grp,
            perm: data.perm,
          });
        }

        if (action === "remove") {
          if (!data?.id) {
            return errorResponse("Mapping ID is required", 400);
          }

          const response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.delete.pgpm",
            [authtoken, data.id]
          );

          const result = response?.payload?.[0];

          if (result?.ilsevent && result.ilsevent !== 0) {
            return errorResponse(result.textcode || "Failed to remove permission", 400, result);
          }

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

          const existing = fetchResponse?.payload?.[0];
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
                ? (data.grantable ? "t" : "f")
                : (existing?.grantable ?? existing?.__p?.[4]),
            ],
          };

          const response = await callOpenSRF(
            "open-ils.pcrud",
            "open-ils.pcrud.update.pgpm",
            [authtoken, updatePayload]
          );

          const result = response?.payload?.[0];

          if (result?.ilsevent && result.ilsevent !== 0) {
            return errorResponse(result.textcode || "Failed to update mapping", 400, result);
          }

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
  } catch (error) {
    return serverErrorResponse(error, "Permissions POST", req);
  }
}
