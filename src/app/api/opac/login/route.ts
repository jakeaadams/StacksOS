import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";
import { hashPassword } from "@/lib/password";

/**
 * OPAC Patron Login
 * POST /api/opac/login
 * 
 * Authenticates patron using library card barcode and PIN
 */
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  // Rate limiting - 10 attempts per 15 minutes per IP
  const rateLimit = checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    endpoint: "patron-auth",
  });

  if (\!rateLimit.allowed) {
    const waitMinutes = Math.ceil(rateLimit.resetIn / 60000);
    logger.warn({ ip, requestId, rateLimit }, "Patron auth rate limit exceeded");
    
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
    const { barcode, pin, rememberMe } = await req.json();

    if (\!barcode || \!pin) {
      return errorResponse("Library card number and PIN are required", 400);
    }

    const cleanBarcode = String(barcode).trim();
    const cleanPin = String(pin).trim();

    logger.info({ route: "api.opac.login", barcode: cleanBarcode }, "OPAC login attempt");

    // Step 1: Get auth seed using barcode
    const seedResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.init",
      [cleanBarcode]
    );

    const seed = seedResponse?.payload?.[0];
    if (\!seed) {
      logger.warn({ route: "api.opac.login", barcode: cleanBarcode }, "Failed to get auth seed");
      return errorResponse("Invalid library card number or PIN", 401);
    }

    // Step 2: Hash PIN using MD5 (Evergreen compatibility)
    const finalHash = hashPassword(cleanPin, seed);

    // Step 3: Authenticate as OPAC user
    const authResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.complete",
      [{
        username: cleanBarcode,
        password: finalHash,
        type: "opac",
        identifier: "barcode",
      }]
    );

    const authResult = authResponse?.payload?.[0];

    if (authResult?.ilsevent === 0 && authResult?.payload?.authtoken) {
      const cookieStore = await cookies();
      const cookieSecure = process.env.NODE_ENV === "production";
      
      cookieStore.set("patron_authtoken", authResult.payload.authtoken, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: "lax",
        maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8,
      });

      const userResponse = await callOpenSRF(
        "open-ils.auth",
        "open-ils.auth.session.retrieve",
        [authResult.payload.authtoken]
      );

      const user = userResponse?.payload?.[0];

      if (user && \!user.ilsevent) {
        const patronResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.user.fleshed.retrieve",
          [authResult.payload.authtoken, user.id, ["card", "home_ou", "profile"]]
        );

        const patron = patronResponse?.payload?.[0];

        logger.info({ route: "api.opac.login", patronId: user.id }, "OPAC login successful");

        return successResponse({
          success: true,
          patron: {
            id: patron?.id || user.id,
            firstName: patron?.first_given_name || user.first_given_name,
            lastName: patron?.family_name || user.family_name,
            email: patron?.email,
            barcode: cleanBarcode,
            homeLibrary: patron?.home_ou,
            profileName: patron?.profile?.name,
          },
        });
      }
    }

    logger.warn({ route: "api.opac.login", barcode: cleanBarcode, error: authResult?.textcode }, "OPAC login failed");
    return errorResponse("Invalid library card number or PIN", 401);
  } catch (error) {
    return serverErrorResponse(error, "OPAC Login POST", req);
  }
}
