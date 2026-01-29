import { NextRequest, NextResponse } from "next/server";
import {

  callOpenSRF,
  requireAuthToken,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getErrorMessage,
  isOpenSRFEvent,
  parseJsonBody,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";


export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const action = req.nextUrl.searchParams.get("action");

    if (action === "sources") {
      const sourcesResponse = await callOpenSRF(
        "open-ils.cat",
        "open-ils.cat.bib_sources.retrieve.all",
        [authtoken]
      );
      const payload = sourcesResponse?.payload?.[0];
      if (isOpenSRFEvent(payload) || payload?.ilsevent) {
        return errorResponse(
          getErrorMessage(payload, "Failed to load MARC sources"),
          400,
          payload
        );
      }
      const sources = Array.isArray(payload)
        ? payload.map((source: any) => ({
            id: source?.id,
            source: source?.source || source?.name || "",
          }))
        : [];
      if (!sources.length) {
        return successResponse({ sources }, "No MARC sources configured");
      }

      return successResponse({ sources });
    }

    return errorResponse("Invalid action", 400);
  } catch (error) {
    return serverErrorResponse(error, "MARC GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent } = getRequestMeta(req);
  try {
    const body = await parseJsonBody<Record<string, any>>(req);
    if (body instanceof NextResponse) return body;

    const { authtoken, actor } = await requirePermissions(["CREATE_MARC"]);

    const marcxml = body.marcxml || body.marcXml;
    if (!marcxml || typeof marcxml !== "string") {
      return errorResponse("marcxml is required", 400);
    }

    const source = body.source || "System Local";
    const autoTcn = body.auto_tcn !== false && body.autoTcn !== false;
    const override = body.override === true;

    const method = override
      ? "open-ils.cat.biblio.record.xml.import.override"
      : "open-ils.cat.biblio.record.xml.import";

    const response = await callOpenSRF("open-ils.cat", method, [
      authtoken,
      marcxml,
      source,
      autoTcn,
    ]);

    const result = response?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || result?.ilsevent) {
      const message = getErrorMessage(result, "MARC import failed");
      await logAuditEvent({
        action: "marc.import",
        status: "failure",
        actor,
        ip,
        userAgent,
        details: { source, override },
        error: message,
      });
      return errorResponse(message, 400, result);
    }

    const recordId = result?.id || result?.__p?.[0];

    await logAuditEvent({
      action: "marc.import",
      status: "success",
      actor,
      ip,
      userAgent,
      details: { recordId, source, override },
      error: null,
    });

    return successResponse({
      record: {
        id: recordId,
        tcn: result?.tcn_value || result?.tcn || "",
        source: result?.source || source,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "MARC POST", req);
  }
}

export async function PUT(req: NextRequest) {
  const { ip, userAgent } = getRequestMeta(req);
  try {
    const body = await parseJsonBody<Record<string, any>>(req);
    if (body instanceof NextResponse) return body;

    const { authtoken, actor } = await requirePermissions(["UPDATE_MARC"]);

    const recordId = body.recordId ?? body.record_id ?? body.id;
    const marcxml = body.marcxml || body.marcXml;

    if (!recordId) {
      return errorResponse("recordId is required", 400);
    }
    if (!marcxml || typeof marcxml !== "string") {
      return errorResponse("marcxml is required", 400);
    }

    const response = await callOpenSRF(
      "open-ils.cat",
      "open-ils.cat.biblio.record.xml.update",
      [authtoken, Number(recordId), marcxml]
    );

    const result = response?.payload?.[0];
    if (!result || isOpenSRFEvent(result) || result?.ilsevent) {
      const message = getErrorMessage(result, "MARC update failed");
      await logAuditEvent({
        action: "marc.update",
        status: "failure",
        actor,
        ip,
        userAgent,
        details: { recordId: Number(recordId) },
        error: message,
      });
      return errorResponse(message, 400, result);
    }

    await logAuditEvent({
      action: "marc.update",
      status: "success",
      actor,
      ip,
      userAgent,
      details: { recordId: Number(recordId) },
      error: null,
    });

    return successResponse({ recordId: Number(recordId) });
  } catch (error) {
    return serverErrorResponse(error, "MARC PUT", req);
  }
}
