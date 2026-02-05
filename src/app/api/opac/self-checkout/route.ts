import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { callOpenSRF, successResponse, errorResponse, serverErrorResponse } from "@/lib/api";

/**
 * Self-Checkout Item Checkout
 * Handles item checkout for authenticated self-checkout patrons
 */

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authtoken = cookieStore.get("self_checkout_token")?.value;
    const patronIdStr = cookieStore.get("self_checkout_patron_id")?.value;

    if (!authtoken || !patronIdStr) {
      return errorResponse("Session expired. Please scan your card again.", 401);
    }

    const patronId = parseInt(patronIdStr, 10);
    const body = await req.json();
    const { itemBarcode } = body;

    if (!itemBarcode) {
      return errorResponse("Item barcode is required", 400);
    }

    // Perform the checkout
    const checkoutRes = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.checkout.full",
      [
        authtoken,
        {
          patron: patronId,
          copy_barcode: itemBarcode,
        },
      ]
    );

    const result = checkoutRes?.payload?.[0];

    if (!result) {
      return errorResponse("Checkout failed - no response", 500);
    }

    // Check for errors
    if (result.ilsevent) {
      // Handle specific error codes
      const textCode = result.textcode;

      if (textCode === "COPY_NOT_AVAILABLE") {
        return errorResponse("This item is not available for checkout", 400);
      }
      if (textCode === "PATRON_EXCEEDS_CHECKOUT_COUNT") {
        return errorResponse("You have reached your checkout limit", 400);
      }
      if (textCode === "PATRON_EXCEEDS_FINES") {
        return errorResponse("Please pay outstanding fines before checking out", 400);
      }
      if (textCode === "COPY_IN_TRANSIT") {
        return errorResponse("This item is in transit to another library", 400);
      }
      if (textCode === "COPY_STATUS_LOST" || textCode === "COPY_STATUS_MISSING") {
        return errorResponse("This item is marked as lost or missing", 400);
      }
      if (textCode === "ITEM_NOT_CATALOGED") {
        return errorResponse("This item is not in our catalog", 400);
      }
      if (textCode === "ASSET_COPY_NOT_FOUND") {
        return errorResponse("Item not found. Please check the barcode.", 404);
      }

      return errorResponse(result.desc || result.textcode || "Checkout failed", 400);
    }

    // Get item details for display
    let title = "Unknown Title";
    let author = "";
    let dueDate = "";

    if (result.circ) {
      dueDate = result.circ.due_date;
    }

    // Try to get the title from the copy/bib
    if (result.copy) {
      try {
        const volumeId = result.copy.call_number;
        if (volumeId && typeof volumeId === "object" && volumeId.record) {
          const bibId = volumeId.record;
          const bibRes = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.record.mods_slim.retrieve",
            [bibId]
          );
          const bib = bibRes?.payload?.[0];
          if (bib) {
            title = bib.title || title;
            author = bib.author || "";
          }
        }
      } catch {
        // Use default title if lookup fails
      }
    }

    return successResponse({
      checkout: {
        barcode: itemBarcode,
        title,
        author,
        dueDate,
      },
    });

  } catch (error) {
    return serverErrorResponse(error, "Self-checkout item", req);
  }
}

export async function DELETE(req: NextRequest) {
  // Logout - clear session (delegates to auth route)
  try {
    const cookieStore = await cookies();
    const authtoken = cookieStore.get("self_checkout_token")?.value;

    if (authtoken) {
      try {
        await callOpenSRF(
          "open-ils.auth",
          "open-ils.auth.session.delete",
          [authtoken]
        );
      } catch {
        // Ignore _errors during logout
      }
    }

    cookieStore.delete("self_checkout_token");
    cookieStore.delete("self_checkout_patron_id");

    return successResponse({ loggedOut: true });

  } catch (error) {
    return serverErrorResponse(error, "Self-checkout logout", req);
  }
}
