/**
 * Cron: Event Reminders
 *
 * GET /api/cron/event-reminders
 *
 * Queries due reminders (events in the next 24h with unnotified registrants),
 * dispatches via the notification system (or logs if unavailable),
 * and marks each as sent (idempotent).
 *
 * Intended to be called periodically by an external scheduler (e.g., Vercel Cron, systemd timer).
 */

import { NextRequest } from "next/server";
import { successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { getDueReminders, markReminderSent } from "@/lib/db/opac-events";
import { getEventById } from "@/lib/events-data";
import { logger } from "@/lib/logger";

let notificationModule: typeof import("@/lib/db/notifications") | null = null;

async function loadNotifications() {
  if (notificationModule) return notificationModule;
  try {
    notificationModule = await import("@/lib/db/notifications");
    return notificationModule;
  } catch {
    return null;
  }
}

type ReminderNoticeChannel = "email" | "sms";

function resolveReminderChannels(reminderChannel: string): ReminderNoticeChannel[] {
  if (reminderChannel === "both") return ["sms", "email"];
  if (reminderChannel === "sms") return ["sms"];
  return ["email"];
}

function buildReminderNotificationId(
  registrationId: number,
  channel: ReminderNoticeChannel
): string {
  return `event-reminder-${registrationId}-${channel}`;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return true;
  const msg = String((error as { message?: unknown }).message || "").toLowerCase();
  return msg.includes("duplicate key");
}

async function createNotificationEventIdempotent(
  notifications: NonNullable<Awaited<ReturnType<typeof loadNotifications>>>,
  args: {
    id: string;
    channel: ReminderNoticeChannel;
    noticeType: string;
    patronId: number;
    context: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await notifications.createNotificationEvent(args);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return;
    }
    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret when configured (required in production)
    const cronSecret = process.env.CRON_SECRET || "";
    if (!cronSecret && process.env.NODE_ENV === "production") {
      logger.error({}, "CRON_SECRET is not set — rejecting cron request in production");
      return errorResponse("Server misconfiguration", 500);
    }
    if (cronSecret) {
      const authHeader = req.headers.get("authorization") || "";
      if (authHeader !== `Bearer ${cronSecret}`) {
        return errorResponse("Unauthorized", 401);
      }
    }

    const dueReminders = await getDueReminders();

    if (dueReminders.length === 0) {
      return successResponse({
        processed: 0,
        message: "No due reminders.",
      });
    }

    const notifications = await loadNotifications();

    let sent = 0;
    let failed = 0;

    for (const reminder of dueReminders) {
      try {
        const event = getEventById(reminder.eventId);
        const eventTitle = event?.title || reminder.eventId;
        const eventDate = event?.date || "upcoming";

        if (notifications) {
          const context = {
            eventId: reminder.eventId,
            eventTitle,
            eventDate,
            registrationId: reminder.registrationId,
          };
          const channels = resolveReminderChannels(reminder.reminderChannel);

          // All channels for this reminder must enqueue successfully before we mark as sent.
          for (const channel of channels) {
            await createNotificationEventIdempotent(notifications, {
              id: buildReminderNotificationId(reminder.registrationId, channel),
              channel,
              noticeType: "event_reminder",
              patronId: reminder.patronId,
              context,
            });
          }
        } else {
          // Notification system unavailable — log for manual follow-up but skip marking sent
          logger.warn(
            {
              registrationId: reminder.registrationId,
              patronId: reminder.patronId,
              eventId: reminder.eventId,
              eventTitle,
              channel: reminder.reminderChannel,
            },
            "Event reminder due but notification system unavailable — will retry"
          );
          failed++;
          continue;
        }

        await markReminderSent(reminder.registrationId);
        sent++;
      } catch (err) {
        failed++;
        logger.error(
          { err: String(err), registrationId: reminder.registrationId },
          "Failed to process event reminder"
        );
      }
    }

    return successResponse({
      processed: dueReminders.length,
      sent,
      failed,
      message: `Processed ${dueReminders.length} reminder(s): ${sent} sent, ${failed} failed.`,
    });
  } catch (error) {
    return serverErrorResponse(error, "Cron Event Reminders", req);
  }
}
