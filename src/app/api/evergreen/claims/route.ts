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
  // Evergreen does not have a first-class circ call for "claims never checked out".
  // We implement a safe approximation (checkin + mark missing + increment counter).
  claims_never_checked_out: ["UPDATE_USER"],
  resolve_claim: ["COPY_CHECKIN"],
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

  // open-ils.actor.patron.update expects a fieldmapper-encoded au object with required fields.
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

  return {
    claimsReturnedCount,
    claimsNeverCheckedOutCount,
  };
}

// GET - Get patron claims or item claim status
export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();

    const searchParams = req.nextUrl.searchParams;
    const patronId = searchParams.get("patron_id");
    const itemBarcode = searchParams.get("item_barcode");

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

      const patron = await getPatronById(authtoken, pid);

      return successResponse({
        claims: {
          returned: claimsReturned,
          // Evergreen does not expose a canonical list for claims-never-checked-out.
          // We track the counter and leave listing as a future enhancement.
          neverCheckedOut: [],
        },
        counts: {
          claimsReturned: patron?.claims_returned_count || 0,
          claimsNeverCheckedOut: patron?.claims_never_checked_out_count || 0,
        },
      });
    }

    if (itemBarcode) {
      const copy = await getCopyByBarcode(itemBarcode);

      if (!copy || copy.ilsevent) {
        return notFoundResponse("Item not found");
      }

      return successResponse({
        item: {
          id: copy.id,
          barcode: copy.barcode,
          status: copy.status,
          // NOTE: "Claims Returned" is a circulation state, not a copy status.
          // We intentionally do not guess here.
          isMissing: copy.status === 4,
          isLost: copy.status === 3,
          isDamaged: copy.status === 14,
        },
      });
    }

    return errorResponse("patron_id or item_barcode required", 400);
  } catch (error) {
    return serverErrorResponse(error, "Claims API GET", req);
  }
}

// POST - Mark item as claims returned or claims never checked out
export async function POST(req: NextRequest) {
  return withIdempotency(req, "api.evergreen.claims.POST", async () => {
    const { ip, userAgent, requestId } = getRequestMeta(req);

    try {
      const body = await req.json();
      const { action, circId, copyBarcode, claimDate, patronId } = body;
      const { authtoken, actor } = await requirePermissions(resolvePerms(action));

      const audit = async (
        status: "success" | "failure",
        details?: Record<string, any>,
        error?: string
      ) =>
        logAuditEvent({
          action: `claims.${action || "unknown"}`,
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

        const claimResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.circulation.set_claims_returned",
          [authtoken, { circ_id: cid, backdate: claimDate || null }]
        );

        const result = claimResponse?.payload?.[0];

        if (isSuccessResult(result)) {
          await audit("success", { circId: cid, claimDate });
          return successResponse(
            {
              action: "claims_returned",
              fineAdjusted: !!claimDate,
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
          if (checkinResult?.ilsevent && checkinResult.ilsevent != 0) {
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

          await audit("success", {
            circId: cid,
            copyBarcode,
            patronId: pid,
            newCount: counts.claimsNeverCheckedOutCount,
          });

          return successResponse(
            {
              action: "claims_never_checked_out",
              newCount: counts.claimsNeverCheckedOutCount,
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

        const { resolution } = body;

        const checkinResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.checkin", [
          authtoken,
          { copy_barcode: copyBarcode, noop: false },
        ]);

        const result = checkinResponse?.payload?.[0];

        if (isSuccessResult(result) || result?.payload) {
          await audit("success", { copyBarcode, resolution });
          return successResponse(
            {
              action: "resolve_claim",
              resolution,
            },
            `Claim resolved: ${resolution || "Item returned"}`
          );
        }

        const message = getErrorMessage(result, "Failed to resolve claim");
        await audit("failure", { copyBarcode, resolution }, message);
        return errorResponse(message, 400, result);
      }

      await audit("failure", { action }, "Invalid action");
      return errorResponse("Invalid action", 400);
    } catch (error) {
      return serverErrorResponse(error, "Claims API POST", req);
    }
  });
}

// PUT - Update patron claim counts (admin function)
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
      if (typeof claimsNeverCheckedOutCount === "number") patch.claimsNeverCheckedOutCount = claimsNeverCheckedOutCount;

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
