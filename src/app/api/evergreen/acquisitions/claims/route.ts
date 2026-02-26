import { NextRequest } from "next/server";
import {
  callOpenSRF,
  getRequestMeta,
  successResponse,
  errorResponse,
  serverErrorResponse,
  payloadFirst,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

export type ClaimType = "claim" | "cancel_claim" | "receive";

export interface ClaimEvent {
  id: number;
  lineitemId: number;
  lineitemDetailId?: number;
  claimType: ClaimType;
  claimDate: string;
  claimCount: number;
  vendorId?: number;
  vendorName?: string;
  notes?: string;
  creator?: number;
  createTime: string;
}

export interface ClaimableItem {
  lineitemId: number;
  lineitemDetailId: number;
  title: string;
  author?: string;
  isbn?: string;
  barcode?: string;
  orderDate: string;
  expectedReceiveDate?: string;
  vendorId: number;
  vendorName: string;
  purchaseOrderId: number;
  purchaseOrderName: string;
  claimCount: number;
  lastClaimDate?: string;
  daysOverdue: number;
}

const acqClaimsPostSchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action");
  const lineitemId = searchParams.get("lineitemId");
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const orgId = actor?.ws_ou ?? actor?.home_ou;
    logger.debug({ route: "api.evergreen.acquisitions.claims", action, lineitemId }, "Claims GET");

    switch (action) {
      case "claimable": {
        const claimableItems: ClaimableItem[] = [];
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem.search", [
            authtoken,
            { state: ["on-order"] },
            {
              flesh: 2,
              flesh_fields: {
                jub: ["lineitem_details", "attributes", "purchase_order"],
                acqpo: ["provider"],
                acqlid: [],
              },
              limit,
              offset,
            },
          ]);
          const payload = response?.payload || [];
          const lineitems = Array.isArray(payload?.[0]) ? payload[0] : payload;
          const now = new Date();
          for (const li of Array.isArray(lineitems) ? lineitems : []) {
            const attrs = Array.isArray(li.attributes) ? li.attributes : [];
            const getAttr = (name: string) => {
              const attr = attrs.find((a: Record<string, unknown>) => a.attr_name === name);
              return attr?.attr_value || "";
            };
            const details = Array.isArray(li.lineitem_details) ? li.lineitem_details : [];
            const po = li.purchase_order || {};
            const provider = typeof po.provider === "object" ? po.provider : {};
            const orderDate = po.order_date || po.create_time || "";
            const expectedDate = li.expected_recv_date || li.expected_recv_time || null;
            let daysOverdue = 0;
            if (expectedDate) {
              const expected = new Date(expectedDate);
              daysOverdue = Math.floor(
                (now.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24)
              );
            } else if (orderDate) {
              const ordered = new Date(orderDate);
              const threshold = new Date(ordered.getTime() + 30 * 24 * 60 * 60 * 1000);
              daysOverdue = Math.floor(
                (now.getTime() - threshold.getTime()) / (1000 * 60 * 60 * 24)
              );
            }
            if (daysOverdue <= 0) continue;
            for (const detail of details) {
              if (detail.recv_time || detail.cancel_reason) continue;
              claimableItems.push({
                lineitemId: li.id,
                lineitemDetailId: detail.id,
                title: getAttr("title") || "Unknown",
                author: getAttr("author") || "",
                isbn: getAttr("isbn") || "",
                barcode: detail.barcode || "",
                orderDate,
                expectedReceiveDate: expectedDate,
                vendorId: provider.id || po.provider,
                vendorName: provider.name || "Provider " + po.provider,
                purchaseOrderId: po.id,
                purchaseOrderName: po.name || "PO-" + po.id,
                claimCount: detail.claim_count || 0,
                lastClaimDate: detail.last_claim_date || null,
                daysOverdue,
              });
            }
          }
        } catch (error: unknown) {
          logger.warn(
            { route: "api.evergreen.acquisitions.claims", action, err: String(error) },
            "Claimable items lookup failed"
          );
        }
        claimableItems.sort((a, b) => b.daysOverdue - a.daysOverdue);
        return successResponse({ items: claimableItems, total: claimableItems.length });
      }
      case "history": {
        let claimHistory: ClaimEvent[] = [];
        try {
          const filters: Record<string, unknown> = {};
          if (lineitemId) filters.lineitem = parseInt(lineitemId, 10);
          const response = await callOpenSRF(
            "open-ils.acq",
            "open-ils.acq.claim_event.org.retrieve",
            [
              authtoken,
              orgId,
              { ...filters, limit, offset, order_by: { acqce: "create_time DESC" } },
            ]
          );
          const payload = response?.payload || [];
          const events = Array.isArray(payload?.[0]) ? payload[0] : payload;
          claimHistory = (Array.isArray(events) ? events : []).map(
            (ev: Record<string, unknown>) => {
              const lineitem = ev.lineitem;
              const lineitemDetail = ev.lineitem_detail;
              return {
                id: ev.id as number,
                lineitemId:
                  typeof lineitem === "object" && lineitem !== null
                    ? ((lineitem as Record<string, unknown>).id as number)
                    : (lineitem as number),
                lineitemDetailId:
                  typeof lineitemDetail === "object" && lineitemDetail !== null
                    ? ((lineitemDetail as Record<string, unknown>).id as number)
                    : (lineitemDetail as number),
                claimType: ((ev.type as string) || "claim") as ClaimType,
                claimDate: (ev.claim_date as string) || (ev.create_time as string),
                claimCount: (ev.claim_count as number) || 1,
                vendorId: (ev.provider as number) || undefined,
                vendorName: (ev.provider_name as string) || undefined,
                notes: (ev.note as string) || (ev.notes as string) || "",
                creator: ev.creator as number,
                createTime: ev.create_time as string,
              };
            }
          );
        } catch (error: unknown) {
          logger.warn(
            { route: "api.evergreen.acquisitions.claims", action, lineitemId, err: String(error) },
            "Claim history lookup failed"
          );
        }
        return successResponse({ history: claimHistory, total: claimHistory.length });
      }
      case "claim_reasons": {
        let reasons: Array<{ id: number; code: string; description: string }> = [];
        try {
          const response = await callOpenSRF(
            "open-ils.acq",
            "open-ils.acq.claim_type.retrieve.all",
            [authtoken]
          );
          const payload = response?.payload || [];
          const typeList = Array.isArray(payload?.[0]) ? payload[0] : payload;
          reasons = (Array.isArray(typeList) ? typeList : []).map((t: Record<string, unknown>) => ({
            id: t.id as number,
            code: (t.code as string) || (t.name as string) || "Type " + t.id,
            description: (t.description as string) || (t.label as string) || "",
          }));
        } catch (_error: unknown) {
          reasons = [
            { id: 1, code: "not_received", description: "Item not received" },
            { id: 2, code: "damaged", description: "Item received damaged" },
            { id: 3, code: "wrong_item", description: "Wrong item received" },
            { id: 4, code: "short_shipment", description: "Short shipment" },
          ];
        }
        return successResponse({ reasons });
      }
      case "summary": {
        const summary = {
          totalClaimable: 0,
          totalClaimed: 0,
          pendingClaims: 0,
          resolvedClaims: 0,
          byVendor: [] as Array<{ vendorId: number; vendorName: string; count: number }>,
        };
        try {
          const claimableResp = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem.search", [
            authtoken,
            { state: ["on-order"] },
            { id_list: true },
          ]);
          const claimablePayload = claimableResp?.payload || [];
          const claimableIds = Array.isArray(claimablePayload?.[0])
            ? claimablePayload[0]
            : claimablePayload;
          summary.totalClaimable = Array.isArray(claimableIds) ? claimableIds.length : 0;
          const claimsResp = await callOpenSRF(
            "open-ils.acq",
            "open-ils.acq.claim_event.org.retrieve",
            [authtoken, orgId, { limit: 1000 }]
          );
          const claimsPayload = claimsResp?.payload || [];
          const claims = Array.isArray(claimsPayload?.[0]) ? claimsPayload[0] : claimsPayload;
          if (Array.isArray(claims)) {
            summary.totalClaimed = claims.length;
            summary.pendingClaims = claims.filter(
              (c: Record<string, unknown>) => !c.resolved_time
            ).length;
            summary.resolvedClaims = claims.filter(
              (c: Record<string, unknown>) => !!c.resolved_time
            ).length;
          }
        } catch (error: unknown) {
          logger.warn(
            { route: "api.evergreen.acquisitions.claims", action, err: String(error) },
            "Claims summary lookup failed"
          );
        }
        return successResponse({ summary });
      }
      default:
        return errorResponse(
          "Invalid action. Use: claimable, history, claim_reasons, summary",
          400
        );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AuthenticationError")
      return errorResponse("Authentication required", 401);
    return serverErrorResponse(err, "Claims GET", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN", "ADMIN_ACQ_CLAIM"]);
    const body = acqClaimsPostSchema.parse(await req.json());
    const { action } = body;
    const extra = body as Record<string, unknown>;
    logger.debug({ route: "api.evergreen.acquisitions.claims", action }, "Claims POST");

    switch (action) {
      case "claim": {
        const lineitemId = extra.lineitemId as number | undefined;
        const lineitemDetailIds = extra.lineitemDetailIds as number[] | undefined;
        const claimTypeId = extra.claimTypeId as number | undefined;
        const notes = extra.notes as string | undefined;
        const sendNotification = extra.sendNotification as boolean | undefined;
        if (!lineitemId && !lineitemDetailIds?.length)
          return errorResponse("Lineitem ID or detail IDs required", 400);
        const claimType = claimTypeId || 1;
        let claimedCount = 0;
        const errors: string[] = [];
        try {
          if (lineitemDetailIds && Array.isArray(lineitemDetailIds)) {
            for (const detailId of lineitemDetailIds) {
              try {
                const response = await callOpenSRF(
                  "open-ils.acq",
                  "open-ils.acq.lineitem_detail.claim",
                  [authtoken, detailId, claimType, notes || ""]
                );
                const result = payloadFirst(response);
                if (result?.ilsevent)
                  errors.push("Detail " + detailId + ": " + (result.textcode || "Failed"));
                else claimedCount++;
              } catch (error: unknown) {
                errors.push("Detail " + detailId + ": " + String(error));
              }
            }
          } else {
            const response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim.lineitem", [
              authtoken,
              lineitemId,
              claimType,
              notes || "",
            ]);
            const result = payloadFirst(response);
            if (result?.ilsevent)
              return errorResponse(result.textcode || "Failed to create claim", 400);
            claimedCount = 1;
          }
          if (sendNotification && claimedCount > 0) {
            try {
              await sendClaimNotification(authtoken, lineitemId!, claimType, notes);
            } catch (emailError: unknown) {
              logger.warn(
                { route: "api.evergreen.acquisitions.claims", lineitemId, err: String(emailError) },
                "Failed to send claim notification"
              );
            }
          }

          await logAuditEvent({
            action: "acq.claim.create",
            entity: "acq_claim",
            entityId: lineitemId || undefined,
            status: errors.length > 0 ? "failure" : "success",
            actor,
            ip,
            userAgent,
            requestId,
            details: {
              lineitemId,
              lineitemDetailIds: lineitemDetailIds || null,
              claimTypeId: claimType,
              claimedCount,
              sendNotification: Boolean(sendNotification),
            },
            error: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
          });

          return successResponse(
            { claimed: true, count: claimedCount, errors: errors.length > 0 ? errors : undefined },
            "Claimed " + claimedCount + " item(s)"
          );
        } catch (_error: unknown) {
          return errorResponse("Failed to create claim", 500);
        }
      }
      case "cancel_claim": {
        const claimId = extra.claimId as number | undefined;
        const lineitemDetailId = extra.lineitemDetailId as number | undefined;
        const notes = extra.notes as string | undefined;
        if (!claimId && !lineitemDetailId)
          return errorResponse("Claim ID or lineitem detail ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim.cancel", [
            authtoken,
            claimId || lineitemDetailId,
            notes || "",
          ]);
          const result = payloadFirst(response);
          if (result?.ilsevent)
            return errorResponse(result.textcode || "Failed to cancel claim", 400);

          await logAuditEvent({
            action: "acq.claim.cancel",
            entity: "acq_claim",
            entityId: claimId || lineitemDetailId,
            status: "success",
            actor,
            ip,
            userAgent,
            requestId,
            details: { claimId: claimId || null, lineitemDetailId: lineitemDetailId || null },
          });

          return successResponse(
            { cancelled: true, claimId: claimId || lineitemDetailId },
            "Claim cancelled"
          );
        } catch (_error: unknown) {
          return errorResponse("Failed to cancel claim", 500);
        }
      }
      case "receive": {
        const lineitemDetailId = extra.lineitemDetailId as number | undefined;
        const notes = extra.notes as string | undefined;
        if (!lineitemDetailId) return errorResponse("Lineitem detail ID required", 400);
        try {
          const response = await callOpenSRF(
            "open-ils.acq",
            "open-ils.acq.lineitem_detail.receive",
            [authtoken, lineitemDetailId]
          );
          const result = payloadFirst(response);
          if (result?.ilsevent)
            return errorResponse(result.textcode || "Failed to receive item", 400);
          if (notes) {
            try {
              await callOpenSRF("open-ils.acq", "open-ils.acq.claim.resolve", [
                authtoken,
                lineitemDetailId,
                notes,
              ]);
            } catch (resolveError: unknown) {
              logger.warn(
                {
                  route: "api.evergreen.acquisitions.claims",
                  action,
                  lineitemDetailId,
                  err: String(resolveError),
                },
                "Failed to resolve claim"
              );
            }
          }

          await logAuditEvent({
            action: "acq.claim.receive",
            entity: "acq_lineitem_detail",
            entityId: lineitemDetailId,
            status: "success",
            actor,
            ip,
            userAgent,
            requestId,
            details: { lineitemDetailId, resolved: Boolean(notes) },
          });

          return successResponse({ received: true, lineitemDetailId }, "Item received");
        } catch (_error: unknown) {
          return errorResponse("Failed to receive item", 500);
        }
      }
      case "batch_claim": {
        const items = extra.items as Array<Record<string, unknown>> | undefined;
        const claimTypeId = extra.claimTypeId as number | undefined;
        const notes = extra.notes as string | undefined;
        const sendNotification = extra.sendNotification as boolean | undefined;
        if (!items || !Array.isArray(items) || items.length === 0)
          return errorResponse("Items array required", 400);
        const claimType = claimTypeId || 1;
        let claimedCount = 0;
        const errors: string[] = [];
        const notifiedLineitemIds = new Set<number>();
        for (const item of items) {
          const { lineitemDetailId, lineitemId } = item;
          try {
            let response;
            if (lineitemDetailId)
              response = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem_detail.claim", [
                authtoken,
                lineitemDetailId,
                claimType,
                notes || "",
              ]);
            else if (lineitemId)
              response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim.lineitem", [
                authtoken,
                lineitemId,
                claimType,
                notes || "",
              ]);
            else {
              errors.push("Item missing lineitemDetailId or lineitemId");
              continue;
            }
            const result = payloadFirst(response);
            if (result?.ilsevent)
              errors.push(
                "Item " + (lineitemDetailId || lineitemId) + ": " + (result.textcode || "Failed")
              );
            else {
              claimedCount++;
              const li = parseInt(String(lineitemId ?? ""), 10);
              if (sendNotification && Number.isFinite(li) && li > 0) notifiedLineitemIds.add(li);
            }
          } catch (error: unknown) {
            errors.push("Item " + (lineitemDetailId || lineitemId) + ": " + String(error));
          }
        }

        if (sendNotification && notifiedLineitemIds.size > 0) {
          for (const li of notifiedLineitemIds) {
            try {
              await sendClaimNotification(authtoken, li, claimType, notes);
            } catch (emailError: unknown) {
              logger.warn(
                {
                  route: "api.evergreen.acquisitions.claims",
                  lineitemId: li,
                  err: String(emailError),
                },
                "Failed to send claim notification"
              );
            }
          }
        }

        await logAuditEvent({
          action: "acq.claim.batch_create",
          entity: "acq_claim",
          status: errors.length > 0 ? "failure" : "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: {
            total: items.length,
            claimedCount,
            claimTypeId: claimType,
            sendNotification: Boolean(sendNotification),
            notifiedLineitemIds: Array.from(notifiedLineitemIds).slice(0, 50),
          },
          error: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
        });

        return successResponse(
          {
            claimed: true,
            count: claimedCount,
            total: items.length,
            errors: errors.length > 0 ? errors : undefined,
          },
          "Claimed " + claimedCount + " of " + items.length + " item(s)"
        );
      }
      case "add_note": {
        const claimId = extra.claimId as number | undefined;
        const lineitemDetailId = extra.lineitemDetailId as number | undefined;
        const note = extra.note as string | undefined;
        if (!claimId && !lineitemDetailId)
          return errorResponse("Claim ID or lineitem detail ID required", 400);
        if (!note) return errorResponse("Note text required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim.note.add", [
            authtoken,
            claimId || lineitemDetailId,
            note,
          ]);
          const result = payloadFirst(response);
          if (result?.ilsevent) return errorResponse(result.textcode || "Failed to add note", 400);

          await logAuditEvent({
            action: "acq.claim.note.add",
            entity: "acq_claim",
            entityId: claimId || lineitemDetailId,
            status: "success",
            actor,
            ip,
            userAgent,
            requestId,
            details: {
              claimId: claimId || null,
              lineitemDetailId: lineitemDetailId || null,
              noteLength: String(note).length,
            },
          });

          return successResponse(
            { added: true, claimId: claimId || lineitemDetailId },
            "Note added to claim"
          );
        } catch (_error: unknown) {
          return errorResponse("Failed to add note", 500);
        }
      }
      default:
        return errorResponse(
          "Invalid action. Use: claim, cancel_claim, receive, batch_claim, add_note",
          400
        );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AuthenticationError")
      return errorResponse("Authentication required", 401);
    return serverErrorResponse(err, "Claims POST", req);
  }
}

async function sendClaimNotification(
  authtoken: string,
  lineitemId: number,
  claimTypeId?: number,
  notes?: string
): Promise<void> {
  const liResponse = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem.retrieve", [
    authtoken,
    lineitemId,
    { flesh: 2, flesh_fields: { jub: ["attributes", "purchase_order"], acqpo: ["provider"] } },
  ]);
  const li = payloadFirst(liResponse) as Record<string, unknown> | null;
  if (!li) throw new Error("Lineitem not found");
  const attrs = Array.isArray(li.attributes) ? li.attributes : [];
  const getAttr = (name: string) => {
    const attr = attrs.find((a: Record<string, unknown>) => a.attr_name === name);
    return attr?.attr_value || "";
  };
  const po = (li.purchase_order as Record<string, unknown>) || {};
  const provider = (typeof po.provider === "object" ? po.provider : {}) as Record<string, unknown>;
  const vendorEmail = provider.email as string | undefined;
  if (!vendorEmail) {
    logger.warn({ lineitemId, vendorId: provider.id }, "Vendor has no email address");
    return;
  }
  const subject = "Claim Notice: " + getAttr("title") + " (PO: " + (po.name || po.id) + ")";
  const body =
    "Dear " +
    (provider.name || "Vendor") +
    ",\n\nWe are following up on the following item that has not been received:\n\nTitle: " +
    getAttr("title") +
    "\nAuthor: " +
    (getAttr("author") || "N/A") +
    "\nISBN: " +
    (getAttr("isbn") || "N/A") +
    "\nPurchase Order: " +
    (po.name || po.id) +
    "\nOrder Date: " +
    (po.order_date || po.create_time || "N/A") +
    "\n\n" +
    (notes ? "Notes: " + notes + "\n\n" : "") +
    "Please advise on the status of this order.\n\nThank you,\nLibrary Acquisitions";
  await sendEmail({
    to: { email: vendorEmail, name: (provider.name as string) || "Vendor" },
    from: {
      email: process.env.STACKSOS_EMAIL_FROM || "noreply@library.org",
      name: "Library Acquisitions",
    },
    subject,
    text: body,
    html: "<pre>" + body + "</pre>",
  });
  logger.info(
    { lineitemId, vendorId: provider.id, vendorEmail },
    "Claim notification sent to vendor"
  );
}
