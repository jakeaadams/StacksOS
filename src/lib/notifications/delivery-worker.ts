import { sendEmail } from "@/lib/email/provider";
import { renderEmailNoticeContent } from "@/lib/email";
import { createDelivery, ensureNotificationTables, markDeliveryAttempt } from "@/lib/db/notifications";
import { query } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";
import type { NoticeType, NoticeContext } from "@/lib/email";

export async function enqueueRetry(eventId: string): Promise<number | null> {
  await ensureNotificationTables();
  return await createDelivery({ eventId, provider: String(process.env.STACKSOS_EMAIL_PROVIDER || "console") });
}

export async function processPendingDeliveries(limit: number = 25): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  await ensureNotificationTables();

  const pending = await query<any>(
    `
      select d.id as delivery_id, d.event_id, d.provider,
             e.channel, e.notice_type, e.recipient, e.context
      from library.notification_deliveries d
      join library.notification_events e on e.id = d.event_id
      where d.status = 'pending'
      order by d.id asc
      limit $1
    `,
    [limit]
  );

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const deliveryId = Number(row.delivery_id);
    const eventId = String(row.event_id);
    const channel = String(row.channel || "");
    const noticeType = String(row.notice_type || "") as NoticeType;
    const context = row.context as NoticeContext | null;

    if (channel !== "email") {
      await markDeliveryAttempt({ deliveryId, status: "failed", error: `Unsupported channel ${channel}` });
      failed++;
      continue;
    }

    if (!context || !context.patron?.email) {
      await markDeliveryAttempt({ deliveryId, status: "failed", error: "Missing event context or patron email" });
      failed++;
      continue;
    }

    try {
      const { subject, html, text } = await renderEmailNoticeContent(noticeType, context);

      await sendEmail({
        to: { email: context.patron.email, name: `${context.patron.firstName} ${context.patron.lastName}`.trim() },
        from: {
          email: context.library.email || process.env.STACKSOS_EMAIL_FROM || "noreply@library.org",
          name: context.library.name || "Library",
        },
        replyTo: context.library.email ? { email: context.library.email, name: context.library.name } : undefined,
        subject,
        html,
        text,
      });

      await markDeliveryAttempt({ deliveryId, status: "sent" });
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn({ component: "notifications", eventId, deliveryId, err: msg }, "Delivery failed");
      await markDeliveryAttempt({ deliveryId, status: "failed", error: msg });
      failed++;
    }
  }

  return { processed: pending.length, sent, failed };
}
