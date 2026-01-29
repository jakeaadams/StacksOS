import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

// GET /api/opac/fines - Get patron fines/fees
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;
    const patronId = cookieStore.get("patron_id")?.value;

    if (!patronToken || !patronId) {
      return errorResponse("Not authenticated", 401);
    }

    // Get transactions with balance
    const finesResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.transactions.have_balance.fleshed",
      [patronToken, parseInt(patronId)]
    );

    const transactions = finesResponse.payload?.[0] || [];

    // Format fines for display
    const fines = await Promise.all(
      transactions.map(async (txn: any) => {
        let itemInfo = null;

        // If this is a circulation-related fine, get item info
        if (txn.circulation) {
          try {
            const copyId = txn.circulation.target_copy;
            const copyResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.asset.copy.retrieve",
              [copyId]
            );
            const copy = copyResponse.payload?.[0];

            if (copy?.call_number) {
              const volResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.callnumber.retrieve",
                [copy.call_number]
              );
              const volume = volResponse.payload?.[0];

              if (volume?.record) {
                const bibResponse = await callOpenSRF(
                  "open-ils.search",
                  "open-ils.search.biblio.record.mods_slim.retrieve",
                  [volume.record]
                );
                const bib = bibResponse.payload?.[0];
                itemInfo = {
                  title: bib?.title || "Unknown Title",
                  author: bib?.author || "",
                  barcode: copy?.barcode || "",
                };
              }
            }
          } catch (error) {
            // Item info is optional, continue without it
          }
        }

        return {
          id: txn.id,
          xactType: txn.xact_type,
          xactStart: txn.xact_start,
          lastBillingType: txn.last_billing_type,
          lastBillingNote: txn.last_billing_note,
          lastBillingTs: txn.last_billing_ts,
          totalOwed: parseFloat(txn.total_owed || 0),
          totalPaid: parseFloat(txn.total_paid || 0),
          balance: parseFloat(txn.balance_owed || 0),
          item: itemInfo,
        };
      })
    );

    // Calculate totals
    const totalOwed = fines.reduce((sum, f) => sum + f.totalOwed, 0);
    const totalPaid = fines.reduce((sum, f) => sum + f.totalPaid, 0);
    const totalBalance = fines.reduce((sum, f) => sum + f.balance, 0);

    return successResponse({
      fines,
      summary: {
        totalOwed: totalOwed.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalBalance: totalBalance.toFixed(2),
        count: fines.length,
      },
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching fines");
    return serverErrorResponse(error, "Failed to fetch fines");
  }
}

// POST /api/opac/fines/pay - Pay fines (if online payment is enabled)
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;
    const patronId = cookieStore.get("patron_id")?.value;

    if (!patronToken || !patronId) {
      return errorResponse("Not authenticated", 401);
    }

    const { transactionIds, amount, paymentType = "credit_card_payment" } = await req.json();

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return errorResponse("Transaction IDs required");
    }

    if (!amount || amount <= 0) {
      return errorResponse("Valid payment amount required");
    }

    // Note: Real implementation would integrate with payment processor
    // This is the Evergreen API call for recording payments
    const paymentResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.money.payment",
      [
        patronToken,
        {
          userid: parseInt(patronId),
          payments: transactionIds.map((id: number) => [
            id,
            amount / transactionIds.length,
          ]),
          payment_type: paymentType,
        },
        parseInt(patronId),
      ]
    );

    const result = paymentResponse.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse(result.textcode || "Payment failed" );
    }

    return successResponse({
      success: true,
      message: "Payment recorded successfully",
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error processing payment");
    return serverErrorResponse(error, "Failed to process payment");
  }
}
