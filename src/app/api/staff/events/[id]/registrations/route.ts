import { NextRequest } from "next/server";
import { errorResponse, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { listEventRegistrations } from "@/lib/db/opac-events";
import { getEventById } from "@/lib/events-data";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const { id: eventId } = await params;
    if (!eventId) {
      return errorResponse("Event ID is required", 400);
    }

    const event = getEventById(eventId);
    if (!event) {
      return errorResponse("Event not found", 404);
    }

    const includeCanceled = req.nextUrl.searchParams.get("includeCanceled") === "true";

    const registrations = await listEventRegistrations(eventId, {
      includeCanceled,
    });

    return successResponse({
      event: {
        id: event.id,
        title: event.title,
        date: event.date,
      },
      registrations,
      total: registrations.length,
    });
  } catch (error) {
    return serverErrorResponse(error, "Staff Event Registrations GET", req);
  }
}
