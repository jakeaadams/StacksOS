import { NextRequest } from "next/server";
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
import { sendNotice } from "@/lib/email";
import type { NoticeType, NoticeContext } from "@/lib/email";
import { getActiveTemplate, createNotificationEvent, createDelivery, markDeliveryAttempt } from "@/lib/db/notifications";
import { renderTemplateString } from "@/lib/notifications/render";
import { sendSms } from "@/lib/sms/provider";


interface PatronNoticePreferences {
  patronId: number;
  emailEnabled: boolean;
  smsEnabled: boolean;
  // Email toggles (back-compat keys keep the original names)
  holdReady: boolean;
  overdue: boolean;
  preOverdue: boolean;
  cardExpiration: boolean;
  fineBill: boolean;

  // SMS toggles
  smsHoldReady: boolean;
  smsOverdue: boolean;
  smsPreOverdue: boolean;
  smsCardExpiration: boolean;
  smsFineBill: boolean;
}

function isNoticeTypeEnabled(prefs: PatronNoticePreferences, noticeType: NoticeType, channel: "email" | "sms") {
  if (channel === "email") {
    if (!prefs.emailEnabled) return false;
    switch (noticeType) {
      case "hold_ready":
        return prefs.holdReady;
      case "overdue":
        return prefs.overdue;
      case "pre_overdue":
        return prefs.preOverdue;
      case "card_expiration":
        return prefs.cardExpiration;
      case "fine_bill":
        return prefs.fineBill;
      default:
        return false;
    }
  }

  if (!prefs.smsEnabled) return false;
  switch (noticeType) {
    case "hold_ready":
      return prefs.smsHoldReady;
    case "overdue":
      return prefs.smsOverdue;
    case "pre_overdue":
      return prefs.smsPreOverdue;
    case "card_expiration":
      return prefs.smsCardExpiration;
    case "fine_bill":
      return prefs.smsFineBill;
    default:
      return false;
  }
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
    "stacksos.sms.notices.enabled",
    "stacksos.sms.notices.hold_ready",
    "stacksos.sms.notices.overdue",
    "stacksos.sms.notices.pre_overdue",
    "stacksos.sms.notices.card_expiration",
    "stacksos.sms.notices.fine_bill",
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
    smsEnabled: settings["stacksos.sms.notices.enabled"]?.value !== false,
    holdReady: settings["stacksos.email.notices.hold_ready"]?.value !== false,
    overdue: settings["stacksos.email.notices.overdue"]?.value !== false,
    preOverdue: settings["stacksos.email.notices.pre_overdue"]?.value !== false,
    cardExpiration: settings["stacksos.email.notices.card_expiration"]?.value !== false,
    fineBill: settings["stacksos.email.notices.fine_bill"]?.value !== false,
    smsHoldReady: settings["stacksos.sms.notices.hold_ready"]?.value !== false,
    smsOverdue: settings["stacksos.sms.notices.overdue"]?.value !== false,
    smsPreOverdue: settings["stacksos.sms.notices.pre_overdue"]?.value !== false,
    smsCardExpiration: settings["stacksos.sms.notices.card_expiration"]?.value !== false,
    smsFineBill: settings["stacksos.sms.notices.fine_bill"]?.value !== false,
  };
}

async function setPatronPreferences(
  authtoken: string,
  patronId: number,
  preferences: Partial<PatronNoticePreferences>
): Promise<void> {
  const settingMap: Record<string, string> = {
    emailEnabled: "stacksos.email.notices.enabled",
    smsEnabled: "stacksos.sms.notices.enabled",
    holdReady: "stacksos.email.notices.hold_ready",
    overdue: "stacksos.email.notices.overdue",
    preOverdue: "stacksos.email.notices.pre_overdue",
    cardExpiration: "stacksos.email.notices.card_expiration",
    fineBill: "stacksos.email.notices.fine_bill",
    smsHoldReady: "stacksos.sms.notices.hold_ready",
    smsOverdue: "stacksos.sms.notices.overdue",
    smsPreOverdue: "stacksos.sms.notices.pre_overdue",
    smsCardExpiration: "stacksos.sms.notices.card_expiration",
    smsFineBill: "stacksos.sms.notices.fine_bill",
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
    const { authtoken } = await requirePermissions(["VIEW_USER"]);
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
    const { patron_id, notice_type, items, holds, bills, expiration_date, channel } = body;
    const noticeChannel = channel === "sms" ? "sms" : "email";

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

    // Check preferences
    const preferences = await getPatronPreferences(authtoken, patron_id);
    if (!isNoticeTypeEnabled(preferences, noticeType, noticeChannel)) {
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
        email: patron.email || "patron@example.org",
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

    let notificationEventId: string | null = null;
    let deliveryId: number | null = null;

    if (noticeChannel === "email") {
      if (!patron.email) return errorResponse("Patron has no email address", 400);
      const sendResult = await sendNotice({ type: noticeType, context, createdBy: actor?.id ?? null });
      notificationEventId = sendResult.eventId;
      deliveryId = sendResult.deliveryId;
    } else {
      const phone =
        String(patron.day_phone || patron.other_phone || patron.evening_phone || patron.phone || "").trim();
      if (!phone) return errorResponse("Patron has no phone number for SMS", 400);

      const eventId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      await createNotificationEvent({
        id: eventId,
        channel: "sms",
        noticeType,
        patronId: patron_id,
        recipient: phone,
        createdBy: actor?.id ?? null,
        context,
      });
      const delId = await createDelivery({ eventId, provider: String(process.env.STACKSOS_SMS_PROVIDER || "console") });

      const active = await getActiveTemplate("sms", noticeType);
      const msgTemplate = active?.body_template || "{{library.name}} notice for {{patron.firstName}}";
      const message = renderTemplateString(msgTemplate, context, { html: false });

      try {
        await sendSms({ to: phone, message });
        if (delId) await markDeliveryAttempt({ deliveryId: delId, status: "sent" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (delId) await markDeliveryAttempt({ deliveryId: delId, status: "failed", error: msg });
        throw e;
      }

      notificationEventId = eventId;
      deliveryId = delId;
    }

    // Audit log
    await logAuditEvent({
      action: "notice.sent",
      entity: "email_notice",
      entityId: patron_id,
      status: "success",
      details: { noticeType, patronId: patron_id, channel: noticeChannel, recipient: noticeChannel === "email" ? patron.email : undefined, notificationEventId, deliveryId },
      actor,
      ip,
      userAgent,
      requestId,
    });

    return successResponse({ sent: true, channel: noticeChannel, recipient: noticeChannel === "email" ? patron.email : undefined, notificationEventId, deliveryId });
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
