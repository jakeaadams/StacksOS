import { NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { listRecordPresence, upsertRecordPresence } from "@/lib/db/collaboration";

const recordTypeSchema = z.enum(["bib", "patron"]);
const activitySchema = z.enum(["viewing", "editing"]);

const postSchema = z.object({
  recordType: recordTypeSchema,
  recordId: z.number().int().positive(),
  activity: activitySchema.default("viewing"),
});

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);
    const recordType = recordTypeSchema.safeParse(req.nextUrl.searchParams.get("recordType") || "").data;
    const recordIdRaw = req.nextUrl.searchParams.get("recordId") || "";
    const recordId = /^\d+$/.test(recordIdRaw) ? parseInt(recordIdRaw, 10) : 0;
    if (!recordType || recordId <= 0) {
      return errorResponse("recordType and recordId are required", 400);
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get("stacksos_session_id")?.value || null;

    const presence = await listRecordPresence({
      recordType,
      recordId,
      activeWithinSeconds: 90,
      excludeSessionId: sessionId,
    });
    return successResponse({ presence });
  } catch (error) {
    return serverErrorResponse(error, "Collaboration presence GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent } = getRequestMeta(req);
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, parsed.error.flatten());
    }

    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("stacksos_session_id")?.value || null;
    if (!sessionId) {
      return errorResponse("Session id missing", 400);
    }

    await upsertRecordPresence({
      sessionId,
      actorId: actor?.id || null,
      recordType: parsed.data.recordType,
      recordId: parsed.data.recordId,
      activity: parsed.data.activity,
      userAgent,
      ip,
    });

    return successResponse({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, "Collaboration presence POST", req);
  }
}

