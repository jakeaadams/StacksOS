import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { callOpenSRF, successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { createHash } from "crypto";
import { isCookieSecure } from "@/lib/csrf";

/**
 * Self-Checkout Patron Authentication
 * Authenticates patrons for self-checkout using barcode and PIN
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { barcode, pin } = body;

    if (!barcode || !pin) {
      return errorResponse("Barcode and PIN are required", 400);
    }

    // Step 1: Get the patron by barcode to find username
    const patronRes = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.fleshed.retrieve_by_barcode",
      [null, barcode]
    );

    const patron = patronRes?.payload?.[0];
    if (!patron || patron.ilsevent) {
      return errorResponse("Invalid barcode", 401);
    }

    const username = patron.usrname;
    const patronId = patron.id;

    // Step 2: Get auth seed
    const seedRes = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.init",
      [username]
    );

    const seed = seedRes?.payload?.[0];
    if (!seed) {
      return errorResponse("Authentication failed", 401);
    }

    // Step 3: Hash the PIN with the seed (MD5)
    const pinHash = createHash("md5").update(pin).digest("hex");
    const finalHash = createHash("md5").update(seed + pinHash).digest("hex");

    // Step 4: Authenticate
    const authRes = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.complete",
      [{
        username,
        password: finalHash,
        type: "opac",
      }]
    );

    const authResult = authRes?.payload?.[0];
    if (!authResult || authResult.ilsevent || !authResult.payload?.authtoken) {
      return errorResponse("Invalid PIN", 401);
    }

    const authtoken = authResult.payload.authtoken;

    // Store the auth token in a cookie for self-checkout session
    const cookieStore = await cookies();
    const cookieSecure = isCookieSecure(req);
    cookieStore.set("self_checkout_token", authtoken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "strict",
      maxAge: 60 * 30, // 30 minutes
      path: "/",
    });

    cookieStore.set("self_checkout_patron_id", String(patronId), {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "strict",
      maxAge: 60 * 30, // 30 minutes
      path: "/",
    });

    return successResponse({
      patron: {
        id: patronId,
        barcode: patron.card?.barcode || barcode,
        name: `${patron.first_given_name || ""} ${patron.family_name || ""}`.trim(),
        email: patron.email,
      },
    });

  } catch (error) {
    return serverErrorResponse(error, "Self-checkout auth", req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authtoken = cookieStore.get("self_checkout_token")?.value;

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
    cookieStore.delete("self_checkout_patron_id");

    return successResponse({ loggedOut: true });

  } catch (_error) {
    return serverErrorResponse(_error, "Self-checkout logout", req);
  }
}
