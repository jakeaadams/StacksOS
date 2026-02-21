import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { callOpenSRF, errorResponse, getRequestMeta, successResponse, serverErrorResponse } from "@/lib/api";
import { requireSelfCheckoutSession, SelfCheckoutAuthError } from "@/lib/self-checkout-auth";
import { logAuditEvent } from "@/lib/audit";

/**
 * Self-Checkout Item Checkout
 * Handles item checkout for authenticated self-checkout patrons
 */

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const { selfCheckoutToken: authtoken, patronId } = await requireSelfCheckoutSession();
    const body = await req.json().catch(() => null);
    const itemBarcode = String((body as any)?.itemBarcode || "").trim();

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

      let status = 400;
      let message = result.desc || result.textcode || "Checkout failed";

      if (textCode === "COPY_NOT_AVAILABLE") message = "This item is not available for checkout";
      else if (textCode === "PATRON_EXCEEDS_CHECKOUT_COUNT") message = "You have reached your checkout limit";
      else if (textCode === "PATRON_EXCEEDS_FINES") message = "Please pay outstanding fines before checking out";
      else if (textCode === "COPY_IN_TRANSIT") message = "This item is in transit to another library";
      else if (textCode === "COPY_STATUS_LOST" || textCode === "COPY_STATUS_MISSING") message = "This item is marked as lost or missing";
      else if (textCode === "ITEM_NOT_CATALOGED") message = "This item is not in our catalog";
      else if (textCode === "ASSET_COPY_NOT_FOUND") {
        message = "Item not found. Please check the barcode.";
        status = 404;
      }

      try {
        await logAuditEvent({
          action: "self_checkout.checkout",
          entity: "copy",
          entityId: itemBarcode,
          status: "failure",
          actor: { id: patronId },
          ip,
          userAgent,
          requestId,
          error: String(textCode || "checkout_failed"),
          details: {
            patronId,
            itemBarcode,
            textCode: textCode || null,
            message,
          },
        });
      } catch {
        // ignore
      }

      return errorResponse(message, status);
    }

    // Get item details for display
    let title = "Unknown Title";
    let author = "";
    let dueDate = "";

    if (result.circ) {
      dueDate = result.circ.due_date;
    }
    const circId =
      typeof result?.circ?.id === "number" ? result.circ.id : parseInt(String(result?.circ?.id ?? ""), 10);

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

    try {
      await logAuditEvent({
        action: "self_checkout.checkout",
        entity: "copy",
        entityId: itemBarcode,
        status: "success",
        actor: { id: patronId },
        ip,
        userAgent,
        requestId,
        details: {
          patronId,
          itemBarcode,
          title,
          dueDate,
        },
      });
    } catch {
      // Audit logging must never block checkout.
    }

    return successResponse({
      checkout: {
        circId: Number.isFinite(circId) ? circId : null,
        barcode: itemBarcode,
        title,
        author,
        dueDate,
      },
    });

  } catch (error) {
    if (error instanceof SelfCheckoutAuthError) {
      console.error("Route /api/opac/self-checkout auth failed:", error);
      return errorResponse("Authentication required", 401);
    }

    // Best-effort audit event for unhandled failures (never blocks response).
    console.error("Route /api/opac/self-checkout failed:", error);
    try {
      await logAuditEvent({
        action: "self_checkout.checkout",
        status: "failure",
        actor: null,
        ip,
        userAgent,
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // ignore
    }

    return serverErrorResponse(error, "Self-checkout item", req);
  }
}

export async function DELETE(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const cookieStore = await cookies();
    const authtoken = cookieStore.get("self_checkout_token")?.value;

    let patronId: number | null = null;

    if (authtoken) {
      try {
        const sessionRes = await callOpenSRF("open-ils.auth", "open-ils.auth.session.retrieve", [authtoken]);
        const user = sessionRes?.payload?.[0];
        const parsed = typeof user?.id === "number" ? user.id : parseInt(String(user?.id ?? ""), 10);
        patronId = Number.isFinite(parsed) ? parsed : null;
      } catch {
        // ignore
      }

      try {
        await callOpenSRF("open-ils.auth", "open-ils.auth.session.delete", [authtoken]);
      } catch {
        // ignore
      }
    }

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
      // ignore
    }

    return successResponse({ loggedOut: true });
  } catch (error) {
    return serverErrorResponse(error, "Self-checkout logout", req);
  }
}
