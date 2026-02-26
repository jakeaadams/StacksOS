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
          // Send via the notification system
          const notificationId = `event-reminder-${reminder.registrationId}-${Date.now()}`;
          const channel =
            reminder.reminderChannel === "sms" || reminder.reminderChannel === "both"
              ? "sms"
              : "email";

          // Primary channel — failure here skips marking sent (will retry next cron run)
          await notifications.createNotificationEvent({
            id: notificationId,
            channel,
            noticeType: "event_reminder",
            patronId: reminder.patronId,
            context: {
              eventId: reminder.eventId,
              eventTitle,
              eventDate,
              registrationId: reminder.registrationId,
            },
          });

          // If the reminder channel is "both", also send email (best-effort)
          if (reminder.reminderChannel === "both") {
            try {
              await notifications.createNotificationEvent({
                id: `${notificationId}-email`,
                channel: "email",
                noticeType: "event_reminder",
                patronId: reminder.patronId,
                context: {
                  eventId: reminder.eventId,
                  eventTitle,
                  eventDate,
                  registrationId: reminder.registrationId,
                },
              });
            } catch (notifyErr) {
              logger.warn(
                { err: String(notifyErr), registrationId: reminder.registrationId },
                "Failed to create email notification for dual-channel reminder"
              );
            }
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
