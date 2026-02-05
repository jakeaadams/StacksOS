import { NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonBodyWithSchema, successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { renderTemplateString } from "@/lib/notifications/render";

const Schema = z
  .object({
    subjectTemplate: z.string().nullable().optional(),
    bodyTemplate: z.string().min(1),
    bodyTextTemplate: z.string().nullable().optional(),
    context: z.unknown(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);
    const body = await parseJsonBodyWithSchema(req, Schema);
    if (body instanceof Response) return body as any;

    const subject = body.subjectTemplate ? renderTemplateString(body.subjectTemplate, body.context, { html: false }) : "";
    const html = renderTemplateString(body.bodyTemplate, body.context, { html: true });
    const text = body.bodyTextTemplate ? renderTemplateString(body.bodyTextTemplate, body.context, { html: false }) : "";

    return successResponse({ subject, html, text });
  } catch (error) {
    return serverErrorResponse(error, "Notifications render POST", req);
  }
}
