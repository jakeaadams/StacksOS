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
  fmNumber,
  fmString,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { withIdempotency } from "@/lib/idempotency";
import { z } from "zod";

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

  const updateResponse = await callOpenSRF("open-ils.actor", "open-ils.actor.patron.update", [
    authtoken,
    payload,
  ]);

  const result = updateResponse?.payload?.[0];
  if (!isSuccessResult(result)) {
    throw new Error(getErrorMessage(result, "Failed to update claim counts"));
  }

  return { claimsReturnedCount, claimsNeverCheckedOutCount };
}

const claimsPostSchema = z
  .object({
    action: z.enum([
      "claims_returned",
      "claims_never_checked_out",
      "resolve_claim",
      "void_claim_fines",
    ]),
    circId: z.coerce.number().int().positive().optional(),
    copyBarcode: z.string().trim().optional(),
    claimDate: z.string().optional(),
    patronId: z.coerce.number().int().positive().optional(),
    note: z.string().max(2048).optional(),
  })
  .passthrough();

const claimsPutSchema = z
  .object({
    patronId: z.coerce.number().int().positive(),
    claimsReturnedCount: z.coerce.number().int().min(0).optional(),
    claimsNeverCheckedOutCount: z.coerce.number().int().min(0).optional(),
  })
  .passthrough();

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

      // Claims Returned is not reliably exposed via the "checked_out" payload across Evergreen installs.
      // Derive a durable list by querying circulations with stop_fines=CLAIMSRETURNED for this patron.
      // Prefer *open* circulations (checkin_time IS NULL), since the Claims Returned staff workflow
      // is about managing currently-claimed items.
      let claimsReturned: Record<string, any>[] = [];
      try {
        const claimsCircsResponse = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.circ.atomic",
          [
            authtoken,
            { usr: pid, stop_fines: "CLAIMSRETURNED", checkin_time: null },
            { limit: 100, order_by: { circ: "stop_fines_time DESC" } },
          ]
        );
        const claimsCircs = claimsCircsResponse?.payload?.[0];
        claimsReturned = Array.isArray(claimsCircs) ? claimsCircs : [];
      } catch (e) {
        // Some Evergreen installs are picky about pcrud filtering/ordering. Fall back to a broader
        // query and filter locally.
        logger.warn(
          { error: String(e), patronId: pid },
          "Claims: stop_fines query failed; falling back to local filtering"
        );

        const fallbackResponse = await callOpenSRF(
          "open-ils.pcrud",
          "open-ils.pcrud.search.circ.atomic",
          [
            authtoken,
            { usr: pid, checkin_time: null },
            { limit: 500, order_by: { circ: "xact_start DESC" } },
          ]
        );
        const fallbackCircs = fallbackResponse?.payload?.[0];
        const allCircs = Array.isArray(fallbackCircs) ? fallbackCircs : [];
        claimsReturned = allCircs.filter((c) => fmString(c, "stop_fines", 19) === "CLAIMSRETURNED");
      }

      const detailedClaims: Record<string, any>[] = [];
      for (const claim of claimsReturned) {
        const circIdVal = fmNumber(claim, "id", 10);
        if (!circIdVal) continue;

        const copyId = fmNumber(claim, "target_copy", 21);
        const claimDate = fmString(claim, "stop_fines_time", 20);
        const dueDate = fmString(claim, "due_date", 6);
        const checkoutDate = fmString(claim, "xact_start", 24);

        if (!copyId) {
          detailedClaims.push({
            circId: circIdVal,
            copyId: null,
            claimDate,
            dueDate,
            checkoutDate,
          });
          continue;
        }

        try {
          const copyResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.asset.copy.retrieve",
            [copyId]
          );
          const copy = copyResponse?.payload?.[0];

          let title = "Unknown";
          const rawCallNumber = (copy as Record<string, any>)?.call_number;
          if (rawCallNumber) {
            const cnId =
              typeof rawCallNumber === "object"
                ? (fmNumber(rawCallNumber, "id", 4) ?? (rawCallNumber as Record<string, any>).id)
                : rawCallNumber;
            const cnResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.asset.call_number.retrieve",
              [cnId]
            );
            const cn = cnResponse?.payload?.[0];
            const recordId = (cn as Record<string, any>)?.record;
            if (recordId) {
              const bibResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.biblio.record.mods_slim.retrieve",
                [recordId]
              );
              title = bibResponse?.payload?.[0]?.title || "Unknown";
            }
          }

          detailedClaims.push({
            circId: circIdVal,
            copyId,
            barcode: (copy as Record<string, any>)?.barcode || null,
            title,
            claimDate,
            dueDate,
            checkoutDate,
          });
        } catch {
          detailedClaims.push({ circId: circIdVal, copyId, claimDate, dueDate, checkoutDate });
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
        (bill) =>
          (bill.billing_type as string | undefined)?.toLowerCase().includes("claim") ||
          (bill.billing_type as string | undefined)?.toLowerCase().includes("lost")
      );

      return successResponse({
        claims: {
          returned: detailedClaims,
          neverCheckedOut: [],
        },
        counts: {
          claimsReturned: fmNumber(patron, "claims_returned_count", 16) || 0,
          claimsNeverCheckedOut: fmNumber(patron, "claims_never_checked_out_count", 17) || 0,
        },
        relatedBills: claimBills,
        totalBillsOwed: claimBills.reduce(
          (sum: number, b) => sum + parseFloat(String(b.balance_owed || 0)),
          0
        ),
      });
    }

    if (circId) {
      const cid = toInt(circId);
      if (!cid) return errorResponse("Invalid circ_id", 400);

      const circResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.retrieve", [
        authtoken,
        cid,
      ]);

      const circ = circResponse?.payload?.[0];
      if (!circ || circ.ilsevent) {
        return notFoundResponse("Circulation not found");
      }

      const stopFines =
        fmString(circ, "stop_fines", 19) || (circ as Record<string, any>).stop_fines || null;
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
          patronId: fmNumber(circ, "usr", 22) ?? (circ as Record<string, any>).usr ?? null,
          copyId:
            fmNumber(circ, "target_copy", 21) ?? (circ as Record<string, any>).target_copy ?? null,
          dueDate: fmString(circ, "due_date", 6) ?? (circ as Record<string, any>).due_date ?? null,
          stopFines,
          stopFinesTime:
            fmString(circ, "stop_fines_time", 20) ??
            (circ as Record<string, any>).stop_fines_time ??
            null,
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
        (c) => fmString(c, "stop_fines", 19) === "CLAIMSRETURNED"
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
        claimsReturnedHistory: claimsReturnedCircs.map((c) => ({
          circId: fmNumber(c, "id", 10) ?? null,
          patronId: fmNumber(c, "usr", 22) ?? null,
          claimDate: fmString(c, "stop_fines_time", 20) ?? null,
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
      const body = claimsPostSchema.parse(await req.json());
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

        const circResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.retrieve", [
          authtoken,
          cid,
        ]);
        const circ = circResponse?.payload?.[0];

        if (!circ || circ.ilsevent) {
          return notFoundResponse("Circulation not found");
        }

        const circPatronId: number | null =
          fmNumber(circ, "usr", 22) ??
          (typeof (circ as Record<string, any>).usr === "number"
            ? ((circ as Record<string, any>).usr as number)
            : null);

        // Some Evergreen installs require the copy barcode in the claims-returned payload.
        // Prefer the request-provided copyBarcode (best for audits/QA), otherwise derive it
        // from the circulation when possible.
        let resolvedCopyBarcode: string | null =
          typeof copyBarcode === "string" && copyBarcode.trim() ? copyBarcode.trim() : null;

        if (!resolvedCopyBarcode) {
          const rawCopyId =
            fmNumber(circ, "target_copy", 21) ??
            (circ as Record<string, any>).target_copy ??
            (circ as Record<string, any>).targetCopy ??
            (circ as Record<string, any>).copy ??
            (circ as Record<string, any>).target;
          const copyId = toInt(rawCopyId);
          if (copyId) {
            try {
              const copyResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.asset.copy.retrieve",
                [copyId]
              );
              const copy = copyResponse?.payload?.[0];
              if (
                copy &&
                !copy.ilsevent &&
                typeof (copy as Record<string, any>).barcode === "string" &&
                ((copy as Record<string, any>).barcode as string).trim()
              ) {
                resolvedCopyBarcode = ((copy as Record<string, any>).barcode as string).trim();
              }
            } catch {
              // ignore
            }
          }
        }

        if (!resolvedCopyBarcode) {
          return errorResponse("copyBarcode required (unable to derive from circulation)", 400);
        }

        // Read pre-action claim count for mismatch warnings (Evergreen can be configured to increment
        // this more than once per action via DB triggers).
        let claimCountBefore: number | null = null;
        if (circPatronId) {
          try {
            const patronBefore = await getPatronById(authtoken, circPatronId);
            claimCountBefore = fmNumber(patronBefore, "claims_returned_count", 16) ?? null;
          } catch {
            // ignore
          }
        }

        const payload: Record<string, any> = { barcode: resolvedCopyBarcode };
        if (claimDate) payload.backdate = claimDate;

        const claimResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.circulation.set_claims_returned",
          [authtoken, payload]
        );
        const result = claimResponse?.payload?.[0];

        if (isSuccessResult(result)) {
          // Identify the circ that was actually affected (renewals can cause circId drift, and
          // Evergreen's set_claims_returned targets the *open* circ by copy barcode).
          let effectiveCircId: number | null = null;
          let effectiveStopFines: string | null = null;
          try {
            const copy = await getCopyByBarcode(resolvedCopyBarcode);
            const copyId = fmNumber(copy, "id", 4) ?? ((copy as Record<string, any>)?.id as number);
            if (copyId) {
              const openCircResponse = await callOpenSRF(
                "open-ils.pcrud",
                "open-ils.pcrud.search.circ.atomic",
                [
                  authtoken,
                  { checkin_time: null, target_copy: copyId },
                  { limit: 1, order_by: { circ: "xact_start DESC" } },
                ]
              );
              const rows = openCircResponse?.payload?.[0];
              const openCirc = Array.isArray(rows) ? rows[0] : null;
              if (openCirc) {
                effectiveCircId = fmNumber(openCirc, "id", 10) ?? null;
                effectiveStopFines = fmString(openCirc, "stop_fines", 19) ?? null;
              }
            }
          } catch (e) {
            logger.warn(
              { requestId, error: String(e) },
              "Claims: failed to resolve effective circ after claims_returned"
            );
          }

          const billsCircId = effectiveCircId || cid;
          const billsResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.money.billing.retrieve.all",
            [authtoken, billsCircId]
          );
          const bills = billsResponse?.payload?.[0] || [];

          let fineAdjustment = null;
          if (claimDate) {
            const voidedFines = (Array.isArray(bills) ? bills : []).filter(
              (b) => b.voided === "t" || b.voided === true
            );
            fineAdjustment = {
              backdatedTo: claimDate,
              finesVoided: voidedFines.length,
              amountVoided: voidedFines.reduce(
                (sum: number, b) => sum + parseFloat(String(b.amount || 0)),
                0
              ),
            };
          }

          let newClaimCount: number | null = null;
          let claimCountDelta: number | null = null;
          if (circPatronId) {
            try {
              // Evergreen's `set_claims_returned` implementation is responsible for updating
              // patron claim counts. We only report the post-action value for UI feedback.
              const patron = await getPatronById(authtoken, circPatronId);
              newClaimCount = fmNumber(patron, "claims_returned_count", 16) ?? 0;
              if (typeof claimCountBefore === "number") {
                claimCountDelta = newClaimCount - claimCountBefore;
              }
            } catch (e) {
              logger.warn({ requestId, error: String(e) }, "Failed to read claim count");
            }
          }

          const warnings: string[] = [];
          if (effectiveCircId && effectiveCircId !== cid) {
            warnings.push(
              `claims_returned affected circ ${effectiveCircId} (requested circ ${cid})`
            );
          }
          if (effectiveStopFines && effectiveStopFines !== "CLAIMSRETURNED") {
            warnings.push(
              `effective circulation stop_fines=${effectiveStopFines} (expected CLAIMSRETURNED)`
            );
          }
          if (typeof claimCountDelta === "number" && claimCountDelta !== 1) {
            warnings.push(`claims_returned_count changed by ${claimCountDelta} (expected 1)`);
          }

          await audit("success", {
            circId: cid,
            effectiveCircId,
            claimDate,
            patronId: circPatronId,
            note,
            warnings: warnings.length > 0 ? warnings : null,
          });

          return successResponse(
            {
              action: "claims_returned",
              circId: cid,
              effectiveCircId,
              effectiveStopFines,
              fineAdjustment,
              newClaimCount,
              claimCountDelta,
              currentBills: Array.isArray(bills) ? bills : [],
              warning: warnings.length > 0 ? warnings.join("; ") : null,
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
          const checkinResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.checkin", [
            authtoken,
            { copy_barcode: copyBarcode },
          ]);

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
            const billIds = bills.map((b) => b.id).filter(Boolean);
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

        const checkinPayload: Record<string, any> = { copy_barcode: copyBarcode, noop: false };

        let checkinResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.checkin", [
          authtoken,
          checkinPayload,
        ]);

        let result = checkinResponse?.payload?.[0];

        // Some Evergreen installs require an explicit override method for
        // CLAIMS_RETURNED circulations.
        const textcode = typeof result?.textcode === "string" ? result.textcode : undefined;
        if (textcode === "CIRC_CLAIMS_RETURNED") {
          try {
            checkinResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.checkin.override", [
              authtoken,
              { ...checkinPayload, override: true },
            ]);
            result = checkinResponse?.payload?.[0];
          } catch {
            // ignore and fall through to the standard error handling below
          }
        }

        if (isSuccessResult(result) || result?.payload) {
          const response: Record<string, any> = {
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
                  .filter((b) => parseFloat(String(b.balance_owed || 0)) > 0)
                  .map((b) => b.id)
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
          .filter((b) => parseFloat(String(b.balance_owed || 0)) > 0)
          .map((b) => b.id)
          .filter(Boolean);

        if (unpaidBillIds.length === 0) {
          return successResponse({
            action: "void_claim_fines",
            circId: cid,
            finesVoided: 0,
            message: "No unpaid fines to void",
          });
        }

        const voidResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.money.billing.void",
          [authtoken, unpaidBillIds, note || "Fines voided for claim"]
        );

        const voidResult = voidResponse?.payload?.[0];

        if (isSuccessResult(voidResult)) {
          const totalVoided = bills
            .filter((b) => unpaidBillIds.includes(b.id as number))
            .reduce((sum: number, b) => sum + parseFloat(String(b.amount || 0)), 0);

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
        "Invalid action: " +
          action +
          ". Valid actions: claims_returned, claims_never_checked_out, resolve_claim, void_claim_fines",
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
      const body = claimsPutSchema.parse(await req.json());
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
