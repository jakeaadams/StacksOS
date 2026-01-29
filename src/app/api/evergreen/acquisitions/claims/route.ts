import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";

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
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem.search", [authtoken, { state: ["on-order"] }, { flesh: 2, flesh_fields: { jub: ["lineitem_details", "attributes", "purchase_order"], acqpo: ["provider"], acqlid: [] }, limit, offset }]);
          const payload = response?.payload || [];
          const lineitems = Array.isArray(payload?.[0]) ? payload[0] : payload;
          const now = new Date();
          for (const li of (Array.isArray(lineitems) ? lineitems : [])) {
            const attrs = Array.isArray(li.attributes) ? li.attributes : [];
            const getAttr = (name: string) => { const attr = attrs.find((a: any) => a.attr_name === name); return attr?.attr_value || ""; };
            const details = Array.isArray(li.lineitem_details) ? li.lineitem_details : [];
            const po = li.purchase_order || {};
            const provider = typeof po.provider === "object" ? po.provider : {};
            const orderDate = po.order_date || po.create_time || "";
            const expectedDate = li.expected_recv_date || li.expected_recv_time || null;
            let daysOverdue = 0;
            if (expectedDate) { const expected = new Date(expectedDate); daysOverdue = Math.floor((now.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24)); }
            else if (orderDate) { const ordered = new Date(orderDate); const threshold = new Date(ordered.getTime() + 30 * 24 * 60 * 60 * 1000); daysOverdue = Math.floor((now.getTime() - threshold.getTime()) / (1000 * 60 * 60 * 24)); }
            if (daysOverdue <= 0) continue;
            for (const detail of details) {
              if (detail.recv_time || detail.cancel_reason) continue;
              claimableItems.push({ lineitemId: li.id, lineitemDetailId: detail.id, title: getAttr("title") || "Unknown", author: getAttr("author") || "", isbn: getAttr("isbn") || "", barcode: detail.barcode || "", orderDate, expectedReceiveDate: expectedDate, vendorId: provider.id || po.provider, vendorName: provider.name || "Provider " + po.provider, purchaseOrderId: po.id, purchaseOrderName: po.name || "PO-" + po.id, claimCount: detail.claim_count || 0, lastClaimDate: detail.last_claim_date || null, daysOverdue });
            }
          }
        } catch (error) { logger.warn({ route: "api.evergreen.acquisitions.claims", action, err: String(error) }, "Claimable items lookup failed"); }
        claimableItems.sort((a, b) => b.daysOverdue - a.daysOverdue);
        return successResponse({ items: claimableItems, total: claimableItems.length });
      }
      case "history": {
        let claimHistory: ClaimEvent[] = [];
        try {
          const filters: Record<string, any> = {};
          if (lineitemId) filters.lineitem = parseInt(lineitemId, 10);
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim_event.org.retrieve", [authtoken, orgId, { ...filters, limit, offset, order_by: { acqce: "create_time DESC" } }]);
          const payload = response?.payload || [];
          const events = Array.isArray(payload?.[0]) ? payload[0] : payload;
          claimHistory = (Array.isArray(events) ? events : []).map((ev: any) => ({ id: ev.id, lineitemId: typeof ev.lineitem === "object" ? ev.lineitem?.id : ev.lineitem, lineitemDetailId: typeof ev.lineitem_detail === "object" ? ev.lineitem_detail?.id : ev.lineitem_detail, claimType: ev.type || "claim", claimDate: ev.claim_date || ev.create_time, claimCount: ev.claim_count || 1, vendorId: ev.provider || null, vendorName: ev.provider_name || null, notes: ev.note || ev.notes || "", creator: ev.creator, createTime: ev.create_time }));
        } catch (error) { logger.warn({ route: "api.evergreen.acquisitions.claims", action, lineitemId, err: String(error) }, "Claim history lookup failed"); }
        return successResponse({ history: claimHistory, total: claimHistory.length });
      }
      case "claim_reasons": {
        let reasons: Array<{ id: number; code: string; description: string }> = [];
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim_type.retrieve.all", [authtoken]);
          const payload = response?.payload || [];
          const typeList = Array.isArray(payload?.[0]) ? payload[0] : payload;
          reasons = (Array.isArray(typeList) ? typeList : []).map((t: any) => ({ id: t.id, code: t.code || t.name || "Type " + t.id, description: t.description || t.label || "" }));
        } catch (error) { reasons = [{ id: 1, code: "not_received", description: "Item not received" }, { id: 2, code: "damaged", description: "Item received damaged" }, { id: 3, code: "wrong_item", description: "Wrong item received" }, { id: 4, code: "short_shipment", description: "Short shipment" }]; }
        return successResponse({ reasons });
      }
      case "summary": {
        const summary = { totalClaimable: 0, totalClaimed: 0, pendingClaims: 0, resolvedClaims: 0, byVendor: [] as Array<{ vendorId: number; vendorName: string; count: number }> };
        try {
          const claimableResp = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem.search", [authtoken, { state: ["on-order"] }, { id_list: true }]);
          const claimablePayload = claimableResp?.payload || [];
          const claimableIds = Array.isArray(claimablePayload?.[0]) ? claimablePayload[0] : claimablePayload;
          summary.totalClaimable = Array.isArray(claimableIds) ? claimableIds.length : 0;
          const claimsResp = await callOpenSRF("open-ils.acq", "open-ils.acq.claim_event.org.retrieve", [authtoken, orgId, { limit: 1000 }]);
          const claimsPayload = claimsResp?.payload || [];
          const claims = Array.isArray(claimsPayload?.[0]) ? claimsPayload[0] : claimsPayload;
          if (Array.isArray(claims)) { summary.totalClaimed = claims.length; summary.pendingClaims = claims.filter((c: any) => !c.resolved_time).length; summary.resolvedClaims = claims.filter((c: any) => c.resolved_time).length; }
        } catch (error) { logger.warn({ route: "api.evergreen.acquisitions.claims", action, err: String(error) }, "Claims summary lookup failed"); }
        return successResponse({ summary });
      }
      default: return errorResponse("Invalid action. Use: claimable, history, claim_reasons, summary", 400);
    }
  } catch (err: any) {
    if (err.name === "AuthenticationError") return errorResponse("Authentication required", 401);
    return serverErrorResponse(err, "Claims GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const body = await req.json();
    const { action } = body;
    logger.debug({ route: "api.evergreen.acquisitions.claims", action }, "Claims POST");

    switch (action) {
      case "claim": {
        const { lineitemId, lineitemDetailIds, claimTypeId, notes, sendNotification } = body;
        if (!lineitemId && !lineitemDetailIds?.length) return errorResponse("Lineitem ID or detail IDs required", 400);
        const claimType = claimTypeId || 1;
        let claimedCount = 0;
        const errors: string[] = [];
        try {
          if (lineitemDetailIds && Array.isArray(lineitemDetailIds)) {
            for (const detailId of lineitemDetailIds) {
              try {
                const response = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem_detail.claim", [authtoken, detailId, claimType, notes || ""]);
                const result = response?.payload?.[0];
                if (result?.ilsevent) errors.push("Detail " + detailId + ": " + (result.textcode || "Failed"));
                else claimedCount++;
              } catch (error) { errors.push("Detail " + detailId + ": " + String(error)); }
            }
          } else {
            const response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim.lineitem", [authtoken, lineitemId, claimType, notes || ""]);
            const result = response?.payload?.[0];
            if (result?.ilsevent) return errorResponse(result.textcode || "Failed to create claim", 400);
            claimedCount = 1;
          }
          if (sendNotification && claimedCount > 0) {
            try { await sendClaimNotification(authtoken, lineitemId, claimType, notes); }
            catch (emailError) { logger.warn({ route: "api.evergreen.acquisitions.claims", lineitemId, err: String(emailError) }, "Failed to send claim notification"); }
          }
          return successResponse({ claimed: true, count: claimedCount, errors: errors.length > 0 ? errors : undefined }, "Claimed " + claimedCount + " item(s)");
        } catch (error) { return errorResponse("Failed to create claim", 500); }
      }
      case "cancel_claim": {
        const { claimId, lineitemDetailId, notes } = body;
        if (!claimId && !lineitemDetailId) return errorResponse("Claim ID or lineitem detail ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim.cancel", [authtoken, claimId || lineitemDetailId, notes || ""]);
          const result = response?.payload?.[0];
          if (result?.ilsevent) return errorResponse(result.textcode || "Failed to cancel claim", 400);
          return successResponse({ cancelled: true, claimId: claimId || lineitemDetailId }, "Claim cancelled");
        } catch (error) { return errorResponse("Failed to cancel claim", 500); }
      }
      case "receive": {
        const { lineitemDetailId, notes } = body;
        if (!lineitemDetailId) return errorResponse("Lineitem detail ID required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem_detail.receive", [authtoken, lineitemDetailId]);
          const result = response?.payload?.[0];
          if (result?.ilsevent) return errorResponse(result.textcode || "Failed to receive item", 400);
          if (notes) { try { await callOpenSRF("open-ils.acq", "open-ils.acq.claim.resolve", [authtoken, lineitemDetailId, notes]); } catch (resolveError) { logger.warn({ route: "api.evergreen.acquisitions.claims", action, lineitemDetailId, err: String(resolveError) }, "Failed to resolve claim"); } }
          return successResponse({ received: true, lineitemDetailId }, "Item received");
        } catch (error) { return errorResponse("Failed to receive item", 500); }
      }
      case "batch_claim": {
        const { items, claimTypeId, notes, sendNotification } = body;
        if (!items || !Array.isArray(items) || items.length === 0) return errorResponse("Items array required", 400);
        const claimType = claimTypeId || 1;
        let claimedCount = 0;
        const errors: string[] = [];
        for (const item of items) {
          const { lineitemDetailId, lineitemId } = item;
          try {
            let response;
            if (lineitemDetailId) response = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem_detail.claim", [authtoken, lineitemDetailId, claimType, notes || ""]);
            else if (lineitemId) response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim.lineitem", [authtoken, lineitemId, claimType, notes || ""]);
            else { errors.push("Item missing lineitemDetailId or lineitemId"); continue; }
            const result = response?.payload?.[0];
            if (result?.ilsevent) errors.push("Item " + (lineitemDetailId || lineitemId) + ": " + (result.textcode || "Failed"));
            else claimedCount++;
          } catch (error) { errors.push("Item " + (lineitemDetailId || lineitemId) + ": " + String(error)); }
        }
        return successResponse({ claimed: true, count: claimedCount, total: items.length, errors: errors.length > 0 ? errors : undefined }, "Claimed " + claimedCount + " of " + items.length + " item(s)");
      }
      case "add_note": {
        const { claimId, lineitemDetailId, note } = body;
        if (!claimId && !lineitemDetailId) return errorResponse("Claim ID or lineitem detail ID required", 400);
        if (!note) return errorResponse("Note text required", 400);
        try {
          const response = await callOpenSRF("open-ils.acq", "open-ils.acq.claim.note.add", [authtoken, claimId || lineitemDetailId, note]);
          const result = response?.payload?.[0];
          if (result?.ilsevent) return errorResponse(result.textcode || "Failed to add note", 400);
          return successResponse({ added: true, claimId: claimId || lineitemDetailId }, "Note added to claim");
        } catch (error) { return errorResponse("Failed to add note", 500); }
      }
      default: return errorResponse("Invalid action. Use: claim, cancel_claim, receive, batch_claim, add_note", 400);
    }
  } catch (err: any) {
    if (err.name === "AuthenticationError") return errorResponse("Authentication required", 401);
    return serverErrorResponse(err, "Claims POST", req);
  }
}

async function sendClaimNotification(authtoken: string, lineitemId: number, claimTypeId?: number, notes?: string): Promise<void> {
  const liResponse = await callOpenSRF("open-ils.acq", "open-ils.acq.lineitem.retrieve", [authtoken, lineitemId, { flesh: 2, flesh_fields: { jub: ["attributes", "purchase_order"], acqpo: ["provider"] } }]);
  const li = liResponse?.payload?.[0];
  if (!li) throw new Error("Lineitem not found");
  const attrs = Array.isArray(li.attributes) ? li.attributes : [];
  const getAttr = (name: string) => { const attr = attrs.find((a: any) => a.attr_name === name); return attr?.attr_value || ""; };
  const po = li.purchase_order || {};
  const provider = typeof po.provider === "object" ? po.provider : {};
  const vendorEmail = provider.email;
  if (!vendorEmail) { logger.warn({ lineitemId, vendorId: provider.id }, "Vendor has no email address"); return; }
  const subject = "Claim Notice: " + getAttr("title") + " (PO: " + (po.name || po.id) + ")";
  const body = "Dear " + (provider.name || "Vendor") + ",\n\nWe are following up on the following item that has not been received:\n\nTitle: " + getAttr("title") + "\nAuthor: " + (getAttr("author") || "N/A") + "\nISBN: " + (getAttr("isbn") || "N/A") + "\nPurchase Order: " + (po.name || po.id) + "\nOrder Date: " + (po.order_date || po.create_time || "N/A") + "\n\n" + (notes ? "Notes: " + notes + "\n\n" : "") + "Please advise on the status of this order.\n\nThank you,\nLibrary Acquisitions";
  await sendEmail({ to: { email: vendorEmail, name: provider.name || "Vendor" }, from: { email: process.env.STACKSOS_EMAIL_FROM || "noreply@library.org", name: "Library Acquisitions" }, subject, text: body, html: "<pre>" + body + "</pre>" });
  logger.info({ lineitemId, vendorId: provider.id, vendorEmail }, "Claim notification sent to vendor");
}
