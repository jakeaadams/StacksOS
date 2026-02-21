import { NextRequest } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  parseJsonBodyWithSchema,
  successResponse,
  serverErrorResponse,
  withErrorHandling,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { addReleaseNote, listReleaseNotes } from "@/lib/db/support";
import { logAuditEvent } from "@/lib/audit";

const CreateSchema = z
  .object({
    version: z.string().max(50).optional(),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(10000),
  })
  .strict();

export const GET = withErrorHandling(async (_req: Request) => {
  const notes = await listReleaseNotes(50);
  return successResponse({ notes });
}, "Release notes GET");

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["ADMIN_CONFIG"]);
    const body = await parseJsonBodyWithSchema(req, CreateSchema);
    if (body instanceof Response) return body;

    const created = await addReleaseNote({
      createdBy: actor?.id ?? null,
      version: body.version || null,
      title: body.title,
      body: body.body,
    });
    const id = created?.id ?? null;
    if (!id) return errorResponse("Failed to add release note", 500);

    await logAuditEvent({
      action: "ops.release_notes.create",
      entity: "release_note",
      entityId: id,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { version: body.version || null, title: body.title },
    });

    return successResponse({ created: true, id });
  } catch (error) {
    return serverErrorResponse(error, "Release notes POST", req);
  }
}
