import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  callOpenSRF,
  getAuthToken,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { hashPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { isCookieSecure } from "@/lib/csrf";

async function resolveProfileName(authtoken: string, user: any): Promise<string | null> {
  const raw = user?.profile ?? user?.profile_id ?? user?.profileId;
  const profileId = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(profileId)) return null;

  try {
    const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.retrieve.pgt", [
      authtoken,
      profileId,
    ]);

    const group = response?.payload?.[0];
    const name = group?.name ?? group?.__p?.[1];
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch (error) {
    logger.warn(
      { error: String(error), component: "auth", profileId },
      "Failed to resolve staff profile name"
    );
    return null;
  }
}

// POST - Login
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  // Rate limiting - 5 attempts per 15 minutes per IP
  const rateLimit = checkRateLimit(ip || "unknown", {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    endpoint: "staff-auth",
  });

  if (!rateLimit.allowed) {
    const waitMinutes = Math.ceil(rateLimit.resetIn / 60000);
    logger.warn({ ip, requestId, rateLimit }, "Staff auth rate limit exceeded");
    
    return errorResponse(
      `Too many login attempts. Please try again in ${waitMinutes} minute(s).`,
      429,
      {
        retryAfter: Math.ceil(rateLimit.resetIn / 1000),
        limit: rateLimit.limit,
        resetTime: new Date(rateLimit.resetTime).toISOString(),
      }
    );
  }

  try {
    const { username: rawUsername, password, workstation: rawWorkstation } = await req.json();
    const username = String(rawUsername || "").trim();
    const workstation =
      rawWorkstation !== undefined && rawWorkstation !== null
        ? String(rawWorkstation).trim()
        : undefined;

    const cookieSecure = isCookieSecure(req);

    if (!username || !password) {
      await logAuditEvent({
        action: "auth.login",
        status: "failure",
        actor: { username },
        ip,
        userAgent,
        requestId,
        error: "missing_credentials",
      });
      return errorResponse("Username and password required", 400);
    }

    logger.info({ requestId, route: "api.evergreen.auth", username }, "Login attempt");

    // Step 1: Get auth seed
    const seedResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.init",
      [username]
    );

    const seed = seedResponse?.payload?.[0];
    if (!seed) {
      await logAuditEvent({
        action: "auth.login",
        status: "failure",
        actor: { username },
        ip,
        userAgent,
        requestId,
        error: "seed_failed",
      });
      return errorResponse("Failed to get auth seed - user may not exist", 401);
    }

    // Step 2: Hash password using MD5 (Evergreen compatibility)
    const finalHash = hashPassword(password, seed);

    // Step 3: Authenticate
    const authParams: Record<string, any> = {
      username,
      password: finalHash,
      type: "staff",
    };

    if (workstation) {
      authParams.workstation = workstation;
    }

    const authResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.complete",
      [authParams]
    );

    let authResult = authResponse?.payload?.[0];

    // If workstation not found, retry without it
    if (authResult?.textcode === "WORKSTATION_NOT_FOUND" && workstation) {
      logger.warn({ requestId, route: "api.evergreen.auth", username, workstation }, "Workstation not found; retrying without workstation");

      const retrySeedResponse = await callOpenSRF(
        "open-ils.auth",
        "open-ils.auth.authenticate.init",
        [username]
      );

      const retrySeed = retrySeedResponse?.payload?.[0];
      if (!retrySeed) {
        await logAuditEvent({
          action: "auth.login",
          status: "failure",
          actor: { username },
          ip,
          userAgent,
          error: "seed_retry_failed",
        });
        return errorResponse("Failed to re-init auth seed for retry", 401);
      }

      const retryHash = hashPassword(password, retrySeed);

      const retryResponse = await callOpenSRF(
        "open-ils.auth",
        "open-ils.auth.authenticate.complete",
        [{ username, password: retryHash, type: "staff" }]
      );

      authResult = retryResponse?.payload?.[0];

      if (authResult?.ilsevent === 0 && authResult?.payload?.authtoken) {
        const cookieStore = await cookies();
        cookieStore.set("authtoken", authResult.payload.authtoken, {
          httpOnly: true,
          secure: cookieSecure,
          sameSite: "lax",
          maxAge: 60 * 60 * 8,
        });

        const userResponse = await callOpenSRF(
          "open-ils.auth",
          "open-ils.auth.session.retrieve",
          [authResult.payload.authtoken]
        );
        const user = userResponse?.payload?.[0];
        const profileName = await resolveProfileName(authResult.payload.authtoken, user);

        await logAuditEvent({
          action: "auth.login",
          status: "success",
          actor: {
            id: user?.id,
            username,
          },
          ip,
          userAgent,
          details: { workstation, needsWorkstation: true },
        });

        return successResponse(
          {
            authtoken: authResult.payload.authtoken,
            user,
            needsWorkstation: true,
            profileName,
          },
          `Workstation "${workstation}" is not registered. Please register a workstation.`
        );
      }
    }

    // Check for successful auth
    if (authResult?.ilsevent === 0 && authResult?.payload?.authtoken) {
      const cookieStore = await cookies();
      cookieStore.set("authtoken", authResult.payload.authtoken, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: "lax",
        maxAge: 60 * 60 * 8,
      });

      const userResponse = await callOpenSRF(
        "open-ils.auth",
        "open-ils.auth.session.retrieve",
        [authResult.payload.authtoken]
      );
      const user = userResponse?.payload?.[0];
      const profileName = await resolveProfileName(authResult.payload.authtoken, user);

      await logAuditEvent({
        action: "auth.login",
        status: "success",
        actor: {
          id: user?.id,
          username,
        },
        ip,
        userAgent,
        requestId,
        details: { workstation: workstation || null },
      });

      return successResponse({
        authtoken: authResult.payload.authtoken,
        user,
        workstation: workstation || null,
        profileName,
      });
    }

    await logAuditEvent({
      action: "auth.login",
      status: "failure",
      actor: { username },
      ip,
      userAgent,
      requestId,
      error: authResult?.textcode || authResult?.desc || "auth_failed",
    });

    return errorResponse(
      authResult?.textcode || authResult?.desc || "Authentication failed",
      401
    );
  } catch (error) {
    return serverErrorResponse(error, "Auth POST", req);
  }
}

// DELETE - Logout
export async function DELETE(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const cookieStore = await cookies();
    const authtoken = await getAuthToken();

    if (authtoken) {
      await callOpenSRF("open-ils.auth", "open-ils.auth.session.delete", [authtoken]);
      cookieStore.delete("authtoken");
    }

    await logAuditEvent({
      action: "auth.logout",
      status: "success",
      ip,
      userAgent,
      requestId,
    });

    return successResponse({}, "Logged out");
  } catch (error) {
    return serverErrorResponse(error, "Auth DELETE", req);
  }
}

// GET - Check session
export async function GET(req: NextRequest) {
  try {
    const authtoken = await getAuthToken();

    if (!authtoken) {
      return successResponse({ authenticated: false });
    }

    const sessionResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.session.retrieve",
      [authtoken]
    );

    const user = sessionResponse?.payload?.[0];

    if (user && !user.ilsevent) {
      const profileName = await resolveProfileName(authtoken, user);
      return successResponse({ authenticated: true, user, profileName });
    }

    const cookieStore = await cookies();
    cookieStore.delete("authtoken");
    return successResponse({ authenticated: false });
  } catch (error) {
    return serverErrorResponse(error, "Auth GET", req);
  }
}
