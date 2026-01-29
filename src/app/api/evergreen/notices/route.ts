import { NextRequest, NextResponse } from "next/server";
import {

  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  isOpenSRFEvent,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { sendNotice, sendBatchNotices } from "@/lib/email";
import type { NoticeType, NoticeContext } from "@/lib/email";


interface PatronNoticePreferences {
  patronId: number;
  emailEnabled: boolean;
  holdReady: boolean;
  overdue: boolean;
  preOverdue: boolean;
  cardExpiration: boolean;
  fineBill: boolean;
}

async function getPatronPreferences(
  authtoken: string,
  patronId: number
): Promise<PatronNoticePreferences> {
  // Try to get preferences from Evergreen user settings
  // This uses actor.usr_setting table with setting types we'll need to create
  const settingTypes = [
    "stacksos.email.notices.enabled",
    "stacksos.email.notices.hold_ready",
    "stacksos.email.notices.overdue",
    "stacksos.email.notices.pre_overdue",
    "stacksos.email.notices.card_expiration",
    "stacksos.email.notices.fine_bill",
  ];

  const response = await callOpenSRF("open-ils.actor", "open-ils.actor.patron.settings.retrieve", [
    authtoken,
    patronId,
    settingTypes,
  ]);

  const settings = response?.payload?.[0] || {};

  return {
    patronId,
    emailEnabled: settings["stacksos.email.notices.enabled"]?.value !== false,
    holdReady: settings["stacksos.email.notices.hold_ready"]?.value !== false,
    overdue: settings["stacksos.email.notices.overdue"]?.value !== false,
    preOverdue: settings["stacksos.email.notices.pre_overdue"]?.value !== false,
    cardExpiration: settings["stacksos.email.notices.card_expiration"]?.value !== false,
    fineBill: settings["stacksos.email.notices.fine_bill"]?.value !== false,
  };
}

async function setPatronPreferences(
  authtoken: string,
  patronId: number,
  preferences: Partial<PatronNoticePreferences>
): Promise<void> {
  const settingMap: Record<string, string> = {
    emailEnabled: "stacksos.email.notices.enabled",
    holdReady: "stacksos.email.notices.hold_ready",
    overdue: "stacksos.email.notices.overdue",
    preOverdue: "stacksos.email.notices.pre_overdue",
    cardExpiration: "stacksos.email.notices.card_expiration",
    fineBill: "stacksos.email.notices.fine_bill",
  };

  for (const [key, value] of Object.entries(preferences)) {
    if (key === "patronId") continue;
    const settingType = settingMap[key];
    if (!settingType) continue;

    await callOpenSRF("open-ils.actor", "open-ils.actor.patron.settings.update", [
      authtoken,
      patronId,
      { [settingType]: value },
    ]);
  }
}

async function getLibraryInfo(authtoken: string, orgId: number) {
  const response = await callOpenSRF("open-ils.actor", "open-ils.actor.org_unit.retrieve", [
    authtoken,
    orgId,
  ]);

  const org = response?.payload?.[0];
  if (!org || isOpenSRFEvent(org)) {
    return {
      name: "Library",
      phone: undefined,
      email: undefined,
      website: undefined,
    };
  }

  return {
    name: org.name || "Library",
    phone: org.phone || undefined,
    email: org.email || undefined,
    website: org.opac_visible ? `https://${org.opac_visible}` : undefined,
  };
}

// GET - Retrieve patron notification preferences
export async function GET(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["VIEW_USER"]);
    const searchParams = req.nextUrl.searchParams;
    const patronId = parseInt(searchParams.get("patron_id") || "0");

    if (!patronId) {
      return errorResponse("patron_id required", 400);
    }

    const preferences = await getPatronPreferences(authtoken, patronId);

    return successResponse({ preferences });
  } catch (error) {
    return serverErrorResponse(error, "Notices GET", req);
  }
}

// POST - Send a notice to a patron
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const body = await req.json();
    const { patron_id, notice_type, items, holds, bills, expiration_date } = body;

    if (!patron_id || !notice_type) {
      return errorResponse("patron_id and notice_type required", 400);
    }

    const noticeType = notice_type as NoticeType;

    // Fetch patron details
    const patronResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.fleshed.retrieve",
      [authtoken, patron_id, ["card", "home_ou"]]
    );

    const patron = patronResponse?.payload?.[0];
    if (!patron || isOpenSRFEvent(patron)) {
      return errorResponse("Patron not found", 404);
    }

    if (!patron.email) {
      return errorResponse("Patron has no email address", 400);
    }

    // Check preferences
    const preferences = await getPatronPreferences(authtoken, patron_id);
    if (!preferences.emailEnabled) {
      return errorResponse("Patron has disabled email notifications", 400);
    }

    const preferenceKey = notice_type.replace(/_/g, "");
    if (
      preferenceKey in preferences &&
      !(preferences as any)[preferenceKey === "preOverdue" ? "preOverdue" : preferenceKey]
    ) {
      return errorResponse(`Patron has disabled ${notice_type} notifications`, 400);
    }

    // Get library info
    const library = await getLibraryInfo(authtoken, patron.home_ou || 1);

    // Build notice context
    const context: NoticeContext = {
      patron: {
        id: patron.id,
        firstName: patron.first_given_name || "",
        lastName: patron.family_name || "",
        email: patron.email,
        barcode: patron.card?.barcode || undefined,
      },
      library,
      items: items || undefined,
      holds: holds || undefined,
      bills: bills || undefined,
      expirationDate: expiration_date || undefined,
      preferencesUrl: `${process.env.STACKSOS_BASE_URL || ""}/opac/account/settings`,
      unsubscribeUrl: `${process.env.STACKSOS_BASE_URL || ""}/opac/account/settings?unsubscribe=email`,
    };

    // Send notice
    await sendNotice({ type: noticeType, context });

    // Audit log
    await logAuditEvent({
      action: "notice.sent",
      entity: "email_notice",
      entityId: patron_id,
      status: "success",
      details: { noticeType, patronId: patron_id, recipient: patron.email },
      actor,
      ip,
      userAgent,
      requestId,
    });

    return successResponse({ sent: true, recipient: patron.email });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await logAuditEvent({
      action: "notice.sent",
      status: "failure",
      error: errorMsg,
      ip,
      userAgent,
      requestId,
    });

    return serverErrorResponse(error, "Notices POST", req);
  }
}

// PATCH - Update patron notification preferences
export async function PATCH(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { authtoken, actor } = await requirePermissions(["UPDATE_USER"]);
    const body = await req.json();
    const { patron_id, preferences } = body;

    if (!patron_id || !preferences) {
      return errorResponse("patron_id and preferences required", 400);
    }

    await setPatronPreferences(authtoken, patron_id, preferences);

    await logAuditEvent({
      action: "notice.preferences.update",
      entity: "patron",
      entityId: patron_id,
      status: "success",
      details: { patronId: patron_id, preferences },
      actor,
      ip,
      userAgent,
      requestId,
    });

    return successResponse({ updated: true });
  } catch (error) {
    return serverErrorResponse(error, "Notices PATCH", req);
  }
}
