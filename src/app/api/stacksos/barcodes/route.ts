import { NextRequest } from "next/server";
import { applyBarcodeProfile } from "@/lib/barcode";
import { getProfile, listProfiles, serializeProfile } from "@/config/barcode-profiles";
import {
  errorResponse,
  parseJsonBody,
  successResponse,
  serverErrorResponse,
} from "@/lib/api/responses";
import { getRequestMeta, requireAuthToken } from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";

const _barcodesPostSchema = z
  .object({
    prefix: z.string().trim().optional(),
    count: z.coerce.number().int().positive().max(100).optional(),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  try {
    await requireAuthToken();

    const profiles = listProfiles().map(serializeProfile);
    return successResponse({ profiles });
  } catch (error) {
    return serverErrorResponse(error, "Barcodes GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    await requireAuthToken();

    const body = await parseJsonBody(req);
    if (!body) {
      return errorResponse("Invalid JSON body.", 400);
    }

    const { barcode, profileId } = body as {
      barcode?: string;
      profileId?: string;
    };

    if (!barcode) {
      return errorResponse("barcode is required.", 400);
    }

    if (!profileId) {
      return errorResponse("profileId is required.", 400);
    }

    const profile = getProfile(profileId);
    if (!profile) {
      return errorResponse("Unknown barcode profile.", 404);
    }

    const result = applyBarcodeProfile(barcode, profile);

    await logAuditEvent({
      action: "barcode.generate",
      entity: "barcode",
      status: "success",
      actor: null,
      ip,
      userAgent,
      requestId,
      details: { profileId, barcode },
    });

    return successResponse({ profile: serializeProfile(profile), result });
  } catch (error) {
    return serverErrorResponse(error, "Barcodes POST", req);
  }
}
