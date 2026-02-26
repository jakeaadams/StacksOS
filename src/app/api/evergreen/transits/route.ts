import { NextRequest } from "next/server";
import {
  callOpenSRF,
  callPcrud,
  requireAuthToken,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

interface TransitRecord {
  id: number;
  source: number;
  dest: number;
  target_copy: number;
  source_send_time: string;
  dest_recv_time: string | null;
  copy_status: number;
  hold_type: string | null;
  hold: number | null;
  barcode?: string;
  title?: string;
  call_number?: string;
}

function normalizeRows(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload?.[0])) return payload[0];
  if (Array.isArray(payload)) return payload;
  return [];
}

/**
 * GET - Fetch transits to/from a location
 */
const transitsPostSchema = z
  .object({
    action: z.string().trim().min(1),
    transit_id: z.coerce.number().int().positive().optional(),
    copy_barcode: z.string().trim().optional(),
    reason: z.string().max(1024).optional(),
    notes: z.string().max(2048).optional(),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const searchParams = req.nextUrl.searchParams;
    const orgId = searchParams.get("org_id") || "1";
    const direction = searchParams.get("direction") || "incoming";

    let rawTransits: any = null;
    try {
      const transitResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.transit.retrieve_by_org",
        [authtoken, parseInt(orgId), { direction }]
      );
      rawTransits = transitResponse?.payload?.[0];
    } catch (_error) {
      // Some Evergreen installs do not expose open-ils.circ.transit.retrieve_by_org.
      // Fall back to a pcrud query below.
      rawTransits = null;
    }

    if (Array.isArray(rawTransits)) {
      const transits: TransitRecord[] = rawTransits.map((t) => ({
        id: t.id,
        source: t.source,
        dest: t.dest,
        target_copy: t.target_copy,
        source_send_time: t.source_send_time,
        dest_recv_time: t.dest_recv_time,
        copy_status: t.copy_status,
        hold_type: t.hold_transit_copy?.hold?.hold_type || null,
        hold: t.hold_transit_copy?.hold?.id || null,
        barcode: t.target_copy?.barcode || t.copy?.barcode || null,
        title: t.target_copy?.call_number?.record?.simple_record?.title || null,
        call_number: t.target_copy?.call_number?.label || null,
      }));

      return successResponse({ transits });
    }

    const pcrudResponse = await callPcrud("open-ils.pcrud.search.atc", [
      authtoken,
      direction === "incoming"
        ? { dest: parseInt(orgId), dest_recv_time: null }
        : { source: parseInt(orgId), dest_recv_time: null },
      { flesh: 2, flesh_fields: { atc: ["target_copy"], acp: ["call_number"] } },
    ]);

    const rows = normalizeRows(pcrudResponse?.payload);
    const transits: TransitRecord[] = rows.map((t) => ({
      id: t.id,
      source: t.source,
      dest: t.dest,
      target_copy: typeof t.target_copy === "object" ? t.target_copy.id : t.target_copy,
      source_send_time: t.source_send_time,
      dest_recv_time: t.dest_recv_time,
      copy_status: t.copy_status,
      hold_type: null,
      hold: null,
      barcode: t.target_copy?.barcode || null,
      title: undefined,
      call_number: t.target_copy?.call_number?.label || null,
    }));

    return successResponse({ transits });
  } catch (error) {
    return serverErrorResponse(error, "Transits GET", req);
  }
}

/**
 * POST - Cancel, receive, or record exception for transit
 */
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const body = transitsPostSchema.parse(await req.json());
    const { action, transit_id, copy_barcode, reason, notes } = body;

    if (!action) {
      return errorResponse("Action required", 400);
    }

    const { authtoken, actor } = await requirePermissions([
      "ABORT_TRANSIT",
      "COPY_TRANSIT_RECEIVE",
    ]);

    const audit = async (
      status: "success" | "failure",
      details?: Record<string, any>,
      error?: string
    ) => {
      await logAuditEvent({
        action: `transit.${action}`,
        status,
        actor,
        ip,
        userAgent,
        requestId,
        details,
        error: error || null,
      });
    };

    if (action === "cancel" || action === "abort") {
      if (!transit_id) {
        return errorResponse("transit_id required", 400);
      }

      const response = await callOpenSRF("open-ils.circ", "open-ils.circ.transit.abort", [
        authtoken,
        { transitid: transit_id },
      ]);

      const result = response?.payload?.[0];

      if (result === 1 || result === true || (result && !result.ilsevent)) {
        await audit("success", { transit_id, reason });
        return successResponse({ result: "Transit cancelled" });
      }

      const message = getErrorMessage(result, "Failed to cancel transit");
      await audit("failure", { transit_id }, message);
      return errorResponse(message, 400);
    }

    if (action === "receive") {
      if (!copy_barcode) {
        return errorResponse("copy_barcode required", 400);
      }

      const response = await callOpenSRF("open-ils.circ", "open-ils.circ.checkin", [
        authtoken,
        { copy_barcode },
      ]);

      const result = response?.payload?.[0];

      if (result?.ilsevent === 0 || result?.payload) {
        await audit("success", { copy_barcode });
        return successResponse({
          result: "Transit received",
          hold: result?.payload?.hold ? { id: result.payload.hold.id } : null,
        });
      }

      const message = getErrorMessage(result, "Failed to receive transit");
      await audit("failure", { copy_barcode }, message);
      return errorResponse(message, 400);
    }

    if (action === "exception") {
      if (!transit_id || !reason) {
        return errorResponse("transit_id and reason required", 400);
      }

      // Record the exception in audit log and abort the transit
      await audit("success", {
        transit_id,
        exception_reason: reason,
        exception_notes: notes || null,
      });

      // Abort the transit to remove it from active transits
      const response = await callOpenSRF("open-ils.circ", "open-ils.circ.transit.abort", [
        authtoken,
        { transitid: transit_id },
      ]);

      const result = response?.payload?.[0];

      if (result === 1 || result === true || (result && !result.ilsevent)) {
        return successResponse({
          result: "Transit exception recorded",
          exception: {
            transit_id,
            reason,
            notes: notes || null,
          },
        });
      }

      const message = getErrorMessage(result, "Failed to record transit exception");
      await audit("failure", { transit_id, reason }, message);
      return errorResponse(message, 400);
    }

    return errorResponse("Invalid action. Use: cancel, receive, exception", 400);
  } catch (error) {
    return serverErrorResponse(error, "Transits POST", req);
  }
}
