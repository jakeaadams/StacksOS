import { NextRequest } from "next/server";
import {

  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";


type OrgSettingDef = {
  key: string;
  label: string;
  description: string;
  category: "circ" | "holds" | "fines" | "auth";
};

// Curated allowlist for v1. Expand over time.
const SETTING_DEFS: OrgSettingDef[] = [
  {
    key: "circ.holds.default_shelf_expire_interval",
    label: "Default hold shelf expire interval",
    description: "How long holds stay on the shelf before expiring (effective/ancestor default).",
    category: "holds",
  },
  {
    key: "circ.holds.clear_shelf.copy_status",
    label: "Clear shelf copy status",
    description: "Copy status applied when clearing an expired holds shelf item.",
    category: "holds",
  },
  {
    key: "circ.hold_shelf_status_delay",
    label: "Hold shelf status delay",
    description: "Delay before a captured hold is considered on the shelf.",
    category: "holds",
  },
  {
    key: "circ.hold_capture_order",
    label: "Best-hold selection sort order",
    description: "Ordering rules used when selecting which hold to capture.",
    category: "holds",
  },
  {
    key: "circ.holds.behind_desk_pickup_supported",
    label: "Behind desk pickup supported",
    description: "Whether behind-desk pickup is supported at this org.",
    category: "holds",
  },
  {
    key: "circ.holds.expired_patron_block",
    label: "Block hold requests for expired patrons",
    description: "Blocks placing holds when the recipient privileges are expired.",
    category: "holds",
  },
  {
    key: "circ.clear_hold_on_checkout",
    label: "Clear hold when other patron checks out item",
    description: "Whether an unrelated checkout clears a hold on the item.",
    category: "holds",
  },
  {
    key: "circ.block_renews_for_holds",
    label: "Block renewal of items needed for holds",
    description: "Blocks renewals if the item is needed to fill a hold.",
    category: "holds",
  },

  {
    key: "circ.fines.charge_when_closed",
    label: "Charge fines when closed",
    description: "Whether overdue fines accrue during closed days.",
    category: "fines",
  },
  {
    key: "circ.fines.truncate_to_max_fine",
    label: "Truncate fines to max fine",
    description: "If enabled, fines are truncated to the configured max fine.",
    category: "fines",
  },
  {
    key: "circ.grace.extend",
    label: "Auto-extend grace periods",
    description: "Auto-extends grace periods based on closed-day rules.",
    category: "fines",
  },
  {
    key: "circ.grace.extend.all",
    label: "Auto-extend grace periods for all closed dates",
    description: "If enabled, grace period extension includes all closed dates.",
    category: "fines",
  },
  {
    key: "circ.grace.extend.into_closed",
    label: "Auto-extend grace periods into trailing closed dates",
    description: "If enabled, grace period extension includes trailing closed dates.",
    category: "fines",
  },

  {
    key: "circ.checkout_auto_renew_age",
    label: "Checkout auto-renew age",
    description: "How long after checkout auto-renew is allowed (if enabled by policy).",
    category: "circ",
  },
  {
    key: "circ.checkout_fills_related_hold",
    label: "Checkout fills related hold",
    description: "Whether checkout can fill a related hold.",
    category: "holds",
  },
  {
    key: "circ.checkout_fills_related_hold_exact_match_only",
    label: "Checkout fills related hold (exact match only)",
    description: "Whether checkout fills related holds only on valid/exact matches.",
    category: "holds",
  },
  {
    key: "circ.charge_on_damaged",
    label: "Charge item price when marked damaged",
    description: "If enabled, marking damaged charges the item price.",
    category: "circ",
  },
  {
    key: "circ.charge_lost_on_zero",
    label: "Charge lost on zero",
    description: "If enabled, a zero-balance lost transaction still charges lost.",
    category: "circ",
  },

  {
    key: "auth.mfa_expire_interval",
    label: "MFA recheck interval",
    description: "How often MFA must be re-verified (if enabled).",
    category: "auth",
  },
  {
    key: "auth.persistent_login_interval",
    label: "Persistent login duration",
    description: "How long persistent login sessions last.",
    category: "auth",
  },
];

export async function GET(req: NextRequest) {
  const { requestId } = getRequestMeta(req);

  try {
    const searchParams = req.nextUrl.searchParams;
    const orgIdParam = searchParams.get("org_id");

    const requestedOrgId = orgIdParam ? parseInt(orgIdParam, 10) : undefined;

    // Read-only, but still require an authenticated staff session.
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"], requestedOrgId);

    const orgId =
      requestedOrgId ??
      (typeof actor?.ws_ou === "number" ? actor.ws_ou : undefined) ??
      (typeof actor?.home_ou === "number" ? actor.home_ou : undefined);

    if (!orgId || !Number.isFinite(orgId)) {
      return errorResponse("org_id is required", 400);
    }

    const keys = SETTING_DEFS.map((s) => s.key);

    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.ou_setting.ancestor_default.batch",
      [orgId, keys, authtoken]
    );

    const values = (response?.payload?.[0] || {}) as Record<string, any>;

    const settings = SETTING_DEFS.map((def) => ({
      ...def,
      value: values[def.key] ?? null,
      resolution: "ancestor_default",
      resolvedAtOrgId: orgId,
      requestId,
    }));

    return successResponse({
      orgId,
      settings,
    });
  } catch (error) {
    return serverErrorResponse(error, "Settings GET", req);
  }
}
