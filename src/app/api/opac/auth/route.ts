import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { callOpenSRF, errorResponse, getRequestMeta, successResponse, serverErrorResponse } from "@/lib/api";
import { isCookieSecure } from "@/lib/csrf";
import { checkRateLimit, recordSuccess } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/password";
import { logAuditEvent } from "@/lib/audit";

/**
 * Self-Checkout Patron Authentication
 * Authenticates patrons for self-checkout using barcode and PIN
 */

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const rate = await checkRateLimit(ip || "unknown", {
      maxAttempts: 10,
      windowMs: 15 * 60 * 1000,
      endpoint: "self-checkout-auth",
    });

    if (!rate.allowed) {
      const waitMinutes = Math.ceil(rate.resetIn / 60000);
      return errorResponse(
        `Too many login attempts. Please try again in ${waitMinutes} minute(s).`,
        429,
        {
          retryAfter: Math.ceil(rate.resetIn / 1000),
          limit: rate.limit,
          resetTime: new Date(rate.resetTime).toISOString(),
        }
      );
    }

    const body = await req.json().catch(() => null);
    const barcode = String((body as any)?.barcode || "").trim();
    const pin = String((body as any)?.pin || "").trim();

    if (!barcode || !pin) {
      await logAuditEvent({
        action: "self_checkout.login",
        status: "failure",
        actor: { username: barcode || undefined },
        ip,
        userAgent,
        requestId,
        error: "missing_credentials",
      });
      return errorResponse("Barcode and PIN are required", 400);
    }

    // Step 1: Get auth seed (authenticate by barcode directly; matches OPAC login).
    const seedRes = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.init",
      [barcode]
    );

    const seed = seedRes?.payload?.[0];
    if (!seed) {
      await logAuditEvent({
        action: "self_checkout.login",
        status: "failure",
        actor: { username: barcode },
        ip,
        userAgent,
        requestId,
        error: "seed_missing",
      });
      return errorResponse("Invalid barcode or PIN", 401);
    }

    // Step 2: Hash the PIN with the seed (Evergreen compatibility)
    const finalHash = hashPassword(pin, String(seed));

    // Step 3: Authenticate
    const authRes = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.complete",
      [{
        barcode,
        password: finalHash,
        type: "opac",
        agent: "stacksos-self-checkout",
      }]
    );

    const authResult = authRes?.payload?.[0];
    if (!authResult || authResult.ilsevent || !authResult.payload?.authtoken) {
      await logAuditEvent({
        action: "self_checkout.login",
        status: "failure",
        actor: { username: barcode },
        ip,
        userAgent,
        requestId,
        error: authResult?.textcode || authResult?.desc || "auth_failed",
      });
      return errorResponse("Invalid barcode or PIN", 401);
    }

    const authtoken = authResult.payload.authtoken;

    // Step 4: Resolve patron session (id + basic info).
    const sessionRes = await callOpenSRF("open-ils.auth", "open-ils.auth.session.retrieve", [authtoken]);
    const user = sessionRes?.payload?.[0];
    const patronId = typeof user?.id === "number" ? user.id : parseInt(String(user?.id ?? ""), 10);
    if (!Number.isFinite(patronId) || patronId <= 0) {
      await logAuditEvent({
        action: "self_checkout.login",
        status: "failure",
        actor: { username: barcode },
        ip,
        userAgent,
        requestId,
        error: "session_retrieve_failed",
      });
      return errorResponse("Authentication failed", 401);
    }

    // Optional: enrich self-checkout UI with basic counts.
    let checkoutsCount = 0;
    let holdsReady = 0;
    try {
      const [checkoutsCountRes, holdsRes] = await Promise.all([
        callOpenSRF("open-ils.actor", "open-ils.actor.user.checked_out.count", [authtoken, patronId]),
        callOpenSRF("open-ils.circ", "open-ils.circ.holds.retrieve", [authtoken, patronId]),
      ]);

      const out = checkoutsCountRes?.payload?.[0];
      checkoutsCount = typeof out?.out === "number" ? out.out : 0;

      const holds = Array.isArray(holdsRes?.payload?.[0]) ? holdsRes.payload[0] : [];
      holdsReady = holds.filter((h: any) => h?.shelf_time).length;
    } catch {
      // Best-effort; self-checkout must still function if counts fail.
    }

    // Store the auth token in a cookie for self-checkout session
    const cookieStore = await cookies();
    const cookieSecure = isCookieSecure(req);
    const maxAgeMinutesRaw = process.env.STACKSOS_SELF_CHECKOUT_SESSION_MINUTES;
    const maxAgeMinutes = Number.isFinite(Number(maxAgeMinutesRaw))
      ? Math.min(8 * 60, Math.max(5, Math.floor(Number(maxAgeMinutesRaw))))
      : 30;
    cookieStore.set("self_checkout_token", authtoken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "strict",
      maxAge: 60 * maxAgeMinutes,
      path: "/",
    });

    await logAuditEvent({
      action: "self_checkout.login",
      entity: "patron",
      entityId: patronId,
      status: "success",
      actor: { id: patronId, username: barcode },
      ip,
      userAgent,
      requestId,
      details: {
        sessionMinutes: maxAgeMinutes,
        checkoutsCount,
        holdsReady,
      },
    });

    await recordSuccess(ip || "unknown", "self-checkout-auth");

    return successResponse({
      patron: {
        id: patronId,
        barcode,
        name: `${user?.first_given_name || ""} ${user?.family_name || ""}`.trim(),
        email: user?.email || null,
        checkouts_count: checkoutsCount,
        holds_ready: holdsReady,
      },
    });

  } catch (error) {
    return serverErrorResponse(error, "Self-checkout auth", req);
  }
}

export async function DELETE(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const cookieStore = await cookies();
    const authtoken = cookieStore.get("self_checkout_token")?.value;
    const patronIdRaw = cookieStore.get("self_checkout_patron_id")?.value;
    const patronId = patronIdRaw ? parseInt(patronIdRaw, 10) : null;

    if (authtoken) {
      // End the Evergreen session
      try {
        await callOpenSRF(
          "open-ils.auth",
          "open-ils.auth.session.delete",
          [authtoken]
        );
      } catch (_error) {
        // Ignore _errors during logout
      }
    }

    // Clear cookies
    cookieStore.delete("self_checkout_token");
    cookieStore.delete("self_checkout_patron_id"); // legacy cleanup

    try {
      await logAuditEvent({
        action: "self_checkout.logout",
        entity: patronId ? "patron" : undefined,
        entityId: patronId ?? undefined,
        status: "success",
        actor: patronId ? { id: patronId } : null,
        ip,
        userAgent,
        requestId,
      });
    } catch {
      // Audit logging must never block logout.
    }

    return successResponse({ loggedOut: true });

  } catch (_error) {
    return serverErrorResponse(_error, "Self-checkout logout", req);
  }
}
