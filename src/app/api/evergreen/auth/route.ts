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
import { hashPasswordSecure } from "@/lib/password";

// POST - Login
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { username: rawUsername, password, workstation: rawWorkstation } = await req.json();
    const username = String(rawUsername || "").trim();
    const workstation =
      rawWorkstation !== undefined && rawWorkstation !== null
        ? String(rawWorkstation).trim()
        : undefined;

    const cookieSecure =
      process.env.NODE_ENV === "production" &&
      !["0", "false"].includes(String(process.env.STACKSOS_COOKIE_SECURE || "").toLowerCase());

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

    // Step 2: Hash password securely (bcrypt + MD5 for Evergreen compatibility)
    const finalHash = await hashPasswordSecure(password, seed);

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

      const retryHash = await hashPasswordSecure(password, retrySeed);

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

        await logAuditEvent({
          action: "auth.login",
          status: "success",
          actor: {
            id: userResponse?.payload?.[0]?.id,
            username,
          },
          ip,
          userAgent,
          details: { workstation, needsWorkstation: true },
        });

        return successResponse(
          {
            authtoken: authResult.payload.authtoken,
            user: userResponse?.payload?.[0],
            needsWorkstation: true,
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

      await logAuditEvent({
        action: "auth.login",
        status: "success",
        actor: {
          id: userResponse?.payload?.[0]?.id,
          username,
        },
        ip,
        userAgent,
        requestId,
        details: { workstation: workstation || null },
      });

      return successResponse({
        authtoken: authResult.payload.authtoken,
        user: userResponse?.payload?.[0],
        workstation: workstation || null,
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
      return successResponse({ authenticated: true, user });
    }

    const cookieStore = await cookies();
    cookieStore.delete("authtoken");
    return successResponse({ authenticated: false });
  } catch (error) {
    return serverErrorResponse(error, "Auth GET", req);
  }
}
