import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";

/**
 * Acquisitions API
 * Handles purchase orders, vendors, funds, invoices, and receiving
 */

// GET - Fetch acquisitions data
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action");
  const id = searchParams.get("id");

  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);

    logger.debug({ route: "api.evergreen.acquisitions", action, id }, "Acquisitions GET");

    switch (action) {
      case "orders":
      case "purchase_orders": {
        // Get purchase orders
        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.purchase_order.search",
          [
            authtoken,
            { state: ["on-order", "pending", "received", "approved"] },
            { flesh: 2, flesh_fields: { acqpo: ["lineitems", "provider"] } },
          ]
        );

        const ordersPayload = response?.payload || [];
        const orders = Array.isArray((ordersPayload as any)?.[0]) ? (ordersPayload as any)[0] : ordersPayload;

        const mappedOrders = (Array.isArray(orders) ? orders : []).map((po: any) => {
          const providerId = typeof po.provider === "object" ? po.provider.id : po.provider;
          const providerName = typeof po.provider === "object" ? po.provider.name : undefined;
          const orderDate = po.order_date || po.create_time || null;
          const createTime = po.create_time || null;
          const lineitemCount = Array.isArray(po.lineitems)
            ? po.lineitems.length
            : (po.lineitem_count || 0);

          return {
            id: po.id,
            name: po.name || `PO-${po.id}`,
            provider: providerId,
            provider_name: providerName,
            state: po.state || "unknown",
            order_date: orderDate,
            create_time: createTime,
            lineitem_count: lineitemCount,

            // Back-compat keys for older UI/components
            providerId,
            orderDate,
            createTime,
            lineitemCount,
            owner: po.owner,
            orderingAgency: po.ordering_agency,
          };
        });

        return successResponse({ orders: mappedOrders });
      }

      case "vendors":
      case "providers": {
        // Get vendors/providers
        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.provider.org.retrieve",
          [authtoken, [], { limit_perm: "VIEW_PROVIDER" }]
        );

        const vendorsPayload = response?.payload || [];
        const vendors = Array.isArray((vendorsPayload as any)?.[0]) ? (vendorsPayload as any)[0] : vendorsPayload;

        const mappedVendors = (Array.isArray(vendors) ? vendors : []).map((v: any) => ({
          id: v.id,
          name: v.name || "Unknown",
          code: v.code || "",
          email: v.email || "",
          phone: v.phone || "",
          fax: v.fax || "",
          url: v.url || "",
          currency: v.currency_type || v.currency || "",
          active: v.active === "t" || v.active === true,
          owner: v.owner,
          contacts: Array.isArray(v.contacts) ? v.contacts : [],

          // Extra Evergreen fields (optional)
          sanCode: v.san || "",
          ediDefault: v.edi_default,
        }));

        return successResponse({ vendors: mappedVendors });
      }

      case "funds": {
        // Get funds (Evergreen exposes org-scoped fund retrieval)
        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.fund.org.retrieve",
          [authtoken, { active: "t" }, { limit: 500, limit_perm: "VIEW_FUND" }]
        );

        const fundsPayload = response?.payload || [];
        const funds = Array.isArray((fundsPayload as any)?.[0]) ? (fundsPayload as any)[0] : fundsPayload;

        const mappedFunds = (Array.isArray(funds) ? funds : []).map((f: any) => ({
          id: f.id,
          name: f.name || "Unknown",
          code: f.code || "",
          year: f.year,
          org: f.org,
          currency: f.currency_type || f.currency || "USD",
          active: f.active === "t" || f.active === true,
          combined_balance: f.combined_balance,
          rollover: f.rollover === "t" || f.rollover === true,

          // Back-compat keys for older UI/components
          currencyType: f.currency_type || "USD",
          combinedBalance: f.combined_balance,
        }));

        return successResponse({ funds: mappedFunds });
      }

      case "invoices": {
        // Get invoices (Evergreen 3.16 has no open-ils.acq.invoice.search)
        let response: any | null = null;

        try {
          response = await callOpenSRF(
            "open-ils.cstore",
            "open-ils.cstore.direct.acqinv.search.atomic",
            [authtoken, {}, { limit: 200, order_by: { acqinv: "recv_date DESC" } }]
          );
        } catch (error) {
          try {
            response = await callOpenSRF(
              "open-ils.cstore",
              "open-ils.cstore.direct.acqinv.search",
              [authtoken, {}, { limit: 200, order_by: { acqinv: "recv_date DESC" } }]
            );
          } catch (error) {
            logger.warn({ route: "api.evergreen.acquisitions", action, err: String(error) }, "Invoices lookup failed");
            return successResponse({
              invoices: [],
              message: "Invoices not available in this Evergreen configuration",
            });
          }
        }

        const invoicesPayload = response?.payload || [];
        const invoices = Array.isArray((invoicesPayload as any)?.[0]) ? (invoicesPayload as any)[0] : invoicesPayload;

        const mappedInvoices = (Array.isArray(invoices) ? invoices : []).map((inv: any) => ({
          id: inv.id,
          vendor_invoice_id: inv.vendor_invoice_id || inv.inv_ident || "",
          provider: typeof inv.provider === "object" ? inv.provider.id : inv.provider,
          receiver: typeof inv.receiver === "object" ? inv.receiver.id : inv.receiver,
          recv_date: inv.recv_date,
          close_date: inv.close_date,
          recv_method: inv.recv_method,

          // Back-compat keys
          vendorInvoiceId: inv.vendor_invoice_id || inv.inv_ident || "",
          recvDate: inv.recv_date,
          closeDate: inv.close_date,
        }));

        return successResponse({ invoices: mappedInvoices });
      }

      case "po": {
        // Get specific PO with lineitems
        if (!id) {
          return errorResponse("PO id required", 400);
        }

        const poId = parseInt(id, 10);
        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.purchase_order.retrieve",
          [
            authtoken,
            poId,
            {
              flesh: 3,
              flesh_fields: {
                acqpo: ["lineitems", "provider"],
                jub: ["lineitem_details", "attributes"],
                acqlid: ["fund", "owning_lib", "location"],
              },
            },
          ]
        );

        const po = response?.payload?.[0];
        if (!po || po.ilsevent) {
          return errorResponse("Purchase order not found", 404);
        }

        const lineitems = (Array.isArray(po.lineitems) ? po.lineitems : []).map((li: any) => {
          const attrs = Array.isArray(li.attributes) ? li.attributes : [];
          const getAttr = (name: string) => {
            const attr = attrs.find((a: any) => a.attr_name === name);
            return attr?.attr_value || "";
          };

          const details = Array.isArray(li.lineitem_details) ? li.lineitem_details : [];
          const receivedCount = details.filter((d: any) => d.recv_time).length;
          const cancelledCount = details.filter((d: any) => d.cancel_reason).length;

          return {
            id: li.id,
            title: getAttr("title") || "Unknown",
            author: getAttr("author") || "",
            isbn: getAttr("isbn") || "",
            publisher: getAttr("publisher") || "",
            pubdate: getAttr("pubdate") || "",
            estimatedPrice: li.estimated_unit_price || 0,
            state: li.state || "new",
            orderIdentifier: li.order_identifier || "",
            copyCount: details.length,
            receivedCount,
            cancelledCount,
            details: details.map((d: any) => ({
              id: d.id,
              barcode: d.barcode || "",
              fundId: typeof d.fund === "object" ? d.fund?.id : d.fund,
              fundName: typeof d.fund === "object" ? d.fund?.name : "",
              owningLib: typeof d.owning_lib === "object" ? d.owning_lib?.shortname : d.owning_lib,
              location: typeof d.location === "object" ? d.location?.name : "",
              recvTime: d.recv_time,
              cancelReason: d.cancel_reason,
            })),
          };
        });

        return successResponse({
          po: {
            id: po.id,
            name: po.name || `PO-${po.id}`,
            provider: po.provider?.name || po.provider,
            state: po.state,
            orderDate: po.order_date,
            createTime: po.create_time,
          },
          lineitems,
        });
      }

      default:
        return errorResponse("Invalid action", 400);
    }
  } catch (err: any) {
    if (err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Acquisitions GET", req);
  }
}

// POST - Create/modify acquisitions data
export async function POST(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const body = await req.json();
    const { action } = body;

    logger.debug({ route: "api.evergreen.acquisitions", action }, "Acquisitions POST");

    switch (action) {
      case "create_po": {
        const provider = body.provider;
        const orderingAgency =
          body.orderingAgency ??
          body.ordering_agency ??
          actor?.ws_ou ??
          actor?.home_ou;

        if (!provider) {
          return errorResponse("Provider required", 400);
        }

        if (!orderingAgency) {
          return errorResponse("Ordering agency required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.purchase_order.create",
          [
            authtoken,
            {
              provider,
              ordering_agency: orderingAgency,
              name: body.name || undefined,
            },
          ]
        );

        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to create PO", 400);
        }

        return successResponse({ po: result });
      }

      case "receive_lineitem": {
        const { lineitemId } = body;
        if (!lineitemId) {
          return errorResponse("Lineitem ID required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.lineitem.receive.batch",
          [authtoken, [lineitemId]]
        );

        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to receive lineitem", 400);
        }

        return successResponse({ received: true, lineitemId });
      }

      case "receive_lineitem_detail": {
        const detailId = body.detailId ?? body.lineitemDetailId ?? body.lineitem_detail_id;
        if (!detailId) {
          return errorResponse("Detail ID required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.lineitem_detail.receive",
          [authtoken, detailId]
        );

        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to receive copy", 400);
        }

        return successResponse({ received: true, detailId });
      }

      case "unreceive_lineitem_detail": {
        const detailId = body.detailId ?? body.lineitemDetailId ?? body.lineitem_detail_id;
        if (!detailId) {
          return errorResponse("Detail ID required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.lineitem_detail.receive.rollback",
          [authtoken, detailId]
        );

        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to unreceive copy", 400);
        }

        return successResponse({ unreceived: true, detailId });
      }

      case "cancel_lineitem": {
        const { lineitemId, reason } = body;
        if (!lineitemId) {
          return errorResponse("Lineitem ID required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.lineitem.cancel",
          [authtoken, lineitemId, reason || 1]
        );

        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to cancel lineitem", 400);
        }

        return successResponse({ cancelled: true, lineitemId });
      }

      case "claim_lineitem": {
        const { lineitemId, claimType } = body;
        if (!lineitemId) {
          return errorResponse("Lineitem ID required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.claim.lineitem",
          [authtoken, lineitemId, claimType || 1]
        );

        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to claim lineitem", 400);
        }

        return successResponse({ claimed: true, lineitemId });
      }

      case "mark_damaged": {
        const detailId = body.detailId ?? body.lineitemDetailId ?? body.lineitem_detail_id;
        if (!detailId) {
          return errorResponse("Detail ID required", 400);
        }

        // Mark the copy as damaged via circ
        const response = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.mark_item_damaged",
          [authtoken, detailId]
        );

        const result = response?.payload?.[0];
        if (result?.ilsevent && result.ilsevent !== 0) {
          return errorResponse(result.textcode || "Failed to mark damaged", 400);
        }

        return successResponse({ damaged: true, detailId });
      }

      default:
        return errorResponse("Invalid action", 400);
    }
  } catch (err: any) {
    if (err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Acquisitions POST", req);
  }
}
