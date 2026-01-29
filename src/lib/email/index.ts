/**
 * Main email service - handles notice generation and sending
 */

import { sendEmail } from "./provider";
import { logger } from "@/lib/logger";
import type { NoticeType, NoticeContext, EmailRecipient } from "./types";
import {
  renderHoldReadyHtml,
  renderHoldReadyText,
  renderOverdueHtml,
  renderOverdueText,
  renderPreOverdueHtml,
  renderPreOverdueText,
  renderCardExpirationHtml,
  renderCardExpirationText,
  renderFineBillHtml,
  renderFineBillText,
} from "./templates";

export * from "./types";
export { sendEmail, getEmailConfig } from "./provider";

interface SendNoticeOptions {
  type: NoticeType;
  context: NoticeContext;
}

function getSubject(type: NoticeType, context: NoticeContext): string {
  const { library } = context;

  switch (type) {
    case "hold_ready":
      const holdCount = context.holds?.length || 0;
      return `${library.name}: Your hold${holdCount > 1 ? "s are" : " is"} ready for pickup`;

    case "overdue":
      const overdueCount = context.items?.length || 0;
      return `${library.name}: Overdue item${overdueCount > 1 ? "s" : ""} - please return`;

    case "pre_overdue":
      const dueCount = context.items?.length || 0;
      return `${library.name}: Courtesy reminder - item${dueCount > 1 ? "s" : ""} due soon`;

    case "card_expiration":
      return `${library.name}: Your library card is expiring soon`;

    case "fine_bill":
      return `${library.name}: Outstanding fines or fees on your account`;

    default:
      return `${library.name}: Library notice`;
  }
}

function renderNoticeHtml(type: NoticeType, context: NoticeContext): string {
  switch (type) {
    case "hold_ready":
      return renderHoldReadyHtml(context);
    case "overdue":
      return renderOverdueHtml(context);
    case "pre_overdue":
      return renderPreOverdueHtml(context);
    case "card_expiration":
      return renderCardExpirationHtml(context);
    case "fine_bill":
      return renderFineBillHtml(context);
    default:
      throw new Error(`Unknown notice type: ${type}`);
  }
}

function renderNoticeText(type: NoticeType, context: NoticeContext): string {
  switch (type) {
    case "hold_ready":
      return renderHoldReadyText(context);
    case "overdue":
      return renderOverdueText(context);
    case "pre_overdue":
      return renderPreOverdueText(context);
    case "card_expiration":
      return renderCardExpirationText(context);
    case "fine_bill":
      return renderFineBillText(context);
    default:
      throw new Error(`Unknown notice type: ${type}`);
  }
}

export async function sendNotice(options: SendNoticeOptions): Promise<void> {
  const { type, context } = options;
  const { patron, library } = context;

  // Validate patron email
  if (!patron.email) {
    throw new Error(`Cannot send notice: patron ${patron.id} has no email address`);
  }

  const subject = getSubject(type, context);
  const html = renderNoticeHtml(type, context);
  const text = renderNoticeText(type, context);

  const recipient: EmailRecipient = {
    email: patron.email,
    name: `${patron.firstName} ${patron.lastName}`.trim(),
  };

  const from: EmailRecipient = {
    email: library.email || process.env.STACKSOS_EMAIL_FROM || "noreply@library.org",
    name: library.name,
  };

  const replyTo: EmailRecipient | undefined = library.email
    ? { email: library.email, name: library.name }
    : undefined;

  logger.info(
    {
      component: "email",
      noticeType: type,
      patronId: patron.id,
      recipient: patron.email,
    },
    `Sending ${type} notice to patron ${patron.id}`
  );

  await sendEmail({
    to: recipient,
    from,
    replyTo,
    subject,
    html,
    text,
  });

  logger.info(
    {
      component: "email",
      noticeType: type,
      patronId: patron.id,
      recipient: patron.email,
    },
    `Successfully sent ${type} notice to patron ${patron.id}`
  );
}

export async function sendBatchNotices(notices: SendNoticeOptions[]): Promise<{
  sent: number;
  failed: number;
  errors: Array<{ index: number; error: string }>;
}> {
  const results = { sent: 0, failed: 0, errors: [] as Array<{ index: number; error: string }> };

  for (let i = 0; i < notices.length; i++) {
    try {
      await sendNotice(notices[i]);
      results.sent++;

      // Add small delay between emails to avoid rate limiting
      if (i < notices.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        index: i,
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error(
        {
          component: "email",
          noticeType: notices[i].type,
          patronId: notices[i].context.patron.id,
          error: error instanceof Error ? error.message : String(error),
        },
        `Failed to send notice to patron ${notices[i].context.patron.id}`
      );
    }
  }

  return results;
}
