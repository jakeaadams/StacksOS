import { NextRequest } from "next/server";
import { z } from "zod";
import {
  callOpenSRF,
  callPcrud,
  encodeFieldmapper,
  getCopyByBarcode,
  getErrorMessage,
  getRequestMeta,
  isOpenSRFEvent,
  isSuccessResult,
  notFoundResponse,
  parseJsonBodyWithSchema,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { query } from "@/lib/db/evergreen";
import { requirePermissions } from "@/lib/permissions";
import { ACQUISITIONS_PERMS, CIRCULATION_PERMS } from "@/lib/permissions-map";
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

// GET - Fetch acquisitions data
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action");
  const id = searchParams.get("id");

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
        const receiverOrgId =
          parsePositiveIntId((_actor as any)?.ws_ou ?? (_actor as any)?.home_ou) ?? 1;
        let response: any | null = null;

        try {
          response = await callOpenSRF(
            "open-ils.cstore",
            "open-ils.cstore.direct.acqinv.search.atomic",
            [authtoken, { receiver: receiverOrgId }, { limit: 200, order_by: { acqinv: "recv_date DESC" } }]
          );
        } catch (_error) {
          try {
            response = await callOpenSRF(
              "open-ils.cstore",
              "open-ils.cstore.direct.acqinv.search",
              [authtoken, { receiver: receiverOrgId }, { limit: 200, order_by: { acqinv: "recv_date DESC" } }]
            );
          } catch (_error2) {
            // Some Evergreen installs do not expose cstore direct methods for acquisitions.
            // Fall back to pcrud search before treating this as "not available".
            try {
                response = await callPcrud(
                  "open-ils.pcrud.search.acqinv",
                  [authtoken, { receiver: receiverOrgId }, { limit: 200, order_by: { acqinv: "recv_date DESC" } }]
                );
              } catch (err) {
              const code = err && typeof err === "object" ? (err as any).code : undefined;
              if (code === "OSRF_METHOD_NOT_FOUND") {
                logger.info({ route: "api.evergreen.acquisitions", action }, "Invoices lookup not supported on this Evergreen install");
              } else {
                logger.warn({ route: "api.evergreen.acquisitions", action, err: String(err) }, "Invoices lookup failed");
              }
              return successResponse({
                invoices: [],
                message: "Invoices not available in this Evergreen configuration",
              });
            }
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

      case "invoice_methods": {
        // Receive methods for invoices (acq.im)
        await requirePermissions(["CREATE_INVOICE"]);
        const response = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.acqim.atomic",
          [authtoken, { code: { "!=": null } }, { order_by: { acqim: "name" }, limit: 100 }]
        );
        const methods = (response?.payload?.[0] || []).map((m: any) => ({
          code: m?.code ?? m?.__p?.[0],
          name: m?.name ?? m?.__p?.[1],
        })).filter((m: any) => m.code);
        return successResponse({ methods });
      }

      case "invoice": {
        if (!id) return errorResponse("Invoice id required", 400);
        await requirePermissions(["VIEW_INVOICE"]);
        const invoiceId = parseInt(String(id), 10);
        if (!Number.isFinite(invoiceId)) return errorResponse("Invalid invoice id", 400);

        const invRes = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.retrieve.acqinv",
          [authtoken, invoiceId]
        );
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
              .map((e: any) => (typeof e?.id === "number" ? e.id : parseInt(String(e?.id ?? ""), 10)))
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
            provider: typeof invoice.provider === "object" ? invoice.provider?.id : invoice.provider,
            receiver: typeof invoice.receiver === "object" ? invoice.receiver?.id : invoice.receiver,
            recv_date: invoice.recv_date,
            recv_method: typeof invoice.recv_method === "object" ? invoice.recv_method?.code : invoice.recv_method,
            close_date: invoice.close_date,
            closed_by: typeof invoice.closed_by === "object" ? invoice.closed_by?.id : invoice.closed_by,
          },
          entries: Array.isArray(entries)
            ? entries.map((e: any) => ({
                id: e.id,
                purchase_order: typeof e.purchase_order === "object" ? e.purchase_order?.id : e.purchase_order,
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
    const body = await parseJsonBodyWithSchema(req, z.object({ action: z.string().trim().min(1) }).passthrough());
    if (body instanceof Response) return body as any;
    const action = (body as any).action as string;
    const { ip, userAgent, requestId } = getRequestMeta(req);

    logger.debug({ route: "api.evergreen.acquisitions", action }, "Acquisitions POST");

    switch (action) {
      case "create_po": {
        const { authtoken, actor } = await requirePermissions([...ACQUISITIONS_PERMS.create_po]);
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
        if (!result || isOpenSRFEvent(result) || result.ilsevent) {
          const message = getErrorMessage(result, "Failed to create PO");
          await logAuditEvent({
            action: "acq.po.create",
            entity: "acqpo",
            status: "failure",
            actor,
            orgId: orderingAgency,
            ip,
            userAgent,
            requestId,
            error: message,
            details: { provider, orderingAgency, name: body.name || null },
          });
          return errorResponse(message, 400, result);
        }

        await logAuditEvent({
          action: "acq.po.create",
          entity: "acqpo",
          entityId: result?.id,
          status: "success",
          actor,
          orgId: orderingAgency,
          ip,
          userAgent,
          requestId,
          details: { provider, orderingAgency, name: body.name || null },
        });

        return successResponse({ po: result });
      }

      case "create_invoice": {
        const { authtoken, actor } = await requirePermissions(["CREATE_INVOICE"]);
        const providerId = parseInt(String(body.providerId ?? body.provider ?? ""), 10);
        const receiver = parseInt(String(body.receiver ?? actor?.ws_ou ?? actor?.home_ou ?? ""), 10);
        const recvMethod = String(body.recvMethod ?? body.recv_method ?? "").trim();
        const invIdent = String(body.invIdent ?? body.inv_ident ?? body.vendor_invoice_id ?? "").trim();

        if (!Number.isFinite(providerId)) return errorResponse("providerId required", 400);
        if (!Number.isFinite(receiver)) return errorResponse("receiver required", 400);
        if (!recvMethod) return errorResponse("recvMethod required", 400);
        if (!invIdent) return errorResponse("invIdent required", 400);

        const payload: any = encodeFieldmapper("acqinv", {
          receiver,
          provider: providerId,
          shipper: providerId,
          recv_date: new Date().toISOString(),
          recv_method: recvMethod,
          inv_ident: invIdent,
          note: body.note ? String(body.note).trim() : undefined,
          isnew: 1,
          ischanged: 1,
        });

        const res = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acqinv", [authtoken, payload]);
        const result = res?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || (result as any).ilsevent) {
          const msg = getErrorMessage(result, "Failed to create invoice");
          await logAuditEvent({ action: "acq.invoice.create", entity: "acqinv", status: "failure", actor, ip, userAgent, requestId, error: msg, details: { providerId, receiver, recvMethod, invIdent } });
          return errorResponse(msg, 400, result);
        }

        await logAuditEvent({
          action: "acq.invoice.create",
          entity: "acqinv",
          entityId: typeof result === "number" ? result : (result as any)?.id,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: { providerId, receiver, recvMethod, invIdent },
        });

        return successResponse({ invoiceId: typeof result === "number" ? result : (result as any)?.id, invoice: result });
      }

      case "add_invoice_entry": {
        const { authtoken, actor } = await requirePermissions(["ADMIN_INVOICE"]);
        const invoiceId = parseInt(String(body.invoiceId ?? body.invoice ?? ""), 10);
        const purchaseOrderId = body.purchaseOrderId !== undefined ? parseInt(String(body.purchaseOrderId), 10) : null;
        const lineitemId = body.lineitemId !== undefined ? parseInt(String(body.lineitemId), 10) : null;
        const invItemCount = parseInt(String(body.invItemCount ?? body.inv_item_count ?? "1"), 10);
        let costBilled = body.costBilled !== undefined ? String(body.costBilled) : undefined;
        const note = body.note ? String(body.note).trim() : undefined;

        if (!Number.isFinite(invoiceId)) return errorResponse("invoiceId required", 400);
        if (!Number.isFinite(invItemCount) || invItemCount <= 0) return errorResponse("invItemCount must be > 0", 400);

        const rawSplits = body.splits ?? body.fundSplits ?? null;
        const splits: Array<{ fundId: number; amount: number }> = [];
        if (rawSplits !== null && rawSplits !== undefined) {
          if (!Array.isArray(rawSplits)) return errorResponse("splits must be an array", 400);
          for (const s of rawSplits) {
            const fundId = parseInt(String((s as any)?.fundId ?? (s as any)?.fund_id ?? ""), 10);
            const amount = parseFloat(String((s as any)?.amount ?? ""));
            if (!Number.isFinite(fundId) || fundId <= 0) return errorResponse("Invalid fundId in splits", 400);
            if (!Number.isFinite(amount) || amount <= 0) return errorResponse("Invalid amount in splits", 400);
            splits.push({ fundId, amount: Math.round(amount * 100) / 100 });
          }
          const seen = new Set<number>();
          for (const s of splits) {
            if (seen.has(s.fundId)) return errorResponse("Duplicate fundId in splits", 400);
            seen.add(s.fundId);
          }
          const sum = Math.round(splits.reduce((a, s) => a + s.amount, 0) * 100) / 100;
          if (!costBilled || !String(costBilled).trim()) {
            costBilled = sum.toFixed(2);
          } else {
            const cb = Math.round(parseFloat(String(costBilled)) * 100) / 100;
            if (!Number.isFinite(cb)) return errorResponse("Invalid costBilled", 400);
            if (Math.abs(cb - sum) > 0.01) return errorResponse("Fund splits must sum to costBilled", 400);
            costBilled = cb.toFixed(2);
          }
        }

        if (splits.length > 0) {
          // Creating fund debits requires fund admin perms.
          await requirePermissions(["ADMIN_ACQ_FUND"]);
        }

        const payload: any = encodeFieldmapper("acqie", {
          invoice: invoiceId,
          purchase_order: Number.isFinite(purchaseOrderId as any) ? purchaseOrderId : undefined,
          lineitem: Number.isFinite(lineitemId as any) ? lineitemId : undefined,
          inv_item_count: invItemCount,
          cost_billed: costBilled,
          note,
          billed_per_item: "t",
          isnew: 1,
          ischanged: 1,
        });

        const res = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acqie", [authtoken, payload]);
        const result = res?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || (result as any).ilsevent) {
          const msg = getErrorMessage(result, "Failed to add invoice entry");
          await logAuditEvent({ action: "acq.invoice_entry.create", entity: "acqie", status: "failure", actor, ip, userAgent, requestId, error: msg, details: { invoiceId, purchaseOrderId, lineitemId, invItemCount } });
          return errorResponse(msg, 400, result);
        }

        const entryId = typeof result === "number" ? result : (result as any)?.id;

        const createdFundDebitIds: number[] = [];
        if (splits.length > 0) {
          try {
            const fundRows = await query<{ id: number; currency_type: string }>(
              `select id, currency_type from acq.fund where id = any($1::int[])`,
              [splits.map((s) => s.fundId)]
            );
            const fundCurrency = new Map<number, string>();
            for (const f of fundRows) fundCurrency.set(f.id, String(f.currency_type || "USD"));

            for (const s of splits) {
              const currency = fundCurrency.get(s.fundId) || "USD";
              const fdPayload: any = encodeFieldmapper("acqfdeb", {
                fund: s.fundId,
                origin_amount: s.amount.toFixed(2),
                origin_currency_type: currency,
                amount: s.amount.toFixed(2),
                encumbrance: "f",
                debit_type: "invoice",
                invoice_entry: entryId,
                isnew: 1,
                ischanged: 1,
              });
              const fdRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acqfdeb", [authtoken, fdPayload]);
              const fdResult = fdRes?.payload?.[0];
              if (!fdResult || isOpenSRFEvent(fdResult) || (fdResult as any).ilsevent) {
                throw new Error(getErrorMessage(fdResult, "Failed to create fund debit"));
              }
              const fdId = typeof fdResult === "number" ? fdResult : (fdResult as any)?.id;
              if (Number.isFinite(fdId)) createdFundDebitIds.push(fdId);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Best-effort rollback of newly created debits and the invoice entry.
            for (const fdId of createdFundDebitIds) {
              try {
                await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.acqfdeb", [authtoken, fdId]);
              } catch {
                // ignore
              }
            }
            try {
              if (entryId) await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.acqie", [authtoken, entryId]);
            } catch {
              // ignore
            }
            await logAuditEvent({
              action: "acq.invoice_entry.create",
              entity: "acqie",
              entityId: entryId,
              status: "failure",
              actor,
              ip,
              userAgent,
              requestId,
              error: msg,
              details: { invoiceId, purchaseOrderId, lineitemId, invItemCount, splits },
            });
            return errorResponse(msg, 400);
          }
        }

        await logAuditEvent({
          action: "acq.invoice_entry.create",
          entity: "acqie",
          entityId: entryId,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: { invoiceId, purchaseOrderId, lineitemId, invItemCount, splits },
        });

        return successResponse({ entryId, entry: result, fundDebitIds: createdFundDebitIds });
      }

      case "set_invoice_entry_splits": {
        const { authtoken, actor } = await requirePermissions(["ADMIN_INVOICE", "ADMIN_ACQ_FUND"]);
        const invoiceEntryId = parseInt(String(body.invoiceEntryId ?? body.invoice_entry_id ?? body.entryId ?? body.entry_id ?? ""), 10);
        if (!Number.isFinite(invoiceEntryId)) return errorResponse("invoiceEntryId required", 400);
        const rawSplits = body.splits ?? body.fundSplits ?? null;
        if (!Array.isArray(rawSplits) || rawSplits.length === 0) return errorResponse("splits array required", 400);

        const splits: Array<{ fundId: number; amount: number }> = [];
        for (const s of rawSplits) {
          const fundId = parseInt(String((s as any)?.fundId ?? (s as any)?.fund_id ?? ""), 10);
          const amount = parseFloat(String((s as any)?.amount ?? ""));
          if (!Number.isFinite(fundId) || fundId <= 0) return errorResponse("Invalid fundId in splits", 400);
          if (!Number.isFinite(amount) || amount <= 0) return errorResponse("Invalid amount in splits", 400);
          splits.push({ fundId, amount: Math.round(amount * 100) / 100 });
        }

        const seen = new Set<number>();
        for (const s of splits) {
          if (seen.has(s.fundId)) return errorResponse("Duplicate fundId in splits", 400);
          seen.add(s.fundId);
        }

        const existing = await query<{ id: number }>(
          `select id from acq.fund_debit where invoice_entry = $1 order by id`,
          [invoiceEntryId]
        );
        for (const row of existing) {
          try {
            await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.delete.acqfdeb", [authtoken, row.id]);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await logAuditEvent({
              action: "acq.invoice_entry.splits.set",
              entity: "acqie",
              entityId: invoiceEntryId,
              status: "failure",
              actor,
              ip,
              userAgent,
              requestId,
              error: msg,
              details: { invoiceEntryId, step: "delete_existing", fundDebitId: row.id },
            });
            return errorResponse("Failed to delete existing fund splits", 500);
          }
        }

        const fundRows = await query<{ id: number; currency_type: string }>(
          `select id, currency_type from acq.fund where id = any($1::int[])`,
          [splits.map((s) => s.fundId)]
        );
        const fundCurrency = new Map<number, string>();
        for (const f of fundRows) fundCurrency.set(f.id, String(f.currency_type || "USD"));

        const createdFundDebitIds: number[] = [];
        for (const s of splits) {
          const currency = fundCurrency.get(s.fundId) || "USD";
          const fdPayload: any = encodeFieldmapper("acqfdeb", {
            fund: s.fundId,
            origin_amount: s.amount.toFixed(2),
            origin_currency_type: currency,
            amount: s.amount.toFixed(2),
            encumbrance: "f",
            debit_type: "invoice",
            invoice_entry: invoiceEntryId,
            isnew: 1,
            ischanged: 1,
          });
          const fdRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acqfdeb", [authtoken, fdPayload]);
          const fdResult = fdRes?.payload?.[0];
          if (!fdResult || isOpenSRFEvent(fdResult) || (fdResult as any).ilsevent) {
            const msg = getErrorMessage(fdResult, "Failed to create fund debit");
            await logAuditEvent({
              action: "acq.invoice_entry.splits.set",
              entity: "acqie",
              entityId: invoiceEntryId,
              status: "failure",
              actor,
              ip,
              userAgent,
              requestId,
              error: msg,
              details: { invoiceEntryId, step: "create", splits },
            });
            return errorResponse(msg, 400, fdResult);
          }
          const fdId = typeof fdResult === "number" ? fdResult : (fdResult as any)?.id;
          if (Number.isFinite(fdId)) createdFundDebitIds.push(fdId);
        }

        await logAuditEvent({
          action: "acq.invoice_entry.splits.set",
          entity: "acqie",
          entityId: invoiceEntryId,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: { invoiceEntryId, splits, createdFundDebitIds },
        });

        return successResponse({ updated: true, invoiceEntryId, fundDebitIds: createdFundDebitIds });
      }

      case "close_invoice": {
        const { authtoken, actor } = await requirePermissions(["CREATE_INVOICE"]);
        const invoiceId = parseInt(String(body.invoiceId ?? body.invoice ?? ""), 10);
        if (!Number.isFinite(invoiceId)) return errorResponse("invoiceId required", 400);

        const invRes = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.acqinv", [authtoken, invoiceId]);
        const existing = invRes?.payload?.[0];
        if (!existing || (existing as any).ilsevent) return notFoundResponse("Invoice not found");

        const updatePayload: any = encodeFieldmapper("acqinv", {
          ...(existing as any),
          close_date: new Date().toISOString(),
          closed_by: actor?.id,
          ischanged: 1,
        });

        const res = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.acqinv", [
          authtoken,
          updatePayload,
        ]);
        const result = res?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || (result as any).ilsevent) {
          const msg = getErrorMessage(result, "Failed to close invoice");
          await logAuditEvent({ action: "acq.invoice.close", entity: "acqinv", entityId: invoiceId, status: "failure", actor, ip, userAgent, requestId, error: msg });
          return errorResponse(msg, 400, result);
        }

        await logAuditEvent({ action: "acq.invoice.close", entity: "acqinv", entityId: invoiceId, status: "success", actor, ip, userAgent, requestId });
        return successResponse({ closed: true, invoiceId });
      }

      case "receive_lineitem": {
        const { authtoken, actor } = await requirePermissions([...ACQUISITIONS_PERMS.receive_lineitem]);
        const lineitemId = parsePositiveIntId(body.lineitemId);
        if (!lineitemId) {
          return errorResponse("Lineitem ID required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.lineitem.receive.batch",
          [authtoken, [lineitemId]]
        );

        const result = response?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || result.ilsevent) {
          const message = getErrorMessage(result, "Failed to receive line item");
          await logAuditEvent({
            action: "acq.lineitem.receive",
            entity: "acqli",
            entityId: lineitemId,
            status: "failure",
            actor,
            ip,
            userAgent,
            requestId,
            error: message,
          });
          return errorResponse(message, 400, result);
        }

        await logAuditEvent({
          action: "acq.lineitem.receive",
          entity: "acqli",
          entityId: lineitemId,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
        });

        return successResponse({ received: true, lineitemId });
      }

      case "receive_lineitem_detail": {
        const { authtoken, actor } = await requirePermissions([...ACQUISITIONS_PERMS.receive_lineitem]);
        const detailId = parsePositiveIntId(body.detailId ?? body.lineitemDetailId ?? body.lineitem_detail_id);
        if (!detailId) {
          return errorResponse("Detail ID required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.lineitem_detail.receive",
          [authtoken, detailId]
        );

        const result = response?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || result.ilsevent) {
          const message = getErrorMessage(result, "Failed to receive copy");
          await logAuditEvent({
            action: "acq.lineitem_detail.receive",
            entity: "acqlid",
            entityId: detailId,
            status: "failure",
            actor,
            ip,
            userAgent,
            requestId,
            error: message,
          });
          return errorResponse(message, 400, result);
        }

        await logAuditEvent({
          action: "acq.lineitem_detail.receive",
          entity: "acqlid",
          entityId: detailId,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
        });

        return successResponse({ received: true, detailId });
      }

      case "unreceive_lineitem_detail": {
        const { authtoken, actor } = await requirePermissions([...ACQUISITIONS_PERMS.receive_lineitem]);
        const detailId = parsePositiveIntId(body.detailId ?? body.lineitemDetailId ?? body.lineitem_detail_id);
        if (!detailId) {
          return errorResponse("Detail ID required", 400);
        }

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.lineitem_detail.receive.rollback",
          [authtoken, detailId]
        );

        const result = response?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || result.ilsevent) {
          const message = getErrorMessage(result, "Failed to unreceive copy");
          await logAuditEvent({
            action: "acq.lineitem_detail.unreceive",
            entity: "acqlid",
            entityId: detailId,
            status: "failure",
            actor,
            ip,
            userAgent,
            requestId,
            error: message,
          });
          return errorResponse(message, 400, result);
        }

        await logAuditEvent({
          action: "acq.lineitem_detail.unreceive",
          entity: "acqlid",
          entityId: detailId,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
        });

        return successResponse({ unreceived: true, detailId });
      }

      case "cancel_lineitem": {
        const { authtoken, actor } = await requirePermissions([...ACQUISITIONS_PERMS.cancel_lineitem]);
        const lineitemId = parsePositiveIntId(body.lineitemId);
        const { reason } = body;
        if (!lineitemId) {
          return errorResponse("Lineitem ID required", 400);
        }

        const reasonId =
          typeof reason === "number"
            ? reason
            : Number.isFinite(parseInt(String(reason ?? ""), 10))
              ? parseInt(String(reason), 10)
              : 1;

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.lineitem.cancel",
          [authtoken, lineitemId, reasonId]
        );

        const result = response?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || result.ilsevent) {
          const message = getErrorMessage(result, "Failed to cancel line item");
          await logAuditEvent({
            action: "acq.lineitem.cancel",
            entity: "acqli",
            entityId: lineitemId,
            status: "failure",
            actor,
            ip,
            userAgent,
            requestId,
            error: message,
            details: { reasonId },
          });
          return errorResponse(message, 400, result);
        }

        await logAuditEvent({
          action: "acq.lineitem.cancel",
          entity: "acqli",
          entityId: lineitemId,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: { reasonId },
        });

        return successResponse({ cancelled: true, lineitemId });
      }

      case "claim_lineitem": {
        const { authtoken, actor } = await requirePermissions(["ADMIN_ACQ_CLAIM"]);
        const lineitemId = parsePositiveIntId(body.lineitemId);
        const { claimType } = body;
        if (!lineitemId) {
          return errorResponse("Lineitem ID required", 400);
        }

        const claimTypeId =
          typeof claimType === "number"
            ? claimType
            : Number.isFinite(parseInt(String(claimType ?? ""), 10))
              ? parseInt(String(claimType), 10)
              : 1;

        const response = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.claim.lineitem",
          [authtoken, lineitemId, claimTypeId]
        );

        const result = response?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || result.ilsevent) {
          const message = getErrorMessage(result, "Failed to claim line item");
          await logAuditEvent({
            action: "acq.lineitem.claim",
            entity: "acqli",
            entityId: lineitemId,
            status: "failure",
            actor,
            ip,
            userAgent,
            requestId,
            error: message,
            details: { claimTypeId },
          });
          return errorResponse(message, 400, result);
        }

        await logAuditEvent({
          action: "acq.lineitem.claim",
          entity: "acqli",
          entityId: lineitemId,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: { claimTypeId },
        });

        return successResponse({ claimed: true, lineitemId });
      }

      case "mark_damaged": {
        const { authtoken, actor } = await requirePermissions([...CIRCULATION_PERMS.mark_damaged]);
        const copyBarcode = String(body.copyBarcode || body.barcode || "").trim();
        const billNote = String(body.billNote || body.note || "").trim();
        const billAmountRaw = body.billAmount ?? body.amount;
        const billAmount = Number.isFinite(parseFloat(String(billAmountRaw ?? "")))
          ? parseFloat(String(billAmountRaw))
          : 0;

        if (!copyBarcode) {
          return errorResponse("copyBarcode required", 400);
        }

        const copy = await getCopyByBarcode(copyBarcode);
        if (!copy || isOpenSRFEvent(copy) || (copy as any).ilsevent) {
          return notFoundResponse("Item not found");
        }

        const args: any = {
          apply_fines: billAmount && billAmount > 0 ? "apply" : "noapply",
        };
        if (billAmount && billAmount > 0) args.override_amount = billAmount;
        if (billNote) args.override_note = billNote;

        const response = await callOpenSRF("open-ils.circ", "open-ils.circ.mark_item_damaged", [
          authtoken,
          parseInt(String((copy as any).id), 10),
          args,
        ]);

        const result = response?.payload?.[0];
        if (!isSuccessResult(result)) {
          const message = getErrorMessage(result, "Failed to mark damaged");
          await logAuditEvent({
            action: "acq.copy.mark_damaged",
            entity: "acp",
            entityId: (copy as any).id,
            status: "failure",
            actor,
            ip,
            userAgent,
            requestId,
            error: message,
            details: { copyBarcode, billAmount, billNote: billNote || null },
          });
          return errorResponse(message, 400, result);
        }

        await logAuditEvent({
          action: "acq.copy.mark_damaged",
          entity: "acp",
          entityId: (copy as any).id,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: { copyBarcode, billAmount, billNote: billNote || null },
        });

        return successResponse({ damaged: true, copyBarcode });
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
