import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import {
  assignAsset,
  createAsset,
  listAssets,
  returnAsset,
  updateAsset,
} from "@/lib/db/k12-assets";

// ---------------------------------------------------------------------------
// POST schemas (action-based)
// ---------------------------------------------------------------------------

const createAssetSchema = z
  .object({
    action: z.literal("createAsset"),
    assetTag: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().max(80).optional(),
    model: z.string().trim().max(200).optional(),
    serialNumber: z.string().trim().max(200).optional(),
    status: z.string().trim().max(40).optional(),
    condition: z.string().trim().max(40).optional(),
    conditionNotes: z.string().trim().max(1000).optional(),
    purchaseDate: z.string().trim().max(20).optional(),
  })
  .passthrough();

const assignAssetSchema = z
  .object({
    action: z.literal("assignAsset"),
    assetId: z.number().int().positive(),
    studentId: z.number().int().positive(),
  })
  .passthrough();

const returnAssetSchema = z
  .object({
    action: z.literal("returnAsset"),
    assignmentId: z.number().int().positive(),
    conditionOnReturn: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .passthrough();

const updateAssetSchema = z
  .object({
    action: z.literal("updateAsset"),
    assetId: z.number().int().positive(),
    name: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().max(80).optional(),
    model: z.string().trim().max(200).nullable().optional(),
    serialNumber: z.string().trim().max(200).nullable().optional(),
    status: z.string().trim().max(40).optional(),
    condition: z.string().trim().max(40).optional(),
    conditionNotes: z.string().trim().max(1000).nullable().optional(),
    purchaseDate: z.string().trim().max(20).nullable().optional(),
  })
  .passthrough();

const actionSchema = z.discriminatedUnion("action", [
  createAssetSchema,
  assignAssetSchema,
  returnAssetSchema,
  updateAssetSchema,
]);

// ---------------------------------------------------------------------------
// GET: list assets
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const category = searchParams.get("category") || undefined;
    const tenantId = searchParams.get("tenantId") || undefined;

    const assets = await listAssets({ tenantId, status, category });

    return successResponse({ assets });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/assets", req);
  }
}

// ---------------------------------------------------------------------------
// POST: action-based mutations
// ---------------------------------------------------------------------------

function actorIdFromRecord(actor: Record<string, any> | null): number | null {
  if (!actor) return null;
  const raw = actor.id;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseJsonBodyWithSchema(req, actionSchema);
    if (body instanceof Response) return body;

    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;
    const actorId = actorIdFromRecord(actorRecord);

    if (body.action === "createAsset") {
      const asset = await createAsset({
        assetTag: body.assetTag,
        name: body.name,
        category: body.category,
        model: body.model,
        serialNumber: body.serialNumber,
        status: body.status,
        condition: body.condition,
        conditionNotes: body.conditionNotes,
        purchaseDate: body.purchaseDate,
      });
      return successResponse({ asset });
    }

    if (body.action === "assignAsset") {
      const assignment = await assignAsset(body.assetId, body.studentId, actorId);
      return successResponse({ assignment });
    }

    if (body.action === "returnAsset") {
      const assignment = await returnAsset(body.assignmentId, body.conditionOnReturn, body.notes);
      return successResponse({ assignment });
    }

    if (body.action === "updateAsset") {
      const asset = await updateAsset(body.assetId, {
        name: body.name,
        category: body.category,
        model: body.model,
        serialNumber: body.serialNumber,
        status: body.status,
        condition: body.condition,
        conditionNotes: body.conditionNotes,
        purchaseDate: body.purchaseDate,
      });
      return successResponse({ asset });
    }

    return errorResponse("Unsupported action", 400);
  } catch (error) {
    return serverErrorResponse(error, "POST /api/staff/k12/assets", req);
  }
}
