import { NextRequest } from "next/server";
import {

  callOpenSRF,
  requireAuthToken,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";


/**
 * Parse Evergreen workstation response into a consistent array format.
 * Evergreen can return workstations in various formats:
 * - Array of workstation objects
 * - Array of arrays [[id, name, owning_lib], ...]
 * - Single workstation object
 * - Nested structure
 */
function parseWorkstations(rawData: any): Array<{ id: number; name: string; owning_lib: number }> {
  if (!rawData) return [];

  // If it's already an array, process each item
  if (Array.isArray(rawData)) {
    return rawData.map((ws: any) => {
      // Handle array format: [id, name, owning_lib]
      if (Array.isArray(ws)) {
        return {
          id: ws[0] ?? 0,
          name: ws[1] ?? "Unknown",
          owning_lib: ws[2] ?? 0,
        };
      }
      // Handle object format
      if (ws && typeof ws === "object") {
        return {
          id: ws.id ?? ws.wsid ?? 0,
          name: ws.name ?? ws.wsname ?? "Unknown",
          owning_lib: ws.owning_lib ?? ws.owner ?? ws.org_unit ?? 0,
        };
      }
      // Handle primitive (just an ID)
      if (typeof ws === "number") {
        return { id: ws, name: `Workstation ${ws}`, owning_lib: 0 };
      }
      return { id: 0, name: "Unknown", owning_lib: 0 };
    }).filter((ws) => ws.id !== 0 || ws.name !== "Unknown");
  }

  // If it's a single object, wrap in array
  if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
    // Check if it looks like an error event
    if (rawData.ilsevent !== undefined) {
      return [];
    }
    // Single workstation object
    if (rawData.id || rawData.name) {
      return [{
        id: rawData.id ?? 0,
        name: rawData.name ?? "Unknown",
        owning_lib: rawData.owning_lib ?? rawData.owner ?? 0,
      }];
    }
  }

  return [];
}

// GET - List workstations for an org unit
export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id") || "1";

    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.workstation.list",
      [authtoken, parseInt(orgId)]
    );

    // Parse the response into consistent format
    const rawData = response?.payload?.[0];
    const workstations = parseWorkstations(rawData);

    return successResponse({
      workstations,
    });
  } catch (error) {
    return serverErrorResponse(error, "Workstations GET", req);
  }
}

// POST - Register a new workstation
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { name, org_id } = await req.json();

    if (!name || !org_id) {
      return errorResponse("Workstation name and org_id are required", 400);
    }

    const orgId = parseInt(org_id);
    const { authtoken, actor } = await requirePermissions(["REGISTER_WORKSTATION"], orgId);

    logger.info({ requestId, route: "api.evergreen.workstations", name, orgId }, "Registering workstation");

    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.workstation.register",
      [authtoken, name, orgId]
    );

    const result = response?.payload?.[0];

    const numericResult =
      typeof result === "number"
        ? result
        : typeof result === "string"
          ? parseInt(result, 10)
          : null;

    if (typeof numericResult === "number" && numericResult > 0) {
      await logAuditEvent({
        action: "workstation.register",
        entity: "workstation",
        entityId: numericResult,
        status: "success",
        actor,
        orgId,
        ip,
        userAgent,
        requestId,
        details: { name },
      });

      return successResponse({
        workstation_id: numericResult,
        name: name,
      });
    }

    await logAuditEvent({
      action: "workstation.register",
      entity: "workstation",
      status: "failure",
      actor,
      orgId,
      ip,
      userAgent,
      details: { name },
      error: getErrorMessage(result, "Registration failed"),
    });

    return errorResponse(
      getErrorMessage(result, "Registration failed"),
      400,
      result
    );
  } catch (error) {
    return serverErrorResponse(error, "Workstations POST", req);
  }
}
