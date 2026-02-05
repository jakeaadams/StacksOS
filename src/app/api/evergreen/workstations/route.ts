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
  type Workstation = { id: number; name: string; owning_lib: number };

  const parseWorkstation = (ws: any): Workstation | null => {
    if (!ws) return null;

    // Handle array format: [id, name, owning_lib]
    if (Array.isArray(ws)) {
      const id = typeof ws[0] === "number" ? ws[0] : parseInt(String(ws[0] ?? ""), 10);
      const owningLib = typeof ws[2] === "number" ? ws[2] : parseInt(String(ws[2] ?? ""), 10);
      const name = typeof ws[1] === "string" ? ws[1] : String(ws[1] ?? "");
      if (!Number.isFinite(id) || id <= 0) return null;
      return {
        id,
        name: name.trim() || `Workstation ${id}`,
        owning_lib: Number.isFinite(owningLib) ? owningLib : 0,
      };
    }

    // Handle primitive (just an ID)
    if (typeof ws === "number") {
      return { id: ws, name: `Workstation ${ws}`, owning_lib: 0 };
    }

    if (typeof ws !== "object") return null;

    // Check if it looks like an error event
    if ((ws as any).ilsevent !== undefined) return null;

    // Fieldmapper shape (raw)
    if (typeof (ws as any).__c === "string" && Array.isArray((ws as any).__p)) {
      const p = (ws as any).__p as any[];
      const id = typeof p[0] === "number" ? p[0] : parseInt(String(p[0] ?? ""), 10);
      const owningLib = typeof p[2] === "number" ? p[2] : parseInt(String(p[2] ?? ""), 10);
      const name = typeof p[1] === "string" ? p[1] : String(p[1] ?? "");
      if (!Number.isFinite(id) || id <= 0) return null;
      return {
        id,
        name: name.trim() || `Workstation ${id}`,
        owning_lib: Number.isFinite(owningLib) ? owningLib : 0,
      };
    }

    // Fieldmapper decoded shape
    const idRaw = (ws as any).id ?? (ws as any).wsid;
    const id = typeof idRaw === "number" ? idRaw : parseInt(String(idRaw ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) return null;

    const nameRaw = (ws as any).name ?? (ws as any).wsname;
    const owningLibRaw = (ws as any).owning_lib ?? (ws as any).owner ?? (ws as any).org_unit;
    const owningLib =
      typeof owningLibRaw === "number" ? owningLibRaw : parseInt(String(owningLibRaw ?? ""), 10);
    const name = typeof nameRaw === "string" ? nameRaw : String(nameRaw ?? "");

    return {
      id,
      name: name.trim() || `Workstation ${id}`,
      owning_lib: Number.isFinite(owningLib) ? owningLib : 0,
    };
  };

  const out: Workstation[] = [];
  const seen = new Set<number>();

  const visit = (value: any) => {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const parsed = parseWorkstation(value);
    if (parsed) {
      if (!seen.has(parsed.id)) {
        seen.add(parsed.id);
        out.push(parsed);
      }
      return;
    }

    if (typeof value === "object") {
      // Evergreen workstation.list returns a hash keyed by org unit id:
      // { "101": [workstation,...], "102": [...] }
      for (const v of Object.values(value as Record<string, unknown>)) {
        visit(v);
      }
    }
  };

  visit(rawData);
  return out;
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
      requestId,
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
