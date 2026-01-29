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
  encodeFieldmapper,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { withIdempotency } from "@/lib/idempotency";

const ACTION_PERMS: Record<string, string[]> = {
  claims_returned: ["MARK_ITEM_CLAIMS_RETURNED"],
  claims_never_checked_out: ["UPDATE_USER"],
  resolve_claim: ["COPY_CHECKIN"],
  reset_claim_counts: ["UPDATE_USER"],
  void_claim_fines: ["VOID_BILLING"],
};

const resolvePerms = (action?: string) => ACTION_PERMS[action || ""] || ["STAFF_LOGIN"];

function toInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value || ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function updateClaimCounts(
  authtoken: string,
  patronId: number,
  patch: {
    claimsReturnedCount?: number;
    claimsNeverCheckedOutCount?: number;
  }
) {
  const patron = await getPatronById(authtoken, patronId);
  if (!patron || patron.ilsevent) {
    throw new Error("Patron not found");
  }

  const claimsReturnedCount =
    patch.claimsReturnedCount !== undefined
      ? patch.claimsReturnedCount
      : Number(patron.claims_returned_count || 0);

  const claimsNeverCheckedOutCount =
    patch.claimsNeverCheckedOutCount !== undefined
      ? patch.claimsNeverCheckedOutCount
      : Number(patron.claims_never_checked_out_count || 0);

  const payload = encodeFieldmapper("au", {
    ...patron,
    claims_returned_count: claimsReturnedCount,
    claims_never_checked_out_count: claimsNeverCheckedOutCount,
    ischanged: 1,
  });

  const updateResponse = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.patron.update",
    [authtoken, payload]
  );

  const result = updateResponse?.payload?.[0];
  if (!isSuccessResult(result)) {
    throw new Error(getErrorMessage(result, "Failed to update claim counts"));
  }

  return { claimsReturnedCount, claimsNeverCheckedOutCount };
}

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();
    const searchParams = req.nextUrl.searchParams;
    const patronId = searchParams.get("patron_id");
    const itemBarcode = searchParams.get("item_barcode");
    const circId = searchParams.get("circ_id");

    if (patronId) {
      const pid = toInt(patronId);
      if (!pid) return errorResponse("Invalid patron_id", 400);

      const checkoutsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.actor.user.checked_out",
        [authtoken, pid]
      );

      const checkouts = checkoutsResponse?.payload?.[0];
      const claimsReturned = checkouts?.claims_returned || [];

      const detailedClaims: Record<string, unknown>[] = [];
      for (const claim of claimsReturned) {
        const circIdVal = claim.id || claim.__p?.[0];
        if (!circIdVal) continue;

        const copyId = claim.target_copy || claim.__p?.[2];
        if (copyId) {
          try {
            const copyResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.asset.copy.retrieve",
              [copyId]
            );
            const copy = copyResponse?.payload?.[0];

            let title = "Unknown";
            if (copy?.call_number) {
              const cnId = typeof copy.call_number === "object" ? copy.call_number.id : copy.call_number;
              const cnResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.asset.call_number.retrieve",
                [cnId]
              );
              const cn = cnResponse?.payload?.[0];
              if (cn?.record) {
                const bibResponse = await callOpenSRF(
                  "open-ils.search",
                  "open-ils.search.biblio.record.mods_slim.retrieve",
                  [cn.record]
                );
                title = bibResponse?.payload?.[0]?.title || "Unknown";
              }
            }

            detailedClaims.push({
              circId: circIdVal,
              copyId,
              barcode: copy?.barcode,
              title,
              claimDate: claim.stop_fines_time || claim.__p?.[8],
              dueDate: claim.due_date || claim.__p?.[6],
              checkoutDate: claim.xact_start || claim.__p?.[24],
            });
          } catch {
            detailedClaims.push({
              circId: circIdVal,
              copyId,
              claimDate: claim.stop_fines_time || claim.__p?.[8],
            });
          }
        }
      }

      const patron = await getPatronById(authtoken, pid);

      const billsResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.transactions.have_balance",
        [authtoken, pid]
      );
      const allBills = billsResponse?.payload?.[0] || [];
      const claimBills = (Array.isArray(allBills) ? allBills : []).filter(
        (bill: any) =>
          bill.billing_type?.toLowerCase().includes("claim") ||
          bill.billing_type?.toLowerCase().includes("lost")
      );

      return successResponse({
        claims: {
          returned: detailedClaims,
          neverCheckedOut: [],
        },
        counts: {
          claimsReturned: patron?.claims_returned_count || 0,
          claimsNeverCheckedOut: patron?.claims_never_checked_out_count || 0,
        },
        relatedBills: claimBills,
        totalBillsOwed: claimBills.reduce(
          (sum: number, b: any) => sum + parseFloat(b.balance_owed || 0),
          0
        ),
      });
    }

    if (circId) {
      const cid = toInt(circId);
      if (!cid) return errorResponse("Invalid circ_id", 400);

      const circResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.retrieve",
        [authtoken, cid]
      );

      const circ = circResponse?.payload?.[0];
      if (!circ || circ.ilsevent) {
        return notFoundResponse("Circulation not found");
      }

      const stopFines = circ.stop_fines || circ.__p?.[7];
      const isClaimsReturned = stopFines === "CLAIMSRETURNED";

      const billsResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.money.billing.retrieve.all",
        [authtoken, cid]
      );
      const bills = billsResponse?.payload?.[0] || [];

      return successResponse({
        circulation: {
          id: cid,
          patronId: circ.usr || circ.__p?.[1],
          copyId: circ.target_copy || circ.__p?.[2],
          dueDate: circ.due_date || circ.__p?.[6],
          stopFines,
          stopFinesTime: circ.stop_fines_time || circ.__p?.[8],
          isClaimsReturned,
        },
        bills: Array.isArray(bills) ? bills : [],
      });
    }

    if (itemBarcode) {
      const copy = await getCopyByBarcode(itemBarcode);

      if (!copy || copy.ilsevent) {
        return notFoundResponse("Item not found");
      }

      const circResponse = await callOpenSRF(
        "open-ils.circ",
        "open-ils.circ.copy_checkout_history.retrieve",
        [authtoken, copy.id, 10]
      );

      const circs = circResponse?.payload?.[0] || [];
      const claimsReturnedCircs = (Array.isArray(circs) ? circs : []).filter(
        (c: any) => (c.stop_fines || c.__p?.[7]) === "CLAIMSRETURNED"
      );

      return successResponse({
        item: {
          id: copy.id,
          barcode: copy.barcode,
          status: copy.status,
          statusId: typeof copy.status === "object" ? copy.status.id : copy.status,
          isMissing: copy.status === 4,
          isLost: copy.status === 3,
          isDamaged: copy.status === 14,
        },
        claimsReturnedHistory: claimsReturnedCircs.map((c: any) => ({
          circId: c.id || c.__p?.[0],
          patronId: c.usr || c.__p?.[1],
          claimDate: c.stop_fines_time || c.__p?.[8],
        })),
      });
    }

    return errorResponse("patron_id, circ_id, or item_barcode required", 400);
  } catch (error) {
    return serverErrorResponse(error, "Claims API GET", req);
  }
}

export async function POST(req: NextRequest) {
  return withIdempotency(req, "api.evergreen.claims.POST", async () => {
    const { ip, userAgent, requestId } = getRequestMeta(req);

    try {
      const body = await req.json();
      const { action, circId, copyBarcode, claimDate, patronId, note } = body;
      const { authtoken, actor } = await requirePermissions(resolvePerms(action));

      const audit = async (
        status: "success" | "failure",
        details?: Record<string, any>,
        error?: string
      ) =>
        logAuditEvent({
          action: "claims." + (action || "unknown"),
          status,
          actor,
          ip,
          userAgent,
          requestId,
          details,
          error: error || null,
        });

      logger.info({ requestId, route: "api.evergreen.claims", action }, "Claims action");

      if (action === "claims_returned") {
        const cid = toInt(circId);
        if (!cid) {
          return errorResponse("circId required", 400);
        }

        const circResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.retrieve",
          [authtoken, cid]
        );
        const circ = circResponse?.payload?.[0];

        if (!circ || circ.ilsevent) {
          return notFoundResponse("Circulation not found");
        }

        const circPatronId = circ.usr || circ.__p?.[1];

        const claimResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.circulation.set_claims_returned",
          [authtoken, { circ_id: cid, backdate: claimDate || null }]
        );

        const result = claimResponse?.payload?.[0];

        if (isSuccessResult(result)) {
          const billsResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.money.billing.retrieve.all",
            [authtoken, cid]
          );
          const bills = billsResponse?.payload?.[0] || [];

          let fineAdjustment = null;
          if (claimDate) {
            const voidedFines = (Array.isArray(bills) ? bills : []).filter(
              (b: any) => b.voided === "t" || b.voided === true
            );
            fineAdjustment = {
              backdatedTo: claimDate,
              finesVoided: voidedFines.length,
              amountVoided: voidedFines.reduce(
                (sum: number, b: any) => sum + parseFloat(b.amount || 0),
                0
              ),
            };
          }

          let newClaimCount = null;
          if (circPatronId) {
            try {
              const patron = await getPatronById(authtoken, circPatronId);
              const currentCount = Number(patron?.claims_returned_count || 0);
              const counts = await updateClaimCounts(authtoken, circPatronId, {
                claimsReturnedCount: currentCount + 1,
              });
              newClaimCount = counts.claimsReturnedCount;
            } catch (e) {
              logger.warn({ requestId, error: String(e) }, "Failed to update claim count");
            }
          }

          await audit("success", { circId: cid, claimDate, patronId: circPatronId, note });

          return successResponse(
            {
              action: "claims_returned",
              circId: cid,
              fineAdjustment,
              newClaimCount,
              currentBills: Array.isArray(bills) ? bills : [],
            },
            "Item marked as Claims Returned"
          );
        }

        const message = getErrorMessage(result, "Failed to mark claims returned");
        await audit("failure", { circId: cid, claimDate }, message);
        return errorResponse(message, 400, result);
      }

      if (action === "claims_never_checked_out") {
        const cid = toInt(circId);
        const pid = toInt(patronId);
        if (!cid || !copyBarcode || !pid) {
          return errorResponse(
            "circId, copyBarcode, and patronId required for claims_never_checked_out",
            400
          );
        }

        try {
          const checkinResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.checkin",
            [authtoken, { copy_barcode: copyBarcode }]
          );

          const checkinResult = checkinResponse?.payload?.[0];
          if (checkinResult?.ilsevent && checkinResult.ilsevent !== 0) {
            logger.warn(
              { requestId, route: "api.evergreen.claims", checkinResult },
              "Claims: checkin returned an event; continuing"
            );
          }

          const copy = await getCopyByBarcode(copyBarcode);
          if (copy && copy.id) {
            await callOpenSRF("open-ils.circ", "open-ils.circ.mark_item_missing", [
              authtoken,
              copy.id,
            ]);
          }

          const patron = await getPatronById(authtoken, pid);
          const currentCount = Number(patron?.claims_never_checked_out_count || 0);

          const counts = await updateClaimCounts(authtoken, pid, {
            claimsNeverCheckedOutCount: currentCount + 1,
          });

          const billsResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.money.billing.retrieve.all",
            [authtoken, cid]
          );
          const bills = billsResponse?.payload?.[0] || [];
          let finesVoided = 0;

          if (Array.isArray(bills) && bills.length > 0) {
            const billIds = bills.map((b: any) => b.id).filter(Boolean);
            if (billIds.length > 0) {
              await callOpenSRF("open-ils.circ", "open-ils.circ.money.billing.void", [
                authtoken,
                billIds,
                note || "Claims Never Checked Out",
              ]);
              finesVoided = billIds.length;
            }
          }

          await audit("success", {
            circId: cid,
            copyBarcode,
            patronId: pid,
            newCount: counts.claimsNeverCheckedOutCount,
            finesVoided,
          });

          return successResponse(
            {
              action: "claims_never_checked_out",
              newCount: counts.claimsNeverCheckedOutCount,
              itemStatus: "Missing",
              finesVoided,
            },
            "Item marked as Claims Never Checked Out and set to Missing"
          );
        } catch (error) {
          const message = "Failed to process claims never checked out: " + String(error);
          await audit("failure", { circId: cid, copyBarcode, patronId: pid }, message);
          return errorResponse(message, 500);
        }
      }

      if (action === "resolve_claim") {
        if (!copyBarcode) {
          return errorResponse("copyBarcode required", 400);
        }

        const { resolution, voidFines } = body;

        const checkinResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.checkin", [
          authtoken,
          { copy_barcode: copyBarcode, noop: false },
        ]);

        const result = checkinResponse?.payload?.[0];

        if (isSuccessResult(result) || result?.payload) {
          const response: Record<string, unknown> = {
            action: "resolve_claim",
            resolution: resolution || "Item returned",
            copyBarcode,
          };

          const circ = result?.payload?.circ;
          if (circ && voidFines) {
            const circIdVal = circ.id || circ.__p?.[0];
            if (circIdVal) {
              const billsResponse = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.money.billing.retrieve.all",
                [authtoken, circIdVal]
              );
              const bills = billsResponse?.payload?.[0] || [];

              if (Array.isArray(bills) && bills.length > 0) {
                const unpaidBillIds = bills
                  .filter((b: any) => parseFloat(b.balance_owed || 0) > 0)
                  .map((b: any) => b.id)
                  .filter(Boolean);

                if (unpaidBillIds.length > 0) {
                  await callOpenSRF("open-ils.circ", "open-ils.circ.money.billing.void", [
                    authtoken,
                    unpaidBillIds,
                    note || "Claim resolved - item returned",
                  ]);
                  response.finesVoided = unpaidBillIds.length;
                }
              }
            }
          }

          await audit("success", { copyBarcode, resolution, voidFines });
          return successResponse(response, "Claim resolved: " + (resolution || "Item returned"));
        }

        const message = getErrorMessage(result, "Failed to resolve claim");
        await audit("failure", { copyBarcode, resolution }, message);
        return errorResponse(message, 400, result);
      }

      if (action === "void_claim_fines") {
        const cid = toInt(circId);
        if (!cid) {
          return errorResponse("circId required", 400);
        }

        const billsResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.money.billing.retrieve.all",
          [authtoken, cid]
        );
        const bills = billsResponse?.payload?.[0] || [];

        if (!Array.isArray(bills) || bills.length === 0) {
          return successResponse({
            action: "void_claim_fines",
            circId: cid,
            finesVoided: 0,
            message: "No fines to void",
          });
        }

        const unpaidBillIds = bills
          .filter((b: any) => parseFloat(b.balance_owed || 0) > 0)
          .map((b: any) => b.id)
          .filter(Boolean);

        if (unpaidBillIds.length === 0) {
          return successResponse({
            action: "void_claim_fines",
            circId: cid,
            finesVoided: 0,
            message: "No unpaid fines to void",
          });
        }

        const voidResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.money.billing.void", [
          authtoken,
          unpaidBillIds,
          note || "Fines voided for claim",
        ]);

        const voidResult = voidResponse?.payload?.[0];

        if (isSuccessResult(voidResult)) {
          const totalVoided = bills
            .filter((b: any) => unpaidBillIds.includes(b.id))
            .reduce((sum: number, b: any) => sum + parseFloat(b.amount || 0), 0);

          await audit("success", { circId: cid, finesVoided: unpaidBillIds.length, totalVoided });

          return successResponse({
            action: "void_claim_fines",
            circId: cid,
            finesVoided: unpaidBillIds.length,
            totalVoided,
          });
        }

        const message = getErrorMessage(voidResult, "Failed to void fines");
        await audit("failure", { circId: cid }, message);
        return errorResponse(message, 400, voidResult);
      }

      await audit("failure", { action }, "Invalid action");
      return errorResponse(
        "Invalid action: " + action + ". Valid actions: claims_returned, claims_never_checked_out, resolve_claim, void_claim_fines",
        400
      );
    } catch (error) {
      return serverErrorResponse(error, "Claims API POST", req);
    }
  });
}

export async function PUT(req: NextRequest) {
  return withIdempotency(req, "api.evergreen.claims.PUT", async () => {
    const { ip, userAgent, requestId } = getRequestMeta(req);

    try {
      const body = await req.json();
      const patronId = toInt(body.patronId);
      const claimsReturnedCount =
        body.claimsReturnedCount !== undefined ? toInt(body.claimsReturnedCount) : undefined;
      const claimsNeverCheckedOutCount =
        body.claimsNeverCheckedOutCount !== undefined
          ? toInt(body.claimsNeverCheckedOutCount)
          : undefined;

      if (body.claimsReturnedCount !== undefined && claimsReturnedCount === null) {
        return errorResponse("Invalid claimsReturnedCount", 400);
      }

      if (body.claimsNeverCheckedOutCount !== undefined && claimsNeverCheckedOutCount === null) {
        return errorResponse("Invalid claimsNeverCheckedOutCount", 400);
      }

      if (!patronId) {
        return errorResponse("patronId required", 400);
      }

      const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);

      const patch: { claimsReturnedCount?: number; claimsNeverCheckedOutCount?: number } = {};
      if (typeof claimsReturnedCount === "number") patch.claimsReturnedCount = claimsReturnedCount;
      if (typeof claimsNeverCheckedOutCount === "number")
        patch.claimsNeverCheckedOutCount = claimsNeverCheckedOutCount;

      const counts = await updateClaimCounts(authtoken, patronId, patch);

      await logAuditEvent({
        action: "claims.counts.update",
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: {
          patronId,
          claimsReturnedCount: counts.claimsReturnedCount,
          claimsNeverCheckedOutCount: counts.claimsNeverCheckedOutCount,
        },
        error: null,
      });

      return successResponse(
        {
          patron: {
            id: patronId,
            claimsReturnedCount: counts.claimsReturnedCount,
            claimsNeverCheckedOutCount: counts.claimsNeverCheckedOutCount,
          },
        },
        "Claim counts updated"
      );
    } catch (error) {
      return serverErrorResponse(error, "Claims API PUT", req);
    }
  });
}
