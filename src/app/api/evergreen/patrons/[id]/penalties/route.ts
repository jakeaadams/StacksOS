import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  parseJsonBody,
  encodeFieldmapper,
  getErrorMessage,
  isOpenSRFEvent,
  getPatronFleshed,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface PenaltyType {
  id: number;
  name: string;
  label: string;
  blockList: string;
  orgUnit: number | null;
}

interface PatronPenalty {
  id: number;
  patronId: number;
  penaltyType: number;
  orgUnit: number;
  note: string | null;
  staff: number | null;
  setDate: string | null;
  stopDate: string | null;
  penaltyName: string;
  penaltyLabel: string;
}

function getRequestMeta(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent") || null,
    requestId: req.headers.get("x-request-id") || null,
  };
}

function parsePenaltyTypePayload(t: Record<string, unknown>): PenaltyType {
  const rawFields = t.__p as unknown[] | undefined;
  return {
    id: (t.id as number) || (rawFields?.[0] as number) || 0,
    name: (t.name as string) || (rawFields?.[1] as string) || "Unknown",
    label: (t.label as string) || (rawFields?.[2] as string) || (t.name as string) || "Unknown",
    blockList: (t.block_list as string) || (rawFields?.[3] as string) || "",
    orgUnit: (t.org_unit as number) || (rawFields?.[4] as number) || null,
  };
}

function parsePenaltyPayload(p: Record<string, unknown>, penaltyTypes: PenaltyType[]): PatronPenalty {
  const rawFields = p.__p as unknown[] | undefined;
  const penaltyTypeId = (p.standing_penalty as number) || (rawFields?.[1] as number) || 0;
  const penaltyTypeInfo = penaltyTypes.find((t) => t.id === penaltyTypeId);
  
  const spData = p.standing_penalty as Record<string, unknown> | undefined;
  const spName = spData?.name || spData?.label || penaltyTypeInfo?.name || "";
  const spLabel = spData?.label || spData?.name || penaltyTypeInfo?.label || "Unknown Penalty";

  return {
    id: (p.id as number) || (rawFields?.[0] as number) || 0,
    patronId: (p.usr as number) || (rawFields?.[2] as number) || 0,
    penaltyType: penaltyTypeId,
    orgUnit: (p.org_unit as number) || (rawFields?.[3] as number) || 0,
    note: (p.note as string) || (rawFields?.[4] as string) || null,
    staff: (p.staff as number) || (rawFields?.[5] as number) || null,
    setDate: (p.set_date as string) || (rawFields?.[6] as string) || null,
    stopDate: (p.stop_date as string) || (rawFields?.[7] as string) || null,
    penaltyName: String(spName),
    penaltyLabel: String(spLabel),
  };
}

/**
 * GET /api/evergreen/patrons/[id]/penalties
 * Fetch all penalties for a patron and penalty types
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { authtoken } = await requirePermissions(["VIEW_USER"]);
    const { id } = await params;
    const patronId = parseInt(id, 10);
    const searchParams = req.nextUrl.searchParams;
    const includeTypes = searchParams.get("includeTypes") !== "false";

    if (!Number.isFinite(patronId)) {
      return errorResponse("Invalid patron ID", 400);
    }

    // Fetch patron with standing_penalties fleshed
    const patron = await getPatronFleshed(authtoken, patronId);
    
    if (!patron || (patron as Record<string, unknown>).ilsevent) {
      return errorResponse("Patron not found", 404);
    }

    // Fetch penalty types if requested
    let penaltyTypes: PenaltyType[] = [];
    if (includeTypes) {
      const typesResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.standing_penalty.types.retrieve"
      );
      const rawTypes = typesResponse?.payload?.[0];
      penaltyTypes = (Array.isArray(rawTypes) ? rawTypes : []).map(
        (t: Record<string, unknown>) => parsePenaltyTypePayload(t)
      );
    }

    const rawPenalties = (patron as Record<string, unknown>).standing_penalties;
    const penalties: PatronPenalty[] = (Array.isArray(rawPenalties) ? rawPenalties : []).map(
      (p: Record<string, unknown>) => parsePenaltyPayload(p, penaltyTypes)
    );

    return successResponse({ 
      penalties,
      penaltyTypes: includeTypes ? penaltyTypes : undefined,
    });
  } catch (error) {
    return serverErrorResponse(error, "Patron Penalties GET", req);
  }
}

/**
 * POST /api/evergreen/patrons/[id]/penalties
 * Apply a new penalty to a patron
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { id } = await params;
    const patronId = parseInt(id, 10);
    const { ip, userAgent } = getRequestMeta(req);

    if (!Number.isFinite(patronId)) {
      return errorResponse("Invalid patron ID", 400);
    }

    const body = await parseJsonBody(req);
    if (!body) {
      return errorResponse("Request body required", 400);
    }

    const penaltyType = parseInt(String(body.penaltyType || body.standing_penalty || ""), 10);
    const note = String(body.note || "").trim();
    const orgUnit = parseInt(
      String(body.orgUnit || body.org_unit || (actor as Record<string, unknown>)?.ws_ou || 1),
      10
    );

    if (!Number.isFinite(penaltyType)) {
      return errorResponse("Penalty type is required", 400);
    }

    const penalty = encodeFieldmapper("ausp", {
      usr: patronId,
      standing_penalty: penaltyType,
      org_unit: orgUnit,
      note: note || null,
      staff: (actor as Record<string, unknown>)?.id,
      set_date: "now",
      isnew: 1,
    });

    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.penalty.apply",
      [authtoken, penalty]
    );

    const result = response?.payload?.[0];
    if (isOpenSRFEvent(result) || (result as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to apply penalty"), 400, result);
    }

    await logAuditEvent({
      action: "patron.penalty.apply",
      entity: "patron",
      entityId: patronId,
      status: "success",
      actor,
      ip,
      userAgent,
      details: { penaltyType, note, orgUnit },
    });

    logger.info({ patronId, penaltyId: result, penaltyType }, "Patron penalty applied");

    return successResponse({ penaltyId: result, message: "Penalty applied successfully" });
  } catch (error) {
    return serverErrorResponse(error, "Patron Penalties POST", req);
  }
}

/**
 * DELETE /api/evergreen/patrons/[id]/penalties
 * Remove a penalty from a patron
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { id } = await params;
    const patronId = parseInt(id, 10);
    const { ip, userAgent } = getRequestMeta(req);

    if (!Number.isFinite(patronId)) {
      return errorResponse("Invalid patron ID", 400);
    }

    const body = await parseJsonBody(req);
    if (!body) {
      return errorResponse("Request body required", 400);
    }

    const penaltyId = parseInt(String(body.penaltyId || body.penalty_id || ""), 10);

    if (!Number.isFinite(penaltyId)) {
      return errorResponse("Penalty ID is required", 400);
    }

    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.penalty.remove",
      [authtoken, penaltyId]
    );

    const result = response?.payload?.[0];
    if (isOpenSRFEvent(result) || (result as Record<string, unknown>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to remove penalty"), 400, result);
    }

    await logAuditEvent({
      action: "patron.penalty.remove",
      entity: "patron",
      entityId: patronId,
      status: "success",
      actor,
      ip,
      userAgent,
      details: { penaltyId },
    });

    logger.info({ patronId, penaltyId }, "Patron penalty removed");

    return successResponse({ message: "Penalty removed successfully" });
  } catch (error) {
    return serverErrorResponse(error, "Patron Penalties DELETE", req);
  }
}
