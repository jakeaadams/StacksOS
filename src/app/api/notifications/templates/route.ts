import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBodyWithSchema, successResponse, serverErrorResponse, getRequestMeta } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { activateTemplate, createTemplateVersion, listTemplates } from "@/lib/db/notifications";
import { logAuditEvent } from "@/lib/audit";

const ChannelSchema = z.enum(["email", "sms"]);

const CreateSchema = z
  .object({
    action: z.literal("create"),
    channel: ChannelSchema,
    noticeType: z.string().min(1),
    subjectTemplate: z.string().nullable().optional(),
    bodyTemplate: z.string().min(1),
    bodyTextTemplate: z.string().nullable().optional(),
    activate: z.boolean().optional(),
  })
  .strict();

const ActivateSchema = z
  .object({
    action: z.literal("activate"),
    channel: ChannelSchema,
    templateId: z.number().int().positive(),
  })
  .strict();

const BodySchema = z.discriminatedUnion("action", [CreateSchema, ActivateSchema]);

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const channelRaw = req.nextUrl.searchParams.get("channel") || "email";
    const parsedChannel = ChannelSchema.safeParse(channelRaw);
    const channel = parsedChannel.success ? parsedChannel.data : "email";
    const noticeType = req.nextUrl.searchParams.get("notice_type") || undefined;
    const templates = await listTemplates(channel, noticeType);

    return successResponse({ channel, noticeType: noticeType || null, templates });
  } catch (error) {
    return serverErrorResponse(error, "Notifications templates GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["ADMIN_CONFIG"]);

    const body = await parseJsonBodyWithSchema(req, BodySchema);
    if (body instanceof Response) return body;

    if (body.action === "create") {
      const id = await createTemplateVersion({
        channel: body.channel,
        noticeType: body.noticeType,
        subjectTemplate: body.subjectTemplate ?? null,
        bodyTemplate: body.bodyTemplate,
        bodyTextTemplate: body.bodyTextTemplate ?? null,
        createdBy: actor?.id ?? null,
        activate: body.activate === true,
      });

      await logAuditEvent({
        action: "notifications.template.create",
        entity: "notification_template",
        entityId: id,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { channel: body.channel, noticeType: body.noticeType, activate: body.activate === true },
      });

      return successResponse({ created: true, templateId: id });
    }

    if (body.action === "activate") {
      const activated = await activateTemplate(body.channel, body.templateId);
      if (!activated) return errorResponse("Template not found", 404);

      await logAuditEvent({
        action: "notifications.template.activate",
        entity: "notification_template",
        entityId: body.templateId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: { channel: body.channel, noticeType: activated.noticeType },
      });

      return successResponse({ activated: true, templateId: body.templateId, noticeType: activated.noticeType });
    }

    return errorResponse("Invalid action", 400);
  } catch (error) {
    return serverErrorResponse(error, "Notifications templates POST", req);
  }
}
