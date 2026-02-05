import { NextRequest } from "next/server";
import { z } from "zod";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  parseJsonBodyWithSchema,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";
import { getOpacPrivacyPrefs, upsertOpacPrivacyPrefs } from "@/lib/db/opac";

const updatesSchema = z
  .object({
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(0).optional(),
    smsNumber: z.string().trim().min(0).optional(),
    smsCarrier: z.string().trim().min(0).optional(),
    holdNotifyEmail: z.boolean().optional(),
    holdNotifySms: z.boolean().optional(),
    holdNotifyPhone: z.boolean().optional(),
    overdueNotifyEmail: z.boolean().optional(),
    keepHistory: z.boolean().optional(),
    personalizedRecommendations: z.boolean().optional(),
    readingHistoryPersonalization: z.boolean().optional(),
  })
  .passthrough();

// GET /api/opac/settings - Get patron settings
export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return errorResponse("Not authenticated", 401);
    }

    // Get session to get patron ID
    const sessionResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.session.retrieve",
      [patronToken]
    );

    const user = sessionResponse?.payload?.[0];
    if (!user || user.ilsevent) {
      return errorResponse("Session expired", 401);
    }

    // Get patron settings
    const settingsResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.patron.settings.retrieve",
      [
        patronToken,
        user.id,
        [
          "opac.hold_notify",
          "opac.default_phone",
          "opac.default_sms_notify",
          "opac.default_sms_carrier",
          "history.circ.retention_start",
        ],
      ]
    );

    const rawSettings = settingsResponse?.payload?.[0] || {};
    const privacyPrefs = await getOpacPrivacyPrefs(Number(user.id));

    // Get patron details for email/phone
    const patronResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.fleshed.retrieve",
      [patronToken, user.id, ["card"]]
    );

    const patron = patronResponse?.payload?.[0];

    const holdNotify = rawSettings["opac.hold_notify"] || "email";

    return successResponse({
      settings: {
        email: patron?.email,
        phone: patron?.day_phone || patron?.evening_phone,
        smsNumber: rawSettings["opac.default_sms_notify"],
        smsCarrier: rawSettings["opac.default_sms_carrier"],
        holdNotifyEmail: holdNotify.includes("email"),
        holdNotifySms: holdNotify.includes("sms"),
        holdNotifyPhone: holdNotify.includes("phone"),
        overdueNotifyEmail: true, // Usually controlled at library level
        keepHistory: rawSettings["history.circ.retention_start"] !== null,
        personalizedRecommendations: privacyPrefs.personalizedRecommendations,
        readingHistoryPersonalization: privacyPrefs.readingHistoryPersonalization,
      },
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching settings");
    return errorResponse("Failed to fetch settings", 500);
  }
}

// PUT /api/opac/settings - Update patron settings
export async function PUT(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return errorResponse("Not authenticated", 401);
    }

    const updatesParsed = await parseJsonBodyWithSchema(req, updatesSchema);
    if (updatesParsed instanceof Response) return updatesParsed as any;
    const updates = updatesParsed;

    // Get session to get patron ID
    const sessionResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.session.retrieve",
      [patronToken]
    );

    const user = sessionResponse?.payload?.[0];
    if (!user || user.ilsevent) {
      return errorResponse("Session expired", 401);
    }

    // Build hold notify string
    const notifyMethods = [];
    if (updates.holdNotifyEmail) notifyMethods.push("email");
    if (updates.holdNotifySms) notifyMethods.push("sms");
    if (updates.holdNotifyPhone) notifyMethods.push("phone");

    // Update settings
    const settingsToUpdate: Record<string, any> = {
      "opac.hold_notify": notifyMethods.join(":") || "email",
    };

    if (updates.smsNumber) {
      settingsToUpdate["opac.default_sms_notify"] = updates.smsNumber;
    }
    if (updates.smsCarrier) {
      settingsToUpdate["opac.default_sms_carrier"] = updates.smsCarrier;
    }

    if (typeof updates.keepHistory === "boolean") {
      settingsToUpdate["history.circ.retention_start"] = updates.keepHistory ? new Date().toISOString() : null;
    }

    // Update patron settings via Evergreen
    const updateResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.patron.settings.update",
      [patronToken, user.id, settingsToUpdate]
    );

    const result = updateResponse?.payload?.[0];

    if (result?.ilsevent) {
      return errorResponse("Failed to update settings", 500);
    }

    // Update email/phone if changed (requires patron update)
    if (updates.email || updates.phone) {
      const patronUpdate: any = { id: user.id };
      if (updates.email) patronUpdate.email = updates.email;
      if (updates.phone) patronUpdate.day_phone = updates.phone;

      await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.patron.update",
        [patronToken, patronUpdate]
      );
    }

    if (typeof updates.personalizedRecommendations === "boolean" || typeof updates.readingHistoryPersonalization === "boolean") {
      await upsertOpacPrivacyPrefs(Number(user.id), {
        personalizedRecommendations: updates.personalizedRecommendations,
        readingHistoryPersonalization: updates.readingHistoryPersonalization,
      });
    }

    return successResponse({ success: true });
  } catch (error) {
    logger.error({ error: String(error) }, "Error updating settings");
    return errorResponse("Failed to update settings", 500);
  }
}
