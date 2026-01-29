import { NextRequest, NextResponse } from "next/server";
import {

  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  parseJsonBody,
  requireFields,
  isOpenSRFEvent,
  getErrorMessage,
  getRequestMeta,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";


// StacksOS-specific settings keys (namespaced to avoid collisions)
const STACKSOS_SETTINGS_PREFIX = "stacksos.";

const ALLOWED_SETTINGS = [
  "stacksos.dashboard.layout",
  "stacksos.dashboard.widgets",
  "stacksos.preferences.theme",
  "stacksos.preferences.keyboard_shortcuts",
  "stacksos.preferences.default_printer",
] as const;

type StacksOSSetting = (typeof ALLOWED_SETTINGS)[number];

function isAllowedSetting(key: string): key is StacksOSSetting {
  return ALLOWED_SETTINGS.includes(key as StacksOSSetting);
}

/**
 * GET /api/evergreen/user-settings
 * Retrieves user settings from Evergreen
 *
 * Query params:
 *   - keys: comma-separated list of setting keys (optional, defaults to all stacksos.* settings)
 */
export async function GET(req: NextRequest) {
  const meta = getRequestMeta(req);

  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const userId = actor?.id;

    if (!userId) {
      return errorResponse("User ID not found in session", 400);
    }

    const searchParams = req.nextUrl.searchParams;
    const keysParam = searchParams.get("keys");

    // Parse requested keys or use all allowed settings
    const requestedKeys = keysParam
      ? keysParam.split(",").filter(isAllowedSetting)
      : [...ALLOWED_SETTINGS];

    if (requestedKeys.length === 0) {
      return successResponse({ settings: {} });
    }

    logger.debug(
      { requestId: meta.requestId, route: "api.evergreen.user-settings", userId, keys: requestedKeys },
      "Fetching user settings"
    );

    // Fetch settings from Evergreen
    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.patron.settings.retrieve",
      [authtoken, userId, requestedKeys]
    );

    const rawSettings = response?.payload?.[0];

    // Normalize response - Evergreen returns object with key -> value
    const settings: Record<string, any> = {};

    if (rawSettings && typeof rawSettings === "object" && !isOpenSRFEvent(rawSettings)) {
      for (const key of requestedKeys) {
        const value = rawSettings[key];
        if (value !== undefined && value !== null) {
          // Parse JSON strings for complex values
          try {
            settings[key] = typeof value === "string" ? JSON.parse(value) : value;
          } catch (error) {
            settings[key] = value;
          }
        }
      }
    }

    return successResponse({
      userId,
      settings,
      requestId: meta.requestId,
    });
  } catch (error) {
    return serverErrorResponse(error, "User settings GET", req);
  }
}

/**
 * POST /api/evergreen/user-settings
 * Saves user settings to Evergreen
 *
 * Body:
 *   - settings: Record<string, any> - key-value pairs to save
 */
export async function POST(req: NextRequest) {
  const meta = getRequestMeta(req);

  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);
    const userId = actor?.id;

    if (!userId) {
      return errorResponse("User ID not found in session", 400);
    }

    const bodyResult = await parseJsonBody<{ settings?: Record<string, any> }>(req);

    // Check if parseJsonBody returned an error response
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const body = bodyResult;

    // Check required fields
    const fieldsError = requireFields(body, ["settings"]);
    if (fieldsError) {
      return fieldsError;
    }

    const settings = body.settings!;

    if (typeof settings !== "object" || settings === null) {
      return errorResponse("settings must be an object", 400);
    }

    // Filter to only allowed keys
    const validSettings: Record<string, string> = {};
    const rejectedKeys: string[] = [];

    for (const [key, value] of Object.entries(settings)) {
      if (isAllowedSetting(key)) {
        // Stringify complex values for storage
        validSettings[key] = typeof value === "string" ? value : JSON.stringify(value);
      } else {
        rejectedKeys.push(key);
      }
    }

    if (Object.keys(validSettings).length === 0) {
      return errorResponse(
        `No valid settings to save. Allowed keys: ${ALLOWED_SETTINGS.join(", ")}`,
        400
      );
    }

    logger.info(
      { requestId: meta.requestId, route: "api.evergreen.user-settings", userId, keys: Object.keys(validSettings) },
      "Saving user settings"
    );

    // Save settings to Evergreen
    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.patron.settings.update",
      [authtoken, userId, validSettings]
    );

    const result = response?.payload?.[0];

    if (isOpenSRFEvent(result)) {
      logger.error(
        { requestId: meta.requestId, event: result },
        "Evergreen error saving user settings"
      );
      return errorResponse(getErrorMessage(result, "Failed to save settings"), 500);
    }

    // Audit log
    await logAuditEvent({
      actor: { id: actor?.id, username: actor?.usrname },
      status: "success",
      action: "user_settings.update",
      entity: "user_settings",
      entityId: String(userId),
      details: {
        keys: Object.keys(validSettings),
        rejectedKeys: rejectedKeys.length > 0 ? rejectedKeys : undefined,
      },
      requestId: meta.requestId,
    });

    return successResponse({
      success: true,
      userId,
      savedKeys: Object.keys(validSettings),
      rejectedKeys: rejectedKeys.length > 0 ? rejectedKeys : undefined,
      requestId: meta.requestId,
    });
  } catch (error) {
    return serverErrorResponse(error, "User settings POST", req);
  }
}
