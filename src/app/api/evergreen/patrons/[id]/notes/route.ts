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
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface PatronNote {
  id: number;
  title: string;
  value: string;
  public: boolean;
  createDate: string | null;
  creator: number | null;
}

function getRequestMeta(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent") || null,
    requestId: req.headers.get("x-request-id") || null,
  };
}

function parseNotePayload(n: Record<string, any>): PatronNote {
  const rawFields = n.__p as unknown[] | undefined;
  return {
    id: (n.id as number) || (rawFields?.[0] as number) || 0,
    title: (n.title as string) || (rawFields?.[1] as string) || "Note",
    value: (n.value as string) || (rawFields?.[2] as string) || "",
    public: n.pub === "t" || n.pub === true || rawFields?.[3] === "t",
    createDate: (n.create_date as string) || (rawFields?.[4] as string) || null,
    creator: (n.creator as number) || (rawFields?.[5] as number) || null,
  };
}

/**
 * GET /api/evergreen/patrons/[id]/notes
 * Fetch all notes for a patron
 */
const notePostSchema = z
  .object({
    title: z.string().trim().max(512).optional(),
    value: z.string().optional(),
    note: z.string().optional(),
    public: z.boolean().optional(),
    pub: z.union([z.boolean(), z.literal("t"), z.literal("f")]).optional(),
  })
  .passthrough();

const noteDeleteSchema = z
  .object({
    noteId: z.coerce.number().int().positive().optional(),
    note_id: z.coerce.number().int().positive().optional(),
  })
  .passthrough();

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { authtoken } = await requirePermissions(["VIEW_USER"]);
    const { id } = await params;
    const patronId = parseInt(id, 10);

    if (!Number.isFinite(patronId)) {
      return errorResponse("Invalid patron ID", 400);
    }

    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.note.retrieve.all", [
      authtoken,
      { usr: patronId },
    ]);

    const rawNotes = response?.payload?.[0];
    const notes: PatronNote[] = (Array.isArray(rawNotes) ? rawNotes : []).map((n) =>
      parseNotePayload(n)
    );

    return successResponse({ notes });
  } catch (error) {
    return serverErrorResponse(error, "Patron Notes GET", req);
  }
}

/**
 * POST /api/evergreen/patrons/[id]/notes
 * Create a new note for a patron
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { id } = await params;
    const patronId = parseInt(id, 10);
    const { ip, userAgent, requestId } = getRequestMeta(req);

    if (!Number.isFinite(patronId)) {
      return errorResponse("Invalid patron ID", 400);
    }

    const rawBody = await parseJsonBody(req);
    if (!rawBody) {
      return errorResponse("Request body required", 400);
    }
    const body = notePostSchema.parse(rawBody);

    const title = String(body.title || "Note").trim();
    const value = String(body.value || body.note || "").trim();
    const isPublic = body.public === true || body.pub === true || body.pub === "t";

    if (!value) {
      return errorResponse("Note content is required", 400);
    }

    const note = encodeFieldmapper("aun", {
      usr: patronId,
      creator: (actor as Record<string, any>)?.id,
      title,
      value,
      pub: isPublic,
      create_date: "now",
      isnew: 1,
    });

    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.note.create", [
      authtoken,
      note,
    ]);

    const result = response?.payload?.[0];
    if (isOpenSRFEvent(result) || (result as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to create note"), 400, result);
    }

    await logAuditEvent({
      action: "patron.note.create",
      entity: "patron",
      entityId: patronId,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { title, public: isPublic },
    });

    logger.info({ patronId, noteId: result }, "Patron note created");

    return successResponse({ noteId: result, message: "Note created successfully" });
  } catch (error) {
    return serverErrorResponse(error, "Patron Notes POST", req);
  }
}

/**
 * DELETE /api/evergreen/patrons/[id]/notes
 * Delete a note from a patron
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const { id } = await params;
    const patronId = parseInt(id, 10);
    const { ip, userAgent, requestId } = getRequestMeta(req);

    if (!Number.isFinite(patronId)) {
      return errorResponse("Invalid patron ID", 400);
    }

    const rawBody = await parseJsonBody(req);
    if (!rawBody) {
      return errorResponse("Request body required", 400);
    }
    const body = noteDeleteSchema.parse(rawBody);

    const noteId = parseInt(String(body.noteId || body.note_id || ""), 10);

    if (!Number.isFinite(noteId)) {
      return errorResponse("Note ID is required", 400);
    }

    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.note.delete", [
      authtoken,
      noteId,
    ]);

    const result = response?.payload?.[0];
    if (isOpenSRFEvent(result) || (result as Record<string, any>)?.ilsevent) {
      return errorResponse(getErrorMessage(result, "Failed to delete note"), 400, result);
    }

    await logAuditEvent({
      action: "patron.note.delete",
      entity: "patron",
      entityId: patronId,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { noteId },
    });

    logger.info({ patronId, noteId }, "Patron note deleted");

    return successResponse({ message: "Note deleted successfully" });
  } catch (error) {
    return serverErrorResponse(error, "Patron Notes DELETE", req);
  }
}
