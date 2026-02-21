import { NextRequest } from "next/server";
import { z } from "zod";

import { successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import {
  addKidsReadingLogEntry,
  deleteKidsReadingLogEntry,
  listKidsReadingLogEntries,
} from "@/lib/db/opac";

const createSchema = z.object({
  bibId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(400),
  author: z.string().trim().max(400).optional(),
  isbn: z.string().trim().max(64).optional(),
  minutesRead: z.number().int().min(1).max(24 * 60),
  pagesRead: z.number().int().min(0).max(10000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(4000).optional(),
  readAt: z.string().trim().optional(), // YYYY-MM-DD
});

export async function GET(req: NextRequest) {
  try {
    const { patronId } = await requirePatronSession();

    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const entries = await listKidsReadingLogEntries(patronId, limit, offset);
    return successResponse({ entries });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/kids/reading-log GET auth failed:", error);
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "Kids reading log GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { patronId } = await requirePatronSession();

    const bodyRaw = await req.json();
    const parsed = createSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return errorResponse("Invalid request", 400, parsed.error.flatten());
    }

    const body = parsed.data;
    const today = new Date().toISOString().slice(0, 10);
    const readAt = body.readAt && /^\d{4}-\d{2}-\d{2}$/.test(body.readAt) ? body.readAt : today;

    const entry = await addKidsReadingLogEntry(patronId, {
      bibId: body.bibId ?? null,
      title: body.title,
      author: body.author ?? null,
      isbn: body.isbn ?? null,
      minutesRead: body.minutesRead,
      pagesRead: body.pagesRead ?? null,
      rating: body.rating ?? null,
      notes: body.notes ?? null,
      readAt,
    });

    return successResponse({ entry });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/kids/reading-log POST auth failed:", error);
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "Kids reading log POST", req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { patronId } = await requirePatronSession();
    const body = await req.json();
    const id = typeof body?.id === "number" ? body.id : parseInt(String(body?.id ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return errorResponse("id is required", 400);
    }

    const deleted = await deleteKidsReadingLogEntry(patronId, id);
    if (!deleted) {
      return errorResponse("Entry not found", 404);
    }

    return successResponse({ deleted: true, id });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/kids/reading-log DELETE auth failed:", error);
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(error, "Kids reading log DELETE", req);
  }
}

