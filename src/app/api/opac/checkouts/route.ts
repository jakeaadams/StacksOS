import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { z } from "zod";

/**
 * OPAC Patron Checkouts
 * GET /api/opac/checkouts
 */
export async function GET(req: NextRequest) {
  try {
    const { patronToken, patronId } = await requirePatronSession();

    // Get checked out items
    const checkoutsResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.checked_out",
      [patronToken, patronId]
    );

    const checkoutData = checkoutsResponse?.payload?.[0];
    
    // Combine all checkout types
    const allCircIds = [
      ...(checkoutData?.out || []),
      ...(checkoutData?.overdue || []),
      ...(checkoutData?.lost || []),
      ...(checkoutData?.long_overdue || []),
      ...(checkoutData?.claims_returned || []),
    ];

    if (allCircIds.length === 0) {
      return successResponse({ checkouts: [], total: 0 });
    }

    // Get detailed circulation info for each checkout
    const checkouts = await Promise.all(
      allCircIds.map(async (circId: number) => {
        try {
          const circResponse = await callOpenSRF(
            "open-ils.circ",
            "open-ils.circ.retrieve",
            [patronToken, circId]
          );

          const circ = circResponse?.payload?.[0];
          if (!circ || circ.ilsevent) return null;

          // Get the copy info
          const copyResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.asset.copy.retrieve",
            [circ.target_copy]
          );

          const copy = copyResponse?.payload?.[0];

          // Get bib info from copy
          let title = "Unknown Title";
          let author = "";
          let recordId = null;
          let isbn = null;
          let coverUrl: string | null = null;

          if (copy?.call_number) {
            const volumeResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.asset.call_number.retrieve",
              [copy.call_number]
            );

            const volume = volumeResponse?.payload?.[0];
            if (volume?.record) {
              recordId = volume.record;

              const bibResponse = await callOpenSRF(
                "open-ils.search",
                "open-ils.search.biblio.record.mods_slim.retrieve",
                [volume.record]
              );

              const bib = bibResponse?.payload?.[0];
              if (bib) {
                title = bib.title || "Unknown Title";
                author = bib.author || "";
                isbn = bib.isbn;
                const cleaned = typeof isbn === "string" ? isbn.replace(/[^0-9Xx]/g, "") : "";
                coverUrl = cleaned ? `https://covers.openlibrary.org/b/isbn/${cleaned}-M.jpg` : null;
              }
            }
          }

          const dueDate = new Date(circ.due_date);
          const now = new Date();
          const isOverdue = dueDate < now && !circ.checkin_time;

          return {
            id: circId,
            recordId,
            title,
            author,
            isbn,
            coverUrl,
            barcode: copy?.barcode || "",
            dueDate: circ.due_date,
            checkoutDate: circ.xact_start,
            renewalsRemaining: circ.renewal_remaining,
            isOverdue,
            format: "book",
          };
        } catch (error) {
          logger.error({ error: String(error) }, "Error fetching checkout details");
          return null;
        }
      })
    );

    const validCheckouts = checkouts.filter(Boolean);

    return successResponse({
      checkouts: validCheckouts,
      total: validCheckouts.length,
      overdueCount: checkoutData?.overdue?.length || 0,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/checkouts auth failed:", error);
      return unauthorizedResponse();
    }
    return serverErrorResponse(error, "OPAC Checkouts GET", req);
  }
}
