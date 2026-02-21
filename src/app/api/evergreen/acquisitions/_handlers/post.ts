import { NextRequest } from "next/server";
import { z } from "zod";
import {
  callOpenSRF,
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

export async function handleAcquisitionsPost(req: NextRequest, actionOverride?: string) {
  try {
    const body = await parseJsonBodyWithSchema(
      req,
      z
        .object({
          action: z.string().trim().min(1).optional(),
        })
        .passthrough()
    );
    if (body instanceof Response) return body;
    const actionRaw = actionOverride || (body as Record<string, unknown>).action;
    const action = String(actionRaw || "").trim();
    if (!action) return errorResponse("Missing action", 400);
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

        const payload = encodeFieldmapper("acqinv", {
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
        if (!result || isOpenSRFEvent(result) || (result as Record<string, unknown>).ilsevent) {
          const msg = getErrorMessage(result, "Failed to create invoice");
          await logAuditEvent({ action: "acq.invoice.create", entity: "acqinv", status: "failure", actor, ip, userAgent, requestId, error: msg, details: { providerId, receiver, recvMethod, invIdent } });
          return errorResponse(msg, 400, result);
        }

        await logAuditEvent({
          action: "acq.invoice.create",
          entity: "acqinv",
          entityId: typeof result === "number" ? result : (result as Record<string, unknown>)?.id as string | number | undefined,
          status: "success",
          actor,
          ip,
          userAgent,
          requestId,
          details: { providerId, receiver, recvMethod, invIdent },
        });

        return successResponse({ invoiceId: typeof result === "number" ? result : (result as Record<string, unknown>)?.id as number | undefined, invoice: result });
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
            const fundId = parseInt(String((s as Record<string, unknown>)?.fundId ?? (s as Record<string, unknown>)?.fund_id ?? ""), 10);
            const amount = parseFloat(String((s as Record<string, unknown>)?.amount ?? ""));
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

        const payload = encodeFieldmapper("acqie", {
          invoice: invoiceId,
          purchase_order: Number.isFinite(purchaseOrderId) ? purchaseOrderId : undefined,
          lineitem: Number.isFinite(lineitemId) ? lineitemId : undefined,
          inv_item_count: invItemCount,
          cost_billed: costBilled,
          note,
          billed_per_item: "t",
          isnew: 1,
          ischanged: 1,
        });

        const res = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.create.acqie", [authtoken, payload]);
        const result = res?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || (result as Record<string, unknown>).ilsevent) {
          const msg = getErrorMessage(result, "Failed to add invoice entry");
          await logAuditEvent({ action: "acq.invoice_entry.create", entity: "acqie", status: "failure", actor, ip, userAgent, requestId, error: msg, details: { invoiceId, purchaseOrderId, lineitemId, invItemCount } });
          return errorResponse(msg, 400, result);
        }

        const entryId = typeof result === "number" ? result : (result as Record<string, unknown>)?.id as number | undefined;

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
              const fdPayload = encodeFieldmapper("acqfdeb", {
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
              if (!fdResult || isOpenSRFEvent(fdResult) || (fdResult as Record<string, unknown>).ilsevent) {
                throw new Error(getErrorMessage(fdResult, "Failed to create fund debit"));
              }
              const fdId = typeof fdResult === "number" ? fdResult : (fdResult as Record<string, unknown>)?.id as number | undefined;
              if (fdId != null && Number.isFinite(fdId)) createdFundDebitIds.push(fdId);
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
              entityId: entryId as string | number | undefined,
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
          entityId: entryId as string | number | undefined,
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
          const fundId = parseInt(String((s as Record<string, unknown>)?.fundId ?? (s as Record<string, unknown>)?.fund_id ?? ""), 10);
          const amount = parseFloat(String((s as Record<string, unknown>)?.amount ?? ""));
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
          const fdPayload = encodeFieldmapper("acqfdeb", {
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
          if (!fdResult || isOpenSRFEvent(fdResult) || (fdResult as Record<string, unknown>).ilsevent) {
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
          const fdId = typeof fdResult === "number" ? fdResult : (fdResult as Record<string, unknown>)?.id as number | undefined;
          if (fdId != null && Number.isFinite(fdId)) createdFundDebitIds.push(fdId);
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
        if (!existing || (existing as Record<string, unknown>).ilsevent) return notFoundResponse("Invoice not found");

        const updatePayload = encodeFieldmapper("acqinv", {
          ...(existing as Record<string, unknown>),
          close_date: new Date().toISOString(),
          closed_by: actor?.id,
          ischanged: 1,
        });

        const res = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.update.acqinv", [
          authtoken,
          updatePayload,
        ]);
        const result = res?.payload?.[0];
        if (!result || isOpenSRFEvent(result) || (result as Record<string, unknown>).ilsevent) {
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
        if (!copy || isOpenSRFEvent(copy) || (copy as Record<string, unknown>).ilsevent) {
          return notFoundResponse("Item not found");
        }

        const args: Record<string, unknown> = {
          apply_fines: billAmount && billAmount > 0 ? "apply" : "noapply",
        };
        if (billAmount && billAmount > 0) args.override_amount = billAmount;
        if (billNote) args.override_note = billNote;

        const response = await callOpenSRF("open-ils.circ", "open-ils.circ.mark_item_damaged", [
          authtoken,
          parseInt(String((copy as Record<string, unknown>).id), 10),
          args,
        ]);

        const result = response?.payload?.[0];
        if (!isSuccessResult(result)) {
          const message = getErrorMessage(result, "Failed to mark damaged");
          await logAuditEvent({
            action: "acq.copy.mark_damaged",
            entity: "acp",
            entityId: (copy as Record<string, unknown>).id as string | number | undefined,
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
          entityId: (copy as Record<string, unknown>).id as string | number | undefined,
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
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Acquisitions POST", req);
  }
}

// POST - Create/modify acquisitions data (legacy multiplexer)
export async function POST(req: NextRequest) {
  return handleAcquisitionsPost(req);
}
