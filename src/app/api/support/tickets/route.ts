import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBodyWithSchema, successResponse, serverErrorResponse, getRequestMeta } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { createTicket, listTickets } from "@/lib/db/support";
import { logAuditEvent } from "@/lib/audit";

const CreateSchema = z
  .object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    category: z.enum(["general", "bug", "data", "billing", "training", "security"]).default("general"),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    requesterEmail: z.string().email().optional(),
    requesterName: z.string().max(200).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);
    const tickets = await listTickets(100);
    return successResponse({ tickets });
  } catch (error) {
    return serverErrorResponse(error, "Support tickets GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const body = await parseJsonBodyWithSchema(req, CreateSchema);
    if (body instanceof Response) return body as any;

    const created = await createTicket({
      createdBy: actor?.id ?? null,
      requesterEmail: body.requesterEmail || actor?.email || null,
      requesterName: body.requesterName || actor?.first_given_name || null,
      category: body.category,
      priority: body.priority,
      subject: body.subject,
      body: body.body,
    });
    const id = created?.id ?? null;
    if (!id) return errorResponse("Failed to create ticket", 500);

    await logAuditEvent({
      action: "support.ticket.create",
      entity: "support_ticket",
      entityId: id,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: { category: body.category, priority: body.priority, subject: body.subject },
    });

    return successResponse({ created: true, id });
  } catch (error) {
    return serverErrorResponse(error, "Support tickets POST", req);
  }
}

