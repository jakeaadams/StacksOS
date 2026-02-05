import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBodyWithSchema, successResponse, serverErrorResponse, getRequestMeta } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { query } from "@/lib/db/evergreen";
import { logAuditEvent } from "@/lib/audit";

const RevokeSchema = z.object({ sessionId: z.string().min(1) }).strict();

export async function GET(req: NextRequest) {
  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorId = typeof actor?.id === "number" ? actor.id : parseInt(String(actor?.id ?? ""), 10);
    if (!Number.isFinite(actorId)) return errorResponse("Invalid actor", 400);

    const sessions = await query<any>(
      `
        select id, created_at, last_seen_at, ip, user_agent, revoked_at
        from library.staff_sessions
        where actor_id = $1
        order by last_seen_at desc nulls last, created_at desc
        limit 50
      `,
      [actorId]
    );

    return successResponse({ sessions });
  } catch (error) {
    return serverErrorResponse(error, "Security sessions GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorId = typeof actor?.id === "number" ? actor.id : parseInt(String(actor?.id ?? ""), 10);
    if (!Number.isFinite(actorId)) return errorResponse("Invalid actor", 400);

    const body = await parseJsonBodyWithSchema(req, RevokeSchema);
    if (body instanceof Response) return body as any;

    const sessionId = body.sessionId;
    const result = await query<{ id: string }>(
      `
        update library.staff_sessions
        set revoked_at = now()
        where id = $1 and actor_id = $2 and revoked_at is null
        returning id
      `,
      [sessionId, actorId]
    );

    const revoked = result.length > 0;

    await logAuditEvent({
      action: "security.session.revoke",
      entity: "staff_session",
      entityId: sessionId,
      status: revoked ? "success" : "failure",
      actor,
      ip,
      userAgent,
      requestId,
      details: { sessionId },
      error: revoked ? null : "not_found_or_already_revoked",
    });

    if (!revoked) return errorResponse("Session not found or already revoked", 404);

    return successResponse({ revoked: true, sessionId });
  } catch (error) {
    return serverErrorResponse(error, "Security sessions POST", req);
  }
}

