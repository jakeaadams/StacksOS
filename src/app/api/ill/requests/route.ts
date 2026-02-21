import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import {
  createIllRequest,
  updateIllRequestSync,
  listIllRequests,
  updateIllRequest,
  type IllRequestStatus,
  type IllSyncStatus,
} from "@/lib/db/ill";
import { getIllProviderStatus, syncIllRequestToProvider, type IllProviderSyncResult } from "@/lib/ill/provider";

const CreateIllRequestSchema = z
  .object({
    requestType: z.enum(["borrow", "lend"] as const),
    priority: z.enum(["low", "normal", "high"] as const).optional(),
    patronId: z.number().int().positive().nullable().optional(),
    patronBarcode: z.string().trim().min(1).max(64),
    patronName: z.string().trim().min(1).max(255).optional(),
    title: z.string().trim().min(1).max(500),
    author: z.string().trim().min(1).max(255).optional(),
    isbn: z.string().trim().min(1).max(64).optional(),
    source: z.string().trim().min(1).max(255).optional(),
    neededBy: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .strict();

const UpdateIllRequestSchema = z
  .object({
    id: z.number().int().positive(),
    status: z
      .enum(["new", "requested", "in_transit", "received", "completed", "canceled"] as const)
      .optional(),
    priority: z.enum(["low", "normal", "high"] as const).optional(),
    source: z.string().trim().max(255).optional(),
    notes: z.string().trim().max(4000).optional(),
    neededBy: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict()
  .refine((body) => Boolean(body.status || body.priority || body.source || body.notes || body.neededBy), {
    message: "At least one update field is required",
    path: ["status"],
  });

function actorIdFrom(actor: any): number | null {
  const raw = actor?.id ?? actor?.usr ?? actor?.user_id;
  const id = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  return Number.isFinite(id) ? id : null;
}

function parseStatus(raw: string | null): IllRequestStatus | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (
    value === "new" ||
    value === "requested" ||
    value === "in_transit" ||
    value === "received" ||
    value === "completed" ||
    value === "canceled"
  ) {
    return value;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const status = parseStatus(req.nextUrl.searchParams.get("status"));
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : 100;

    const requests = await listIllRequests({
      status,
      limit: Number.isFinite(limit) ? limit : 100,
    });

    return successResponse({ requests });
  } catch (error) {
    return serverErrorResponse(error, "ILL requests GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const body = await parseJsonBodyWithSchema(req, CreateIllRequestSchema);
    if (body instanceof Response) return body;

    const createdBy = actorIdFrom(actor);
    const providerStatus = getIllProviderStatus();
    const initialSyncStatus: IllSyncStatus =
      providerStatus.provider === "manual" || providerStatus.syncMode === "manual"
        ? "manual"
        : providerStatus.syncMode === "monitor"
          ? "pending"
          : providerStatus.configured
            ? "pending"
            : "failed";

    const initialSyncError =
      initialSyncStatus === "failed"
        ? providerStatus.reason
        : providerStatus.syncMode === "monitor"
          ? "Monitor mode is enabled; request is queued for manual provider submission."
          : null;

    const created = await createIllRequest({
      requestType: body.requestType,
      priority: body.priority,
      patronId: body.patronId ?? null,
      patronBarcode: body.patronBarcode,
      patronName: body.patronName,
      title: body.title,
      author: body.author,
      isbn: body.isbn,
      source: body.source,
      neededBy: body.neededBy,
      notes: body.notes,
      provider: providerStatus.provider === "manual" ? null : providerStatus.provider,
      syncStatus: initialSyncStatus,
      syncError: initialSyncError,
      createdBy,
    });

    let sync: IllProviderSyncResult = {
      attempted: false,
      syncStatus: initialSyncStatus,
      provider: providerStatus.provider === "manual" ? null : providerStatus.provider,
      providerRequestId: null,
      syncError: initialSyncError,
    };

    if (providerStatus.activeSync) {
      sync = await syncIllRequestToProvider({
        requestId: created.id,
        requestType: body.requestType,
        priority: body.priority ?? "normal",
        patronId: body.patronId ?? null,
        patronBarcode: body.patronBarcode,
        patronName: body.patronName ?? null,
        title: body.title,
        author: body.author ?? null,
        isbn: body.isbn ?? null,
        source: body.source ?? null,
        neededBy: body.neededBy ?? null,
        notes: body.notes ?? null,
      });

      await updateIllRequestSync(created.id, {
        syncStatus: sync.syncStatus,
        provider: sync.provider,
        providerRequestId: sync.providerRequestId,
        syncError: sync.syncError,
        incrementAttempts: sync.attempted,
        markSyncedAt: sync.syncStatus === "synced",
        updatedBy: createdBy,
      });
    }

    await logAuditEvent({
      action: "ill.request.create",
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      entity: "ill_request",
      entityId: created.id,
      details: {
        requestType: body.requestType,
        priority: body.priority || "normal",
        patronBarcode: body.patronBarcode,
        provider: sync.provider,
        syncStatus: sync.syncStatus,
      },
    });

    return successResponse({
      created: true,
      id: created.id,
      sync: {
        status: sync.syncStatus,
        provider: sync.provider,
        providerRequestId: sync.providerRequestId,
        error: sync.syncError,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "ILL requests POST", req);
  }
}

export async function PATCH(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const body = await parseJsonBodyWithSchema(req, UpdateIllRequestSchema);
    if (body instanceof Response) return body;

    const updatedBy = actorIdFrom(actor);
    const updated = await updateIllRequest(body.id, {
      status: body.status,
      priority: body.priority,
      source: body.source,
      notes: body.notes,
      neededBy: body.neededBy,
      updatedBy,
    });

    if (!updated) {
      return errorResponse("ILL request not found", 404);
    }

    await logAuditEvent({
      action: "ill.request.update",
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      entity: "ill_request",
      entityId: body.id,
      details: {
        status: body.status,
        priority: body.priority,
      },
    });

    return successResponse({ updated: true, id: body.id });
  } catch (error) {
    return serverErrorResponse(error, "ILL requests PATCH", req);
  }
}
