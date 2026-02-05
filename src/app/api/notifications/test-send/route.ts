import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBodyWithSchema, successResponse, serverErrorResponse, getRequestMeta } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { sendEmail } from "@/lib/email/provider";
import { renderTemplateString } from "@/lib/notifications/render";
import { createDelivery, createNotificationEvent, getActiveTemplate, markDeliveryAttempt } from "@/lib/db/notifications";
import { logAuditEvent } from "@/lib/audit";
import { sendSms } from "@/lib/sms/provider";
import type { NoticeContext, NoticeType } from "@/lib/email";

const Schema = z
  .object({
    channel: z.enum(["email", "sms"]).default("email"),
    noticeType: z.string().min(1),
    to: z.string().nullable().optional(),
    context: z.unknown().optional(),
    subjectTemplate: z.string().nullable().optional(),
    bodyTemplate: z.string().nullable().optional(),
    bodyTextTemplate: z.string().nullable().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["ADMIN_CONFIG"]);
    const body = await parseJsonBodyWithSchema(req, Schema);
    if (body instanceof Response) return body as any;

    const channel = body.channel;
    const to =
      typeof body.to === "string" && body.to.trim()
        ? body.to.trim()
        : channel === "email"
          ? String(actor?.email || "").trim()
          : "";

    if (!to) {
      return errorResponse(channel === "email" ? "Recipient email required" : "Recipient phone required", 400);
    }

    const noticeType = body.noticeType as NoticeType;
    const context = (body.context || {
      patron: { id: actor?.id || 0, firstName: actor?.first_given_name || "", lastName: actor?.family_name || "", email: channel === "email" ? to : "patron@example.org" },
      library: { name: "Library" },
      items: [{ title: "Sample Item", barcode: "000000" }],
    }) as NoticeContext;

    const eventId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    await createNotificationEvent({
      id: eventId,
      channel,
      noticeType,
      patronId: null,
      recipient: to,
      createdBy: actor?.id ?? null,
      context,
    });
    const provider = channel === "email" ? String(process.env.STACKSOS_EMAIL_PROVIDER || "console") : String(process.env.STACKSOS_SMS_PROVIDER || "console");
    const deliveryId = await createDelivery({ eventId, provider });

    const active = await getActiveTemplate(channel, noticeType);
    const subjectTemplate = body.subjectTemplate ?? active?.subject_template ?? `StacksOS test: ${noticeType}`;
    const bodyTemplate = body.bodyTemplate ?? active?.body_template ?? (channel === "email" ? "<p>Test message</p>" : "Test message");
    const bodyTextTemplate = body.bodyTextTemplate ?? active?.body_text_template ?? "Test message";

    const subject = subjectTemplate ? renderTemplateString(subjectTemplate, context, { html: false }) : `StacksOS test: ${noticeType}`;
    const html = renderTemplateString(bodyTemplate, context, { html: true });
    const text = bodyTextTemplate ? renderTemplateString(bodyTextTemplate, context, { html: false }) : undefined;

    try {
      if (channel === "email") {
        await sendEmail({
          to: { email: to, name: `${actor?.first_given_name || ""} ${actor?.family_name || ""}`.trim() },
          subject,
          html,
          text,
          from: { email: process.env.STACKSOS_EMAIL_FROM || "noreply@library.org", name: process.env.STACKSOS_EMAIL_FROM_NAME || "StacksOS" },
        });
      } else {
        await sendSms({ to, message: text || subject });
      }
      if (deliveryId) await markDeliveryAttempt({ deliveryId, status: "sent" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (deliveryId) await markDeliveryAttempt({ deliveryId, status: "failed", error: msg });
      throw e;
    }

    await logAuditEvent({
      action: "notifications.test_send",
      entity: "notification_event",
      entityId: eventId,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { noticeType, channel, to, deliveryId },
    });

    return successResponse({ sent: true, channel, to, eventId, deliveryId });
  } catch (error) {
    return serverErrorResponse(error, "Notifications test-send POST", req);
  }
}
