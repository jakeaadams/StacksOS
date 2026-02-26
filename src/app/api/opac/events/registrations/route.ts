import { NextRequest } from "next/server";
import {
  errorResponse,
  getClientIp,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
  unauthorizedResponse,
} from "@/lib/api";
import {
  cancelPatronEventRegistration,
  listPatronEventHistory,
  listPatronEventRegistrations,
  registerPatronForEvent,
  updatePatronEventReminder,
} from "@/lib/db/opac-events";
import { getEventById } from "@/lib/events-data";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const reminderChannelSchema = z.enum(["none", "email", "sms", "both"]);

const postSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("register"),
      eventId: z.string().trim().min(1),
      reminderChannel: reminderChannelSchema.optional(),
      reminderOptIn: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      eventId: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("update_reminders"),
      eventId: z.string().trim().min(1),
      reminderChannel: reminderChannelSchema,
      reminderOptIn: z.boolean().optional(),
    })
    .strict(),
]);

export async function GET(req: NextRequest) {
  try {
    const { patronId } = await requirePatronSession();

    const searchParams = req.nextUrl.searchParams;
    const eventId = String(searchParams.get("eventId") || "").trim();
    const includeCanceled = searchParams.get("includeCanceled") === "true";
    const includeHistory = searchParams.get("history") === "true";
    const historyLimitRaw = parseInt(searchParams.get("historyLimit") || "50", 10);
    const historyLimit = Number.isFinite(historyLimitRaw)
      ? Math.max(1, Math.min(200, historyLimitRaw))
      : 50;

    const registrations = await listPatronEventRegistrations(patronId, {
      eventIds: eventId ? [eventId] : undefined,
      includeCanceled,
    });

    const payload = registrations.map((registration) => ({
      ...registration,
      event: getEventById(registration.eventId),
    }));

    const summary = {
      registered: registrations.filter((r) => r.status === "registered").length,
      waitlisted: registrations.filter((r) => r.status === "waitlisted").length,
      canceled: registrations.filter((r) => r.status === "canceled").length,
    };

    const history = includeHistory
      ? await listPatronEventHistory(patronId, {
          eventId: eventId || undefined,
          limit: historyLimit,
        })
      : [];

    return successResponse({
      registrations: payload,
      summary,
      history,
      total: payload.length,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return unauthorizedResponse();
    }
    return serverErrorResponse(error, "OPAC Event Registrations GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req) || "unknown";
    const rateLimit = await checkRateLimit(ip, {
      maxAttempts: 10,
      windowMs: 60_000,
      endpoint: "opac-event-registrations",
    });
    if (!rateLimit.allowed) {
      return errorResponse("Too many requests. Please try again later.", 429, {
        retryAfter: Math.ceil(rateLimit.resetIn / 1000),
      });
    }

    const { patronId } = await requirePatronSession();

    const parsed = await parseJsonBodyWithSchema(req, postSchema);
    if (parsed instanceof Response) return parsed;

    const event = getEventById(parsed.eventId);
    if (!event) {
      return errorResponse("Event not found", 404);
    }

    const capacity = typeof event.capacity === "number" ? event.capacity : null;

    if (parsed.action === "register") {
      const result = await registerPatronForEvent({
        eventId: event.id,
        patronId,
        eventDate: event.date,
        capacity,
        reminderChannel: parsed.reminderChannel,
        reminderOptIn: parsed.reminderOptIn,
      });

      const message =
        result.action === "waitlisted" || result.action === "already_waitlisted"
          ? "You are on the waitlist for this event."
          : result.promotedFromWaitlist
            ? "A spot opened up and you are now registered."
            : "Registration saved.";

      return successResponse({
        registration: {
          ...result.registration,
          event,
        },
        action: result.action,
        promotedFromWaitlist: result.promotedFromWaitlist,
        message,
      });
    }

    if (parsed.action === "cancel") {
      const result = await cancelPatronEventRegistration({
        eventId: event.id,
        patronId,
        eventDate: event.date,
        capacity,
      });

      if (!result.canceled) {
        return successResponse({
          canceled: false,
          registration: result.registration ? { ...result.registration, event } : null,
          promotedWaitlist: false,
          message: "No active registration was found for this event.",
        });
      }

      return successResponse({
        canceled: true,
        registration: result.registration ? { ...result.registration, event } : null,
        promotedWaitlist: result.promotedWaitlist,
        message: result.promotedWaitlist
          ? "Registration canceled. A waitlisted patron was promoted."
          : "Registration canceled.",
      });
    }

    const updated = await updatePatronEventReminder({
      eventId: event.id,
      patronId,
      eventDate: event.date,
      reminderChannel: parsed.reminderChannel,
      reminderOptIn: parsed.reminderOptIn,
    });

    if (!updated) {
      return errorResponse("No active registration found to update reminders", 404);
    }

    return successResponse({
      registration: {
        ...updated,
        event,
      },
      message: "Reminder preferences updated.",
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return unauthorizedResponse();
    }
    return serverErrorResponse(error, "OPAC Event Registrations POST", req);
  }
}
