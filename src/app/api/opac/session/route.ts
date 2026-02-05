import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  serverErrorResponse,
} from "@/lib/api";

import { cookies } from "next/headers";
import { getOpacPatronPrefs } from "@/lib/db/opac";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";

/**
 * OPAC Session Check
 * GET /api/opac/session
 * 
 * Checks if patron is logged in and returns patron data
 */
export async function GET(req: NextRequest) {
  try {
    const { patronToken, patronId } = await requirePatronSession();
    if (patronToken && patronId) {
      // Get patron details with card info
      const patronResponse = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.fleshed.retrieve",
        [patronToken, patronId, ["card", "cards", "home_ou", "profile"]]
      );

      const patron = patronResponse?.payload?.[0];
      
      if (patron && !patron.ilsevent) {
        // Get checkout count
        const checkoutsResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.user.checked_out.count",
          [patronToken, patronId]
        );

        // Get holds count
        const holdsResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.holds.retrieve",
          [patronToken, patronId]
        );

        const holds = Array.isArray(holdsResponse?.payload?.[0]) 
          ? holdsResponse.payload[0] 
          : [];

        // Get fine balance
        const finesResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.user.fines.summary",
          [patronToken, patronId]
        );

        const finesSummary = finesResponse?.payload?.[0];
        const prefs = await getOpacPatronPrefs(patronId);

        return successResponse({
          authenticated: true,
          patron: {
            id: patron.id,
            firstName: patron.first_given_name,
            lastName: patron.family_name,
            email: patron.email,
            phone: patron.day_phone || patron.evening_phone,
            cardNumber: patron.card?.barcode,
            homeLibrary: patron.home_ou,
            profileName: patron.profile?.name,
            expireDate: patron.expire_date,
            checkoutCount: checkoutsResponse?.payload?.[0]?.out || 0,
            holdCount: holds.length,
            readyHoldsCount: holds.filter((h: any) => h.shelf_time).length,
            fineBalance: parseFloat(finesSummary?.balance_owed || "0"),
            defaultPickupLocation: prefs.defaultPickupLocation,
            defaultSearchLocation: prefs.defaultSearchLocation,
          },
        });
      }
    }

    // Session invalid, clear cookie
    const cookieStore = await cookies();
    cookieStore.delete("patron_authtoken");
    return successResponse({ authenticated: false, patron: null });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      const cookieStore = await cookies();
      cookieStore.delete("patron_authtoken");
      return successResponse({ authenticated: false, patron: null });
    }
    return serverErrorResponse(error, "OPAC Session GET", req);
  }
}
