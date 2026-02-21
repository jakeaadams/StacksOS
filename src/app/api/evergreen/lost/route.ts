import { NextRequest } from "next/server";
import {

  callOpenSRF,
  requireAuthToken,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  isSuccessResult,
  getErrorMessage,
  getCopyByBarcode,
  getPatronById,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { withIdempotency } from "@/lib/idempotency";
import { z } from "zod";


const ACTION_PERMS: Record<string, string[]> = {
  mark_lost: ["MARK_ITEM_LOST"],
  mark_missing: ["MARK_ITEM_MISSING"],
  mark_damaged: ["MARK_ITEM_DAMAGED"],
  checkin_lost: ["COPY_CHECKIN"],
  void_bill: ["VOID_BILLING"],
  adjust_bill: ["ADJUST_BILLING"],
  process_refund: ["PROCESS_REFUND"],
};

const resolvePerms = (action?: string) => ACTION_PERMS[action || ""] || ["STAFF_LOGIN"];

// GET - Get patron's lost/missing/damaged items or item status
const lostPostSchema = z.object({
  action: z.enum(["mark_lost", "mark_missing", "mark_damaged", "checkin_lost"]),
  circId: z.coerce.number().int().positive().optional(),
  copyBarcode: z.string().trim().optional(),
  copyId: z.coerce.number().int().positive().optional(),
  billAmount: z.union([z.number(), z.string()]).optional(),
  billNote: z.string().max(2048).optional(),
}).passthrough();

const lostPutSchema = z.object({
  action: z.enum(["void_bill", "adjust_bill", "process_refund"]),
  billId: z.coerce.number().int().positive().optional(),
  circId: z.coerce.number().int().positive().optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  note: z.string().max(2048).optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();

    const searchParams = req.nextUrl.searchParams;
    const patronId = searchParams.get("patron_id");
    const itemBarcode = searchParams.get("item_barcode");
    const circId = searchParams.get("circ_id");

    if (patronId) {
      // Get patron's checkouts to find lost items
      const checkoutsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.actor.user.checked_out",
        [authtoken, parseInt(patronId)]
      );

      const checkouts = checkoutsResponse?.payload?.[0] as any;
      const lostCircs = checkouts?.lost || [];

      // Get patron's bills related to lost items
      const billsResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.transactions.have_balance",
        [authtoken, parseInt(patronId)]
      );

      const allBills = billsResponse?.payload?.[0] as any || [];
      const lostBills = allBills.filter((bill: any) =>
        bill.billing_type?.toLowerCase().includes("lost") ||
        bill.billing_type?.toLowerCase().includes("replacement")
      );

      const patron = await getPatronById(authtoken, parseInt(patronId));

      return successResponse({
        patron: {
          id: patron?.id,
          barcode: patron?.card?.barcode,
          displayName: `${patron?.family_name}, ${patron?.first_given_name}`,
        },
        lostItems: lostCircs,
        lostBills: lostBills,
        summary: {
          totalLostItems: lostCircs.length,
          totalOwed: lostBills.reduce((sum: number, b: any) => sum + parseFloat(b.balance_owed || 0), 0),
        },
      });
    }

    if (itemBarcode) {
      const copy = await getCopyByBarcode(itemBarcode);

      if (!copy || copy.ilsevent) {
        return notFoundResponse("Item not found");
      }

      let currentCirc = null;
      if (copy.circulations && copy.circulations.length > 0) {
        currentCirc = copy.circulations[0];
      }

      const statusMap: Record<number, string> = {
        0: "Available",
        1: "Checked out",
        3: "Lost",
        4: "Missing",
        5: "In process",
        6: "In transit",
        7: "Reshelving",
        8: "On holds shelf",
        14: "Damaged",
      };

      return successResponse({
        item: {
          id: copy.id,
          barcode: copy.barcode,
          status: copy.status,
          statusLabel: statusMap[copy.status] || `Status ${copy.status}`,
          callNumber: copy.call_number?.label,
          title: copy.call_number?.record?.simple_record?.title,
          price: copy.price,
          isLost: copy.status === 3,
          isMissing: copy.status === 4,
          isDamaged: copy.status === 14,
          currentCirc: currentCirc
            ? {
                id: currentCirc.id,
                patronId: currentCirc.usr,
                dueDate: currentCirc.due_date,
                checkoutDate: currentCirc.xact_start,
              }
            : null,
        },
      });
    }

    if (circId) {
      const circResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.retrieve",
        [authtoken, parseInt(circId)]
      );

      const circ = circResponse?.payload?.[0] as any;

      if (!circ || circ.ilsevent) {
        return notFoundResponse("Circulation not found");
      }

      const billsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.money.billing.retrieve.all",
        [authtoken, parseInt(circId)]
      );

      const bills = billsResponse?.payload?.[0] as any || [];

      return successResponse({
        circulation: circ,
        bills: bills,
      });
    }

    return errorResponse("patron_id, item_barcode, or circ_id required", 400);
  } catch (error: any) {
    return serverErrorResponse(error, "Lost API GET", req);
  }
}

// POST - Mark item as Lost, Missing, or Damaged
export async function POST(req: NextRequest) {
  return withIdempotency(req, "api.evergreen.lost.POST", async () => {
    const { ip, userAgent, requestId } = getRequestMeta(req);
    try {
    const body = lostPostSchema.parse(await req.json());
    const { action, circId, copyBarcode, copyId } = body as Record<string, any>;
    const { authtoken, actor } = await requirePermissions(resolvePerms(action));

    const audit = async (
      status: "success" | "failure",
      details?: Record<string, any>,
      error?: string
    ) =>
      logAuditEvent({
        action: `lost.${action || "unknown"}`,
        status,
        actor,
        ip,
        userAgent,
        requestId,
        details,
        error: error || null,
      });

    logger.info({ requestId, route: "api.evergreen.lost", action, circId }, "Lost action");

    if (action === "mark_lost") {
      if (!circId) {
        return errorResponse("circId required for mark_lost", 400);
      }

      const lostResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.circulation.set_lost",
        [authtoken, { circ_id: parseInt(circId) }]
      );

      const result = lostResponse?.payload?.[0] as any;

      if (isSuccessResult(result)) {
        const billsResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.money.billing.retrieve.all",
          [authtoken, parseInt(circId)]
        );

        const bills = billsResponse?.payload?.[0] as any || [];
        const lostBills = bills.filter((b: any) =>
            b.billing_type?.toLowerCase().includes("lost") ||
            b.billing_type?.toLowerCase().includes("replacement") ||
            b.billing_type?.toLowerCase().includes("processing")
        );

        await audit("success", { circId });
        return successResponse(
          {
            action: "mark_lost",
            bills: lostBills,
            totalBilled: lostBills.reduce((sum: number, b: any) => sum + parseFloat(b.amount || 0), 0),
          },
          "Item marked as Lost. Replacement and processing fees have been applied."
        );
      } else {
        const message = getErrorMessage(result, "Failed to mark item as lost");
        await audit("failure", { circId }, message);
        return errorResponse(message, 400, result);
      }
    }

    if (action === "mark_missing") {
      if (!copyBarcode && !copyId) {
        return errorResponse("copyBarcode or copyId required", 400);
      }

      let targetCopyId = copyId;

      if (!targetCopyId && copyBarcode) {
        const copy = await getCopyByBarcode(copyBarcode);
        if (!copy || copy.ilsevent) {
          return notFoundResponse("Item not found");
        }
        targetCopyId = copy.id;
      }

      const missingResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.mark_item_missing",
        [authtoken, parseInt(targetCopyId)]
      );

      const result = missingResponse?.payload?.[0] as any;

      if (isSuccessResult(result)) {
        await audit("success", { copyId: targetCopyId, copyBarcode });
        return successResponse(
          {
            action: "mark_missing",
            copyId: targetCopyId,
          },
          "Item marked as Missing"
        );
      } else {
        const message = getErrorMessage(result, "Failed to mark item as missing");
        await audit("failure", { copyId: targetCopyId, copyBarcode }, message);
        return errorResponse(message, 400, result);
      }
    }

    if (action === "mark_damaged") {
      const { billAmount, billNote } = body as Record<string, any>;

      if (!copyBarcode && !copyId) {
        return errorResponse("copyBarcode or copyId required", 400);
      }

      let targetCopyId = copyId;

      if (!targetCopyId && copyBarcode) {
        const copy = await getCopyByBarcode(copyBarcode);
        if (!copy || copy.ilsevent) {
          return notFoundResponse("Item not found");
        }
        targetCopyId = copy.id;
      }

      const args: Record<string, any> = {
        apply_fines: billAmount ? "apply" : "noapply",
      };

      if (billAmount && billAmount > 0) {
        args.override_amount = parseFloat(billAmount);
      }

      if (billNote) {
        args.override_note = billNote;
      }

      const damagedResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.mark_item_damaged",
        [authtoken, parseInt(targetCopyId), args]
      );

      const result = damagedResponse?.payload?.[0] as any;

      if (isSuccessResult(result)) {
        await audit("success", { copyId: targetCopyId, copyBarcode, billAmount, billNote });
        return successResponse(
          {
            action: "mark_damaged",
            copyId: targetCopyId,
            billed: billAmount || 0,
          },
          billAmount ? `Item marked as Damaged. Billed $${billAmount}` : "Item marked as Damaged"
        );
      } else {
        const message = getErrorMessage(result, "Failed to mark item as damaged");
        await audit("failure", { copyId: targetCopyId, copyBarcode, billAmount }, message);
        return errorResponse(message, 400, result);
      }
    }

    if (action === "checkin_lost") {
      if (!copyBarcode) {
        return errorResponse("copyBarcode required", 400);
      }

      const checkinResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.checkin", [
        authtoken,
        {
          copy_barcode: copyBarcode,
          void_overdues: body.voidOverdues || false,
        },
      ]);

      const result = checkinResponse?.payload?.[0] as any;
      const isLostCheckin = result?.ilsevent === 0 && result?.payload?.circ?.stop_fines === "LOST";

      if (isSuccessResult(result) || result?.payload) {
        await audit("success", { copyBarcode, isLostCheckin });
        return successResponse(
          {
            action: "checkin_lost",
            isLostCheckin,
            result: result?.payload,
          },
          "Lost item checked in. Check patron account for refund processing."
        );
      } else {
        const message = getErrorMessage(result, "Failed to check in lost item");
        await audit("failure", { copyBarcode }, message);
        return errorResponse(message, 400, result);
      }
    }

    await audit("failure", { action }, "Invalid action");
    return errorResponse("Invalid action", 400);
    } catch (error: any) {
      return serverErrorResponse(error, "Lost API POST", req);
    }
  });
}

// PUT - Manage bills (void, adjust, refund)
export async function PUT(req: NextRequest) {
  return withIdempotency(req, "api.evergreen.lost.PUT", async () => {
    const { ip, userAgent, requestId } = getRequestMeta(req);
    try {
    const body = lostPutSchema.parse(await req.json());
    const { action, billId, circId, amount, note } = body as Record<string, any>;
    const { authtoken, actor } = await requirePermissions(resolvePerms(action));

    const audit = async (
      status: "success" | "failure",
      details?: Record<string, any>,
      error?: string
    ) =>
      logAuditEvent({
        action: `lost.${action || "unknown"}`,
        status,
        actor,
        ip,
        userAgent,
        requestId,
        details,
        error: error || null,
      });

    if (action === "void_bill") {
      if (!billId) {
        return errorResponse("billId required", 400);
      }

      const voidResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.money.billing.void", [
        authtoken,
        [parseInt(billId)],
        note || "Voided by staff",
      ]);

      const result = voidResponse?.payload?.[0] as any;

      if (isSuccessResult(result)) {
        await audit("success", { billId, note });
        return successResponse(
          {
            action: "void_bill",
            billId,
          },
          "Bill voided successfully"
        );
      } else {
        const message = getErrorMessage(result, "Failed to void bill");
        await audit("failure", { billId, note }, message);
        return errorResponse(message, 400, result);
      }
    }

    if (action === "adjust_bill") {
      if (!billId || amount === undefined) {
        return errorResponse("billId and amount required", 400);
      }

      const adjustResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.money.billing.update", [
        authtoken,
        { id: parseInt(billId), amount: parseFloat(amount) },
      ]);

      const result = adjustResponse?.payload?.[0] as any;

      if (isSuccessResult(result)) {
        await audit("success", { billId, amount });
        return successResponse(
          {
            action: "adjust_bill",
            billId,
            newAmount: amount,
          },
          `Bill adjusted to $${amount}`
        );
      } else {
        const message = getErrorMessage(result, "Failed to adjust bill");
        await audit("failure", { billId, amount }, message);
        return errorResponse(message, 400, result);
      }
    }

    if (action === "process_refund") {
      if (!circId) {
        return errorResponse("circId required", 400);
      }

      const paymentsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.money.payment.retrieve.all",
        [authtoken, parseInt(circId)]
      );

      const payments = paymentsResponse?.payload?.[0] as any || [];
      const totalPaid = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0);

      if (totalPaid <= 0) {
        await audit("success", { circId, refundAmount: 0, totalPaid });
        return successResponse(
          {
            action: "process_refund",
            refundAmount: 0,
          },
          "No payments to refund"
        );
      }

      const refundAmount = body.refundAmount || totalPaid;

      const creditResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.money.payment", [
        authtoken,
        {
          payment_type: "credit",
          userid: body.patronId,
          note: note || "Refund for returned lost item",
          payments: [{ amount: -refundAmount, xact: parseInt(circId) }],
        },
      ]);

      const result = creditResponse?.payload?.[0] as any;

      if (isSuccessResult(result)) {
        await audit("success", { circId, refundAmount, totalPaid });
        return successResponse(
          {
            action: "process_refund",
            refundAmount,
          },
          `Refund of $${refundAmount} processed`
        );
      } else {
        const message = getErrorMessage(result, "Failed to process refund");
        await audit("failure", { circId, refundAmount }, message);
        return errorResponse(message, 400, result);
      }
    }

    await audit("failure", { action }, "Invalid action");
    return errorResponse("Invalid action", 400);
    } catch (error: any) {
      return serverErrorResponse(error, "Lost API PUT", req);
    }
  });
}
