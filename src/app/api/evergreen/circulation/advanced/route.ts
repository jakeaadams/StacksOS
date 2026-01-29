import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  isSuccessResult,
  getErrorMessage,
  isOpenSRFEvent,
  getCopyByBarcode,
  getPatronById,
  encodeFieldmapper,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { withIdempotency } from "@/lib/idempotency";

/**
 * Advanced Circulation Features API
 *
 * Supports:
 * - Long overdue processing
 * - Patron merge functionality
 * - Enhanced offline transaction processing
 * - Bulk circulation operations
 */

const ACTION_PERMS: Record<string, string[]> = {
  // Long overdue
  mark_long_overdue: ["MARK_ITEM_LONG_OVERDUE"],
  process_long_overdue_batch: ["MARK_ITEM_LONG_OVERDUE"],
  checkin_long_overdue: ["COPY_CHECKIN"],

  // Patron merge
  patron_merge: ["MERGE_USERS"],
  patron_merge_preview: ["VIEW_USER"],

  // Offline enhancements
  offline_upload: ["OFFLINE_UPLOAD"],
  offline_execute: ["OFFLINE_EXECUTE"],
  offline_status: ["STAFF_LOGIN"],

  // Bulk operations
  bulk_renew: ["RENEW_CIRC"],
  bulk_checkin: ["COPY_CHECKIN"],
};

const resolvePerms = (action?: string) => ACTION_PERMS[action || ""] || ["STAFF_LOGIN"];

function toInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value || ""), 10);
  return Number.isFinite(n) ? n : null;
}

// POST - Execute advanced circulation operations
export async function POST(req: NextRequest) {
  return withIdempotency(req, "api.evergreen.circulation.advanced.POST", async () => {
    const { ip, userAgent, requestId } = getRequestMeta(req);

    try {
      const body = await req.json();
      const { action } = body;

      if (!action) {
        return errorResponse("Action required", 400);
      }

      const { authtoken, actor } = await requirePermissions(resolvePerms(action));

      const audit = async (
        status: "success" | "failure",
        details?: Record<string, any>,
        error?: string
      ) =>
        logAuditEvent({
          action: `circ.advanced.${action}`,
          status,
          actor,
          ip,
          userAgent,
          requestId,
          details,
          error: error || null,
        });

      logger.info(
        { requestId, route: "api.evergreen.circulation.advanced", action },
        "Advanced circulation operation"
      );

      switch (action) {
        /**
         * Mark Item as Long Overdue
         * Marks an item as long overdue and applies appropriate fines
         */
        case "mark_long_overdue": {
          const circId = toInt(body.circId);

          if (!circId) {
            return errorResponse("circId required", 400);
          }

          // Mark as long overdue using circ service
          const longOverdueResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.circulation.set_long_overdue",
            [authtoken, { circ_id: circId }]
          );

          const result = longOverdueResponse?.payload?.[0];

          if (isSuccessResult(result) || (result && !result.ilsevent)) {
            // Fetch any bills created
            const billsResponse = await callOpenSRF(
              "open-ils.circ",
              "open-ils.circ.money.billing.retrieve.all",
              [authtoken, circId]
            );

            const bills = billsResponse?.payload?.[0] || [];
            const longOverdueBills = (Array.isArray(bills) ? bills : []).filter(
              (b: Record<string, unknown>) =>
                b.billing_type?.toLowerCase().includes("long") ||
                b.billing_type?.toLowerCase().includes("overdue") ||
                b.billing_type?.toLowerCase().includes("replacement")
            );

            await audit("success", { circId });

            return successResponse(
              {
                action: "mark_long_overdue",
                circId,
                bills: longOverdueBills,
                totalBilled: longOverdueBills.reduce(
                  (sum: number, b: any) => sum + parseFloat(b.amount || 0),
                  0
                ),
              },
              "Item marked as Long Overdue"
            );
          }

          const message = getErrorMessage(result, "Failed to mark long overdue");
          await audit("failure", { circId }, message);
          return errorResponse(message, 400, result);
        }

        /**
         * Process Long Overdue Batch
         * Processes multiple items as long overdue based on criteria
         */
        case "process_long_overdue_batch": {
          const { daysOverdue, orgId, limit } = body;

          if (!daysOverdue || daysOverdue < 1) {
            return errorResponse("daysOverdue required (minimum 1)", 400);
          }

          const targetOrgId = toInt(orgId) || toInt(actor?.ws_ou) || 1;
          const maxItems = Math.min(toInt(limit) || 100, 500);

          // Calculate the cutoff date
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);
          const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

          // Find overdue circulations that should be marked long overdue
          const overdueResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.circulation.overdue.retrieve.all",
            [authtoken, targetOrgId, cutoffDateStr, maxItems]
          );

          const overdueCircs = overdueResponse?.payload?.[0] || [];

          if (!Array.isArray(overdueCircs) || overdueCircs.length === 0) {
            return successResponse({
              action: "process_long_overdue_batch",
              message: "No items found matching criteria",
              processed: 0,
              criteria: { daysOverdue, orgId: targetOrgId, cutoffDate: cutoffDateStr },
            });
          }

          const results: Array<{ circId: number; success: boolean; error?: string }> = [];
          let successCount = 0;

          for (const circ of overdueCircs) {
            const cid = toInt(circ.id || circ.__p?.[0]);
            if (!cid) continue;

            try {
              const markResponse = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.circulation.set_long_overdue",
                [authtoken, { circ_id: cid }]
              );

              const markResult = markResponse?.payload?.[0];

              if (isSuccessResult(markResult) || (markResult && !markResult.ilsevent)) {
                results.push({ circId: cid, success: true });
                successCount++;
              } else {
                results.push({
                  circId: cid,
                  success: false,
                  error: getErrorMessage(markResult, "Failed"),
                });
              }
            } catch (err) {
              results.push({ circId: cid, success: false, error: String(err) });
            }
          }

          await audit("success", {
            daysOverdue,
            orgId: targetOrgId,
            totalFound: overdueCircs.length,
            successCount,
          });

          return successResponse({
            action: "process_long_overdue_batch",
            criteria: { daysOverdue, orgId: targetOrgId, cutoffDate: cutoffDateStr },
            totalFound: overdueCircs.length,
            processed: successCount,
            results,
          });
        }

        /**
         * Check In Long Overdue Item
         * Checks in a long overdue item with billing adjustments
         */
        case "checkin_long_overdue": {
          const { copyBarcode, voidFines, adjustBilling } = body;

          if (!copyBarcode) {
            return errorResponse("copyBarcode required", 400);
          }

          // Check in the item
          const checkinResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.checkin",
            [
              authtoken,
              {
                copy_barcode: copyBarcode,
                void_overdues: voidFines || false,
              },
            ]
          );

          const result = checkinResponse?.payload?.[0];

          if (isSuccessResult(result) || result?.payload) {
            const response: Record<string, unknown> = {
              action: "checkin_long_overdue",
              copyBarcode,
              checkinResult: result?.payload,
            };

            // Handle billing adjustments if requested
            if (adjustBilling && result?.payload?.circ) {
              const circId = result.payload.circ.id;

              // Get current bills
              const billsResponse = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.money.billing.retrieve.all",
                [authtoken, circId]
              );

              const bills = billsResponse?.payload?.[0] || [];
              response.currentBills = bills;

              // Void long overdue processing fees if item is returned
              const longOverdueBills = (Array.isArray(bills) ? bills : []).filter(
                (b: Record<string, unknown>) =>
                  b.billing_type?.toLowerCase().includes("long") &&
                  b.billing_type?.toLowerCase().includes("overdue")
              );

              if (longOverdueBills.length > 0 && voidFines) {
                const billIds = longOverdueBills.map((b: Record<string, unknown>) => b.id);

                const voidResponse = await callOpenSRF(
                  "open-ils.circ",
                  "open-ils.circ.money.billing.void",
                  [authtoken, billIds, "Long overdue item returned"]
                );

                response.voidedBills = billIds;
                response.voidResult = voidResponse?.payload?.[0];
              }
            }

            await audit("success", { copyBarcode, voidFines, adjustBilling });
            return successResponse(response, "Long overdue item checked in");
          }

          const message = getErrorMessage(result, "Checkin failed");
          await audit("failure", { copyBarcode }, message);
          return errorResponse(message, 400, result);
        }

        /**
         * Patron Merge - Preview
         * Shows what will be merged before executing
         */
        case "patron_merge_preview": {
          const leadPatronId = toInt(body.leadPatronId);
          const subordinatePatronIds = body.subordinatePatronIds;

          if (!leadPatronId) {
            return errorResponse("leadPatronId required", 400);
          }

          if (
            !subordinatePatronIds ||
            !Array.isArray(subordinatePatronIds) ||
            subordinatePatronIds.length === 0
          ) {
            return errorResponse("subordinatePatronIds array required", 400);
          }

          const subIds = subordinatePatronIds.map(toInt).filter((id): id is number => id !== null);

          if (subIds.length === 0) {
            return errorResponse("No valid subordinate patron IDs", 400);
          }

          // Fetch lead patron details
          const leadPatron = await getPatronById(authtoken, leadPatronId);
          if (!leadPatron || leadPatron.ilsevent) {
            return notFoundResponse("Lead patron not found");
          }

          // Fetch subordinate patron details
          const subordinates: Record<string, unknown>[] = [];
          const mergeStats = {
            totalCheckouts: 0,
            totalHolds: 0,
            totalBills: 0,
            totalNotes: 0,
          };

          for (const subId of subIds) {
            const subPatron = await getPatronById(authtoken, subId);
            if (!subPatron || subPatron.ilsevent) {
              subordinates.push({ id: subId, error: "Not found" });
              continue;
            }

            // Get checkouts count
            const checkoutsResponse = await callOpenSRF(
              "open-ils.circ",
              "open-ils.circ.actor.user.checked_out.count",
              [authtoken, subId]
            );
            const checkoutCount = toInt(checkoutsResponse?.payload?.[0]) || 0;

            // Get holds count
            const holdsResponse = await callOpenSRF(
              "open-ils.circ",
              "open-ils.circ.holds.retrieve",
              [authtoken, subId]
            );
            const holdCount = Array.isArray(holdsResponse?.payload?.[0])
              ? holdsResponse.payload[0].length
              : 0;

            // Get bills
            const billsResponse = await callOpenSRF(
              "open-ils.actor",
              "open-ils.actor.user.transactions.have_balance",
              [authtoken, subId]
            );
            const bills = billsResponse?.payload?.[0] || [];
            const billCount = Array.isArray(bills) ? bills.length : 0;
            const billTotal = Array.isArray(bills)
              ? bills.reduce((sum: number, b: any) => sum + parseFloat(b.balance_owed || 0), 0)
              : 0;

            subordinates.push({
              id: subId,
              barcode: subPatron.card?.barcode,
              name: `${subPatron.family_name}, ${subPatron.first_given_name}`,
              email: subPatron.email,
              checkouts: checkoutCount,
              holds: holdCount,
              bills: billCount,
              billTotal,
            });

            mergeStats.totalCheckouts += checkoutCount;
            mergeStats.totalHolds += holdCount;
            mergeStats.totalBills += billCount;
          }

          return successResponse({
            action: "patron_merge_preview",
            lead: {
              id: leadPatronId,
              barcode: leadPatron.card?.barcode,
              name: `${leadPatron.family_name}, ${leadPatron.first_given_name}`,
              email: leadPatron.email,
            },
            subordinates,
            mergeStats,
            warning:
              "Merging patrons is irreversible. All data from subordinate accounts will be transferred to the lead account.",
          });
        }

        /**
         * Patron Merge - Execute
         * Merges subordinate patron accounts into lead account
         */
        case "patron_merge": {
          const leadPatronId = toInt(body.leadPatronId);
          const subordinatePatronIds = body.subordinatePatronIds;
          const confirm = body.confirm === true;

          if (!leadPatronId) {
            return errorResponse("leadPatronId required", 400);
          }

          if (
            !subordinatePatronIds ||
            !Array.isArray(subordinatePatronIds) ||
            subordinatePatronIds.length === 0
          ) {
            return errorResponse("subordinatePatronIds array required", 400);
          }

          if (!confirm) {
            return errorResponse(
              "Patron merge requires confirm: true. Use patron_merge_preview first.",
              400
            );
          }

          const subIds = subordinatePatronIds.map(toInt).filter((id): id is number => id !== null);

          if (subIds.length === 0) {
            return errorResponse("No valid subordinate patron IDs", 400);
          }

          // Verify lead patron exists
          const leadPatron = await getPatronById(authtoken, leadPatronId);
          if (!leadPatron || leadPatron.ilsevent) {
            return notFoundResponse("Lead patron not found");
          }

          const results: Array<{
            subordinateId: number;
            success: boolean;
            error?: string;
          }> = [];

          for (const subId of subIds) {
            try {
              // Execute merge via actor service
              const mergeResponse = await callOpenSRF(
                "open-ils.actor",
                "open-ils.actor.user.merge",
                [authtoken, leadPatronId, [subId]]
              );

              const mergeResult = mergeResponse?.payload?.[0];

              if (isSuccessResult(mergeResult) || mergeResult === 1) {
                results.push({ subordinateId: subId, success: true });
              } else {
                results.push({
                  subordinateId: subId,
                  success: false,
                  error: getErrorMessage(mergeResult, "Merge failed"),
                });
              }
            } catch (err) {
              results.push({ subordinateId: subId, success: false, error: String(err) });
            }
          }

          const successCount = results.filter((r) => r.success).length;

          await audit("success", {
            leadPatronId,
            subordinatePatronIds: subIds,
            successCount,
            totalAttempted: subIds.length,
          });

          return successResponse({
            action: "patron_merge",
            leadPatronId,
            results,
            summary: {
              attempted: subIds.length,
              succeeded: successCount,
              failed: subIds.length - successCount,
            },
          });
        }

        /**
         * Upload Offline Transactions
         * Uploads a batch of offline transactions for later processing
         */
        case "offline_upload": {
          const { sessionName, transactions } = body;

          if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
            return errorResponse("transactions array required", 400);
          }

          const orgId = toInt(body.orgId) || toInt(actor?.ws_ou) || 1;
          const workstationId = toInt(body.workstationId) || toInt(actor?.wsid);

          // Create offline session
          const sessionResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.offline.session.create",
            [
              authtoken,
              orgId,
              sessionName || `Offline Session ${new Date().toISOString()}`,
              workstationId,
            ]
          );

          const sessionResult = sessionResponse?.payload?.[0];

          if (isOpenSRFEvent(sessionResult) || sessionResult?.ilsevent) {
            const message = getErrorMessage(sessionResult, "Failed to create offline session");
            await audit("failure", { sessionName, transactionCount: transactions.length }, message);
            return errorResponse(message, 400, sessionResult);
          }

          const sessionId = sessionResult;

          // Upload transactions to the session
          let uploadCount = 0;
          const uploadErrors: Array<{ index: number; error: string }> = [];

          for (let i = 0; i < transactions.length; i++) {
            const txn = transactions[i];

            try {
              const uploadResponse = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.offline.session.transaction.create",
                [authtoken, sessionId, txn]
              );

              const uploadResult = uploadResponse?.payload?.[0];

              if (isSuccessResult(uploadResult) || (uploadResult && !uploadResult.ilsevent)) {
                uploadCount++;
              } else {
                uploadErrors.push({
                  index: i,
                  error: getErrorMessage(uploadResult, "Upload failed"),
                });
              }
            } catch (err) {
              uploadErrors.push({ index: i, error: String(err) });
            }
          }

          await audit("success", {
            sessionId,
            sessionName,
            totalTransactions: transactions.length,
            uploadCount,
            errorCount: uploadErrors.length,
          });

          return successResponse({
            action: "offline_upload",
            sessionId,
            sessionName: sessionName || `Offline Session ${new Date().toISOString()}`,
            total: transactions.length,
            uploaded: uploadCount,
            errors: uploadErrors,
          });
        }

        /**
         * Execute Offline Session
         * Processes previously uploaded offline transactions
         */
        case "offline_execute": {
          const sessionId = toInt(body.sessionId);

          if (!sessionId) {
            return errorResponse("sessionId required", 400);
          }

          // Execute the offline session
          const executeResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.offline.session.execute",
            [authtoken, sessionId]
          );

          const executeResult = executeResponse?.payload?.[0];

          if (isOpenSRFEvent(executeResult) || executeResult?.ilsevent) {
            const message = getErrorMessage(executeResult, "Failed to execute offline session");
            await audit("failure", { sessionId }, message);
            return errorResponse(message, 400, executeResult);
          }

          await audit("success", { sessionId });

          return successResponse({
            action: "offline_execute",
            sessionId,
            result: executeResult,
            message: "Offline session execution started",
          });
        }

        /**
         * Bulk Renew
         * Renews multiple items for a patron
         */
        case "bulk_renew": {
          const patronId = toInt(body.patronId);
          const itemBarcodes = body.itemBarcodes;

          if (!patronId) {
            return errorResponse("patronId required", 400);
          }

          if (!itemBarcodes || !Array.isArray(itemBarcodes) || itemBarcodes.length === 0) {
            return errorResponse("itemBarcodes array required", 400);
          }

          const results: Array<{
            barcode: string;
            success: boolean;
            dueDate?: string;
            error?: string;
          }> = [];

          for (const barcode of itemBarcodes) {
            try {
              const renewResponse = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.renew",
                [authtoken, { copy_barcode: barcode }]
              );

              const renewResult = renewResponse?.payload?.[0];

              if (
                renewResult?.ilsevent === 0 ||
                renewResult?.payload?.circ
              ) {
                const circ = renewResult?.payload?.circ || renewResult?.circ;
                const dueDate =
                  circ?.due_date ||
                  (Array.isArray(circ?.__p) ? circ.__p[6] : undefined);

                results.push({ barcode, success: true, dueDate });
              } else {
                results.push({
                  barcode,
                  success: false,
                  error: getErrorMessage(renewResult, "Renewal failed"),
                });
              }
            } catch (err) {
              results.push({ barcode, success: false, error: String(err) });
            }
          }

          const successCount = results.filter((r) => r.success).length;

          await audit("success", {
            patronId,
            totalItems: itemBarcodes.length,
            successCount,
          });

          return successResponse({
            action: "bulk_renew",
            patronId,
            total: itemBarcodes.length,
            renewed: successCount,
            failed: itemBarcodes.length - successCount,
            results,
          });
        }

        /**
         * Bulk Checkin
         * Checks in multiple items at once
         */
        case "bulk_checkin": {
          const itemBarcodes = body.itemBarcodes;
          const backdateDate = body.backdateDate;

          if (!itemBarcodes || !Array.isArray(itemBarcodes) || itemBarcodes.length === 0) {
            return errorResponse("itemBarcodes array required", 400);
          }

          const results: Array<{
            barcode: string;
            success: boolean;
            status?: string;
            holdCaptured?: boolean;
            transitTo?: string;
            error?: string;
          }> = [];

          for (const barcode of itemBarcodes) {
            try {
              const checkinParams: Record<string, unknown> = { copy_barcode: barcode };
              if (backdateDate) {
                checkinParams.backdate = backdateDate;
              }

              const checkinResponse = await callOpenSRF(
                "open-ils.circ",
                "open-ils.circ.checkin",
                [authtoken, checkinParams]
              );

              const checkinResult = checkinResponse?.payload?.[0];

              if (
                checkinResult?.ilsevent === 0 ||
                checkinResult?.payload
              ) {
                const result: Record<string, unknown> = { barcode, success: true, status: "checked_in" };

                if (checkinResult?.payload?.hold) {
                  result.holdCaptured = true;
                  result.status = "hold_captured";
                }

                if (checkinResult?.payload?.transit) {
                  result.transitTo = checkinResult.payload.transit.dest;
                  result.status = "in_transit";
                }

                results.push(result);
              } else {
                results.push({
                  barcode,
                  success: false,
                  error: getErrorMessage(checkinResult, "Checkin failed"),
                });
              }
            } catch (err) {
              results.push({ barcode, success: false, error: String(err) });
            }
          }

          const successCount = results.filter((r) => r.success).length;
          const holdsCaptured = results.filter((r) => r.holdCaptured).length;
          const transits = results.filter((r) => r.transitTo).length;

          await audit("success", {
            totalItems: itemBarcodes.length,
            successCount,
            holdsCaptured,
            transits,
            backdateDate,
          });

          return successResponse({
            action: "bulk_checkin",
            total: itemBarcodes.length,
            checkedIn: successCount,
            holdsCaptured,
            transits,
            failed: itemBarcodes.length - successCount,
            results,
          });
        }

        default:
          await audit("failure", { action }, "Invalid action");
          return errorResponse(
            `Invalid action: ${action}. Valid actions: mark_long_overdue, process_long_overdue_batch, checkin_long_overdue, patron_merge_preview, patron_merge, offline_upload, offline_execute, bulk_renew, bulk_checkin`,
            400
          );
      }
    } catch (error) {
      return serverErrorResponse(error, "Advanced Circulation POST", req);
    }
  });
}

// GET - Get information for advanced circulation operations
export async function GET(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const searchParams = req.nextUrl.searchParams;
    const queryType = searchParams.get("type");

    switch (queryType) {
      /**
       * Get Long Overdue Items
       * Returns items that are overdue beyond a threshold
       */
      case "long_overdue": {
        const daysOverdue = toInt(searchParams.get("days")) || 90;
        const orgId = toInt(searchParams.get("org_id")) || toInt(actor?.ws_ou) || 1;
        const limit = Math.min(toInt(searchParams.get("limit")) || 100, 500);

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);
        const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

        const overdueResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.circulation.overdue.retrieve.all",
          [authtoken, orgId, cutoffDateStr, limit]
        );

        const overdueCircs = overdueResponse?.payload?.[0] || [];

        const items = (Array.isArray(overdueCircs) ? overdueCircs : []).map((circ: Record<string, unknown>) => ({
          circId: circ.id || circ.__p?.[0],
          patronId: circ.usr || circ.__p?.[1],
          copyId: circ.target_copy || circ.__p?.[2],
          dueDate: circ.due_date || circ.__p?.[6],
          checkoutDate: circ.xact_start || circ.__p?.[24],
          stopFines: circ.stop_fines || circ.__p?.[7],
        }));

        return successResponse({
          type: "long_overdue",
          criteria: { daysOverdue, orgId, cutoffDate: cutoffDateStr },
          count: items.length,
          items,
        });
      }

      /**
       * Get Offline Session Status
       */
      case "offline_status": {
        const sessionId = toInt(searchParams.get("session_id"));

        if (!sessionId) {
          // List recent sessions
          const orgId = toInt(searchParams.get("org_id")) || toInt(actor?.ws_ou) || 1;

          const sessionsResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.offline.session.retrieve.all",
            [authtoken, orgId]
          );

          const sessions = sessionsResponse?.payload?.[0] || [];

          const formattedSessions = (Array.isArray(sessions) ? sessions : []).map((s: Record<string, unknown>) => ({
            id: s.id || s.__p?.[0],
            name: s.description || s.__p?.[1],
            creator: s.creator || s.__p?.[2],
            createTime: s.create_time || s.__p?.[3],
            orgUnit: s.org_unit || s.__p?.[4],
            completed: s.completed || s.__p?.[5],
          }));

          return successResponse({
            type: "offline_sessions",
            sessions: formattedSessions,
          });
        }

        // Get specific session details
        const sessionResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.offline.session.retrieve",
          [authtoken, sessionId]
        );

        const session = sessionResponse?.payload?.[0];

        if (!session || session.ilsevent) {
          return notFoundResponse("Session not found");
        }

        // Get transactions in session
        const txnResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.offline.session.transaction.retrieve.all",
          [authtoken, sessionId]
        );

        const transactions = txnResponse?.payload?.[0] || [];

        return successResponse({
          type: "offline_session",
          session: {
            id: session.id || session.__p?.[0],
            name: session.description || session.__p?.[1],
            creator: session.creator || session.__p?.[2],
            createTime: session.create_time || session.__p?.[3],
            orgUnit: session.org_unit || session.__p?.[4],
            completed: session.completed || session.__p?.[5],
          },
          transactionCount: Array.isArray(transactions) ? transactions.length : 0,
          transactions: Array.isArray(transactions)
            ? transactions.slice(0, 50).map((t: Record<string, unknown>) => ({
                id: t.id || t.__p?.[0],
                type: t.type || t.__p?.[1],
                data: t.data || t.__p?.[2],
                status: t.status || t.__p?.[3],
              }))
            : [],
        });
      }

      default:
        return successResponse({
          availableTypes: ["long_overdue", "offline_status"],
          actions: [
            {
              name: "mark_long_overdue",
              description: "Mark a single item as long overdue",
              requires: ["circId"],
            },
            {
              name: "process_long_overdue_batch",
              description: "Process multiple overdue items as long overdue",
              requires: ["daysOverdue"],
            },
            {
              name: "checkin_long_overdue",
              description: "Check in a long overdue item",
              requires: ["copyBarcode"],
            },
            {
              name: "patron_merge_preview",
              description: "Preview patron merge operation",
              requires: ["leadPatronId", "subordinatePatronIds"],
            },
            {
              name: "patron_merge",
              description: "Merge patron accounts",
              requires: ["leadPatronId", "subordinatePatronIds", "confirm: true"],
            },
            {
              name: "offline_upload",
              description: "Upload offline transactions",
              requires: ["transactions"],
            },
            {
              name: "offline_execute",
              description: "Execute offline session",
              requires: ["sessionId"],
            },
            {
              name: "bulk_renew",
              description: "Renew multiple items",
              requires: ["patronId", "itemBarcodes"],
            },
            {
              name: "bulk_checkin",
              description: "Check in multiple items",
              requires: ["itemBarcodes"],
            },
          ],
        });
    }
  } catch (error) {
    return serverErrorResponse(error, "Advanced Circulation GET", req);
  }
}
