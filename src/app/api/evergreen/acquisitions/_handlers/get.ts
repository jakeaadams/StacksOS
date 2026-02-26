import { NextRequest } from "next/server";
import {
  callOpenSRF,
  callPcrud,
  notFoundResponse,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { query } from "@/lib/db/evergreen";
import { requirePermissions } from "@/lib/permissions";
import { ACQUISITIONS_PERMS } from "@/lib/permissions-map";
import { logger } from "@/lib/logger";

function parsePositiveIntId(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return null;

  const intValue = Math.trunc(numeric);
  if (intValue <= 0) return null;

  return intValue;
}

/**
 * Acquisitions API
 * Handles purchase orders, vendors, funds, invoices, and receiving
 */

export async function handleAcquisitionsGet(
  req: NextRequest,
  overrides: { action?: string | null; id?: string | null } = {}
) {
  const searchParams = req.nextUrl.searchParams;
  const action = overrides.action ?? searchParams.get("action");
  const id = overrides.id ?? searchParams.get("id");

  try {
    const { authtoken, actor: _actor } = await requirePermissions(["STAFF_LOGIN"]);

    logger.debug({ route: "api.evergreen.acquisitions", action, id }, "Acquisitions GET");

    switch (action) {
      case "cancel_reasons": {
        await requirePermissions([...ACQUISITIONS_PERMS.cancel_lineitem]);

        const reasons = await query<{
          id: number;
          org_unit: number;
          label: string;
          description: string | null;
          keep_debits: boolean;
        }>(
          `
            select id, org_unit, label, description, keep_debits
            from acq.cancel_reason
            order by lower(label), id
          `
        );

        return successResponse({ cancelReasons: reasons });
      }

      case "claim_types": {
        // Evergreen uses admin-level perms for acquisitions claim management.
        await requirePermissions(["ADMIN_ACQ_CLAIM"]);

        const claimTypes = await query<{
          id: number;
          org_unit: number;
          code: string;
          description: string | null;
        }>(
          `
            select id, org_unit, code, description
            from acq.claim_type
            order by lower(code), id
          `
        );

        return successResponse({ claimTypes });
      }

      case "orders":
      case "purchase_orders": {
        // Get purchase orders
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.purchase_order.search", [
          authtoken,
          { state: ["on-order", "pending", "received", "approved"] },
          { flesh: 2, flesh_fields: { acqpo: ["lineitems", "provider"] } },
        ]);

        const ordersPayload = response?.payload || [];
        const orders = Array.isArray((ordersPayload as unknown[])?.[0])
          ? (ordersPayload as unknown[])[0]
          : ordersPayload;

        const mappedOrders = (Array.isArray(orders) ? orders : []).map((po) => {
          const providerId = typeof po.provider === "object" ? po.provider.id : po.provider;
          const providerName = typeof po.provider === "object" ? po.provider.name : undefined;
          const orderDate = po.order_date || po.create_time || null;
          const createTime = po.create_time || null;
          const lineitemCount = Array.isArray(po.lineitems)
            ? po.lineitems.length
            : po.lineitem_count || 0;

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
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.provider.org.retrieve", [
          authtoken,
          [],
          { limit_perm: "VIEW_PROVIDER" },
        ]);

        const vendorsPayload = response?.payload || [];
        const vendors = Array.isArray((vendorsPayload as unknown[])?.[0])
          ? (vendorsPayload as unknown[])[0]
          : vendorsPayload;

        const mappedVendors = (Array.isArray(vendors) ? vendors : []).map((v) => ({
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
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund.org.retrieve", [
          authtoken,
          { active: "t" },
          { limit: 500, limit_perm: "VIEW_FUND" },
        ]);

        const fundsPayload = response?.payload || [];
        const funds = Array.isArray((fundsPayload as unknown[])?.[0])
          ? (fundsPayload as unknown[])[0]
          : fundsPayload;

        const mappedFunds = (Array.isArray(funds) ? funds : []).map((f) => ({
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
        const receiverOrgId =
          parsePositiveIntId(
            (_actor as Record<string, any>)?.ws_ou ?? (_actor as Record<string, any>)?.home_ou
          ) ?? 1;
        let response: any = null;

        try {
          response = await callOpenSRF(
            "open-ils.cstore",
            "open-ils.cstore.direct.acqinv.search.atomic",
            [
              authtoken,
              { receiver: receiverOrgId },
              { limit: 200, order_by: { acqinv: "recv_date DESC" } },
            ]
          );
        } catch (_error: unknown) {
          try {
            response = await callOpenSRF(
              "open-ils.cstore",
              "open-ils.cstore.direct.acqinv.search",
              [
                authtoken,
                { receiver: receiverOrgId },
                { limit: 200, order_by: { acqinv: "recv_date DESC" } },
              ]
            );
          } catch (_error2: unknown) {
            // Some Evergreen installs do not expose cstore direct methods for acquisitions.
            // Fall back to pcrud search before treating this as "not available".
            try {
              response = await callPcrud("open-ils.pcrud.search.acqinv", [
                authtoken,
                { receiver: receiverOrgId },
                { limit: 200, order_by: { acqinv: "recv_date DESC" } },
              ]);
            } catch (err: unknown) {
              const code =
                err && typeof err === "object" ? (err as Record<string, any>).code : undefined;
              if (code === "OSRF_METHOD_NOT_FOUND") {
                logger.info(
                  { route: "api.evergreen.acquisitions", action },
                  "Invoices lookup not supported on this Evergreen install"
                );
              } else {
                logger.warn(
                  { route: "api.evergreen.acquisitions", action, err: String(err) },
                  "Invoices lookup failed"
                );
              }
              return successResponse({
                invoices: [],
                message: "Invoices not available in this Evergreen configuration",
              });
            }
          }
        }

        const invoicesPayload = response?.payload || [];
        const invoices = Array.isArray((invoicesPayload as unknown[])?.[0])
          ? (invoicesPayload as unknown[])[0]
          : invoicesPayload;

        const mappedInvoices = (Array.isArray(invoices) ? invoices : []).map((inv) => ({
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

      case "invoice_methods": {
        // Receive methods for invoices (acq.im)
        await requirePermissions(["CREATE_INVOICE"]);
        const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.acqim.atomic", [
          authtoken,
          { code: { "!=": null } },
          { order_by: { acqim: "name" }, limit: 100 },
        ]);
        const methods = (response?.payload?.[0] || [])
          .map((m: any) => ({
            code: m?.code ?? m?.__p?.[0],
            name: m?.name ?? m?.__p?.[1],
          }))
          .filter((m: any) => m.code);
        return successResponse({ methods });
      }

      case "invoice": {
        if (!id) return errorResponse("Invoice id required", 400);
        await requirePermissions(["VIEW_INVOICE"]);
        const invoiceId = parseInt(String(id), 10);
        if (!Number.isFinite(invoiceId)) return errorResponse("Invalid invoice id", 400);

        const invRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.acqinv", [
          authtoken,
          invoiceId,
        ]);
        const invoice = invRes?.payload?.[0];
        if (!invoice || invoice.ilsevent) return notFoundResponse("Invoice not found");

        const entriesRes = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.acqie.atomic",
          [authtoken, { invoice: invoiceId }, { order_by: { acqie: "id" }, limit: 500 }]
        );
        const entries = entriesRes?.payload?.[0] || [];

        const entryIds: number[] = Array.isArray(entries)
          ? entries
              .map((e) => (typeof e?.id === "number" ? e.id : parseInt(String(e?.id ?? ""), 10)))
              .filter((n: number) => Number.isFinite(n))
          : [];

        const fundDebits =
          entryIds.length > 0
            ? await query<{
                id: number;
                invoice_entry: number;
                fund: number;
                fund_name: string;
                fund_code: string;
                currency_type: string;
                amount: string;
                debit_type: string;
                encumbrance: boolean;
                create_time: string;
              }>(
                `
                  select
                    fd.id,
                    fd.invoice_entry,
                    fd.fund,
                    f.name as fund_name,
                    f.code as fund_code,
                    f.currency_type,
                    fd.amount::text as amount,
                    fd.debit_type,
                    fd.encumbrance,
                    fd.create_time
                  from acq.fund_debit fd
                  join acq.fund f on f.id = fd.fund
                  where fd.invoice_entry = any($1::int[])
                  order by fd.invoice_entry, fd.id
                `,
                [entryIds]
              )
            : [];

        return successResponse({
          invoice: {
            id: invoice.id,
            inv_ident: invoice.inv_ident || invoice.vendor_invoice_id || null,
            provider:
              typeof invoice.provider === "object" ? invoice.provider?.id : invoice.provider,
            receiver:
              typeof invoice.receiver === "object" ? invoice.receiver?.id : invoice.receiver,
            recv_date: invoice.recv_date,
            recv_method:
              typeof invoice.recv_method === "object"
                ? invoice.recv_method?.code
                : invoice.recv_method,
            close_date: invoice.close_date,
            closed_by:
              typeof invoice.closed_by === "object" ? invoice.closed_by?.id : invoice.closed_by,
          },
          entries: Array.isArray(entries)
            ? entries.map((e) => ({
                id: e.id,
                purchase_order:
                  typeof e.purchase_order === "object" ? e.purchase_order?.id : e.purchase_order,
                lineitem: typeof e.lineitem === "object" ? e.lineitem?.id : e.lineitem,
                inv_item_count: e.inv_item_count,
                cost_billed: e.cost_billed,
                note: e.note || null,
              }))
            : [],
          fundDebits,
        });
      }

      case "po": {
        // Get specific PO with lineitems
        if (!id) {
          return errorResponse("PO id required", 400);
        }

        const poId = parseInt(id, 10);
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.purchase_order.retrieve", [
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
        ]);

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
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Acquisitions GET", req);
  }
}

// GET - Fetch acquisitions data (legacy multiplexer)
export async function GET(req: NextRequest) {
  return handleAcquisitionsGet(req);
}
