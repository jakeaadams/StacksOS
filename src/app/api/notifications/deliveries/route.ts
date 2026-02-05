import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBodyWithSchema, successResponse, serverErrorResponse, getRequestMeta } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { listDeliveries } from "@/lib/db/notifications";
import { enqueueRetry, processPendingDeliveries } from "@/lib/notifications/delivery-worker";
import { logAuditEvent } from "@/lib/audit";

const PostSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("enqueue_retry"), eventId: z.string().min(1) }).strict(),
    z.object({ action: z.literal("process"), limit: z.number().int().min(1).max(200).optional() }).strict(),
  ]);

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);
    const limit = Number.isFinite(Number(req.nextUrl.searchParams.get("limit")))
      ? Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit"))))
      : 200;
    const deliveries = await listDeliveries(limit);
    return successResponse({ deliveries, limit });
  } catch (error) {
    return serverErrorResponse(error, "Notifications deliveries GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["ADMIN_CONFIG"]);
    const body = await parseJsonBodyWithSchema(req, PostSchema);
    if (body instanceof Response) return body as any;

    if (body.action === "enqueue_retry") {
      const deliveryId = await enqueueRetry(body.eventId);
      if (!deliveryId) return errorResponse("Failed to enqueue retry", 500);

      await logAuditEvent({
        action: "notifications.delivery.enqueue_retry",
        entity: "notification_event",
        entityId: body.eventId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { deliveryId },
      });

      return successResponse({ enqueued: true, deliveryId });
    }

    if (body.action === "process") {
      const limit = body.limit ?? 25;
      const result = await processPendingDeliveries(limit);

      await logAuditEvent({
        action: "notifications.delivery.process",
        entity: "notification_delivery",
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: result,
      });

      return successResponse({ ...result });
    }

    return errorResponse("Invalid action", 400);
  } catch (error) {
    return serverErrorResponse(error, "Notifications deliveries POST", req);
  }
}

