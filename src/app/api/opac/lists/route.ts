import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

// In a production app, lists would be stored in a database (PostgreSQL)
// For now, we store in Evergreen user settings or a custom table

// GET /api/opac/lists - Get all user lists
const createListSchema = z.object({
  name: z.string().trim().min(1).max(512),
  description: z.string().max(2048).optional(),
  visibility: z.enum(["private", "public"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { patronToken, patronId } = await requirePatronSession();

    // Get user bookbags (Evergreen term for lists)
    const bagsResponse = await callOpenSRF("open-ils.actor", "open-ils.actor.container.flesh", [
      patronToken,
      "user",
      "biblio",
      patronId,
    ]);

    const bags = bagsResponse.payload?.[0] || [];

    // Transform to our list format
    const lists = Array.isArray(bags)
      ? bags.map((bag) => ({
          id: bag.id,
          name: bag.name,
          description: bag.description || "",
          visibility: bag.pub === "t" ? "public" : "private",
          itemCount: bag.items?.length || 0,
          items: (bag.items || []).map((item: any) => ({
            id: item.id,
            bibId: item.target_biblio_record_entry,
            dateAdded: item.create_time,
            notes: item.notes || "",
          })),
          createdAt: bag.create_time,
          updatedAt: bag.edit_time || bag.create_time,
          isDefault:
            bag.name === "Want to Read" ||
            bag.name === "Currently Reading" ||
            bag.name === "Completed",
          icon:
            bag.name === "Want to Read"
              ? "heart"
              : bag.name === "Currently Reading"
                ? "book"
                : bag.name === "Completed"
                  ? "check"
                  : "list",
        }))
      : [];

    return successResponse({ lists });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      logger.warn({ error: String(error) }, "Route /api/opac/lists GET auth failed");
      return errorResponse("Authentication required", 401);
    }
    logger.error({ error: String(error) }, "Error fetching lists");
    return serverErrorResponse(error, "Failed to fetch lists", req);
  }
}

// POST /api/opac/lists - Create a new list
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 25,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-lists-create",
  });
  if (!rate.allowed) {
    return errorResponse("Too many list creation requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { patronToken, patronId } = await requirePatronSession();

    const { name, description, visibility } = createListSchema.parse(await req.json());

    if (!name?.trim()) {
      return errorResponse("List name required");
    }

    // Create bookbag in Evergreen
    const createResponse = await callOpenSRF("open-ils.actor", "open-ils.actor.container.create", [
      patronToken,
      "biblio",
      {
        owner: patronId,
        btype: "bookbag",
        name: name.trim(),
        description: description || "",
        pub: visibility === "public" ? "t" : "f",
      },
    ]);

    const result = createResponse.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse(result.textcode || "Failed to create list");
    }

    await logAuditEvent({
      action: "opac.list.create",
      entity: "bookbag",
      entityId: typeof result === "number" ? result : undefined,
      status: "success",
      actor: null,
      ip,
      userAgent,
      requestId,
      details: {
        patronId,
        listName: name.trim(),
        visibility: visibility || "private",
      },
    });

    const newList = {
      id: result,
      name: name.trim(),
      description: description || "",
      visibility: visibility || "private",
      itemCount: 0,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDefault: false,
      icon: "list",
    };

    return successResponse({ list: newList });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      logger.warn({ error: String(error) }, "Route /api/opac/lists POST auth failed");
      return errorResponse("Authentication required", 401);
    }
    logger.error({ error: String(error) }, "Error creating list");
    return serverErrorResponse(error, "Failed to create list", req);
  }
}
