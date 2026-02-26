/**
 * OPAC Events API Route
 *
 * GET /api/opac/events - Returns library events enriched with first-party
 * registration lifecycle state (capacity, waitlist, viewer status).
 */

import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { getEventRegistrationMetrics, listPatronEventRegistrations } from "@/lib/db/opac-events";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import {
  getUpcomingEvents,
  getEventBranches,
  getEventCatalogSource,
  getEventTypes,
  type EventType,
} from "@/lib/events-data";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;

    const branch = searchParams.get("branch") || undefined;
    const type = (searchParams.get("type") as EventType) || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const featured = searchParams.get("featured") === "true";

    const events = getUpcomingEvents({
      branch,
      type,
      startDate,
      endDate,
      limit: Math.min(limit, 100),
      featuredOnly: featured,
    });

    const eventIds = events.map((event) => event.id);

    let metrics: Record<string, { registeredCount: number; waitlistedCount: number }> = {};
    try {
      metrics = await getEventRegistrationMetrics(eventIds);
    } catch (error) {
      logger.warn({ err: String(error) }, "Failed to load OPAC event registration metrics");
    }

    let viewerAuthenticated = false;
    const viewerByEvent = new Map<
      string,
      {
        status: string;
        waitlistPosition: number | null;
        reminderChannel: string;
        reminderScheduledFor: string | null;
      }
    >();

    try {
      const { patronId } = await requirePatronSession();
      viewerAuthenticated = true;
      const viewerRegs = await listPatronEventRegistrations(patronId, {
        eventIds,
        includeCanceled: true,
      });
      for (const reg of viewerRegs) {
        viewerByEvent.set(reg.eventId, {
          status: reg.status,
          waitlistPosition: reg.waitlistPosition,
          reminderChannel: reg.reminderChannel,
          reminderScheduledFor: reg.reminderScheduledFor,
        });
      }
    } catch (error) {
      if (!(error instanceof PatronAuthError)) {
        logger.warn({ err: String(error) }, "Failed to load viewer OPAC event registration state");
      }
    }

    const enrichedEvents = events.map((event) => {
      const metric = metrics[event.id] || { registeredCount: 0, waitlistedCount: 0 };
      const viewer = viewerByEvent.get(event.id);
      const capacity = typeof event.capacity === "number" ? event.capacity : null;
      const computedSpots =
        capacity !== null ? Math.max(0, capacity - metric.registeredCount) : event.spotsAvailable;

      return {
        ...event,
        spotsAvailable: computedSpots,
        registration: {
          required: Boolean(event.registrationRequired),
          capacity,
          registeredCount: metric.registeredCount,
          waitlistedCount: metric.waitlistedCount,
          viewerStatus: viewer?.status || null,
          viewerWaitlistPosition: viewer?.waitlistPosition ?? null,
          viewerReminderChannel: viewer?.reminderChannel || null,
          viewerReminderScheduledFor: viewer?.reminderScheduledFor || null,
        },
      };
    });

    const source = getEventCatalogSource();

    return successResponse({
      events: enrichedEvents,
      total: enrichedEvents.length,
      branches: getEventBranches(),
      types: getEventTypes(),
      viewerAuthenticated,
      source,
      catalogConfigured: source !== "none",
    });
  } catch (_error) {
    return errorResponse("Failed to fetch events", 500);
  }
}
