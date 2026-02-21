import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";

// GET /api/opac/history - Get patron reading history
export async function GET(req: NextRequest) {
  try {
    const { patronToken, patronId } = await requirePatronSession();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sort = searchParams.get("sort") || "date";
    const year = searchParams.get("year");
    const query = searchParams.get("q");

    // Note: Reading history must be enabled in Evergreen patron settings
    // Check if history is enabled
    const settingsResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.patron.settings.retrieve",
      [patronToken, patronId, ["history.circ.retention_start"]]
    );

    const settings = settingsResponse.payload?.[0] || {};
    const historyEnabled = settings["history.circ.retention_start"] !== null;

    if (!historyEnabled) {
      return successResponse({
        history: [],
        stats: null,
        total: 0,
        historyEnabled: false,
        message: "Reading history is not enabled for your account. Visit a branch to enable it.",
      });
    }

    // Get circulation history
    const historyResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.history.circ.visible",
      [patronToken, patronId]
    );

    const rawHistory = historyResponse.payload?.[0] || [];

    // Process and enrich history items
    const processedHistory = await Promise.all(
      rawHistory.map(async (circ: any) => {
        let title = "Unknown Title";
        let author = "";
        let coverUrl = null;
        let isbn = "";

        // Get bib details
        if (circ.target_biblio_record_entry) {
          try {
            const modsResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.biblio.record.mods_slim.retrieve",
              [circ.target_biblio_record_entry]
            );
            const mods = modsResponse.payload?.[0];
            if (mods && !mods.ilsevent) {
              title = mods.title || title;
              author = mods.author || "";
              isbn = mods.isbn || "";
              coverUrl = isbn
                ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`
                : null;
            }
          } catch (_error) {
            // Continue with unknown title
          }
        }

        return {
          id: circ.id,
          bibId: circ.target_biblio_record_entry,
          title,
          author,
          isbn,
          coverUrl,
          checkoutDate: circ.xact_start,
          returnDate: circ.checkin_time,
          dueDate: circ.due_date,
          renewalCount: circ.renewal_remaining
            ? 3 - circ.renewal_remaining
            : 0,
        };
      })
    );

    // Filter by year
    let filteredHistory = processedHistory;
    if (year) {
      filteredHistory = processedHistory.filter((item) => {
        const itemYear = new Date(item.checkoutDate).getFullYear();
        return itemYear === parseInt(year);
      });
    }

    // Filter by search query
    if (query) {
      const q = query.toLowerCase();
      filteredHistory = filteredHistory.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.author.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sort === "title") {
      filteredHistory.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "author") {
      filteredHistory.sort((a, b) => a.author.localeCompare(b.author));
    } else {
      // Default: date (most recent first)
      filteredHistory.sort(
        (a, b) =>
          new Date(b.checkoutDate).getTime() - new Date(a.checkoutDate).getTime()
      );
    }

    // Calculate stats
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    const authorCounts: Record<string, number> = {};
    processedHistory.forEach((item) => {
      if (item.author) {
        authorCounts[item.author] = (authorCounts[item.author] || 0) + 1;
      }
    });

    const favoriteAuthor = Object.entries(authorCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    const thisYearItems = processedHistory.filter(
      (item) => new Date(item.checkoutDate).getFullYear() === thisYear
    );

    const thisMonthItems = processedHistory.filter((item) => {
      const d = new Date(item.checkoutDate);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });

    // Calculate months since first checkout
    const sortedByDate = [...processedHistory].sort(
      (a, b) =>
        new Date(a.checkoutDate).getTime() - new Date(b.checkoutDate).getTime()
    );
    const firstCheckout = sortedByDate[0]?.checkoutDate
      ? new Date(sortedByDate[0].checkoutDate)
      : now;
    const monthsActive = Math.max(
      1,
      Math.ceil(
        (now.getTime() - firstCheckout.getTime()) / (30 * 24 * 60 * 60 * 1000)
      )
    );

    const stats = {
      totalBooksRead: processedHistory.length,
      totalThisYear: thisYearItems.length,
      totalThisMonth: thisMonthItems.length,
      averagePerMonth: Math.round(processedHistory.length / monthsActive),
      favoriteAuthor,
      longestStreak: 0, // Would calculate consecutive months with checkouts
    };

    // Paginate
    const offset = (page - 1) * limit;
    const paginatedHistory = filteredHistory.slice(offset, offset + limit);

    return successResponse({
      history: paginatedHistory,
      stats,
      total: filteredHistory.length,
      historyEnabled: true,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      console.error("Route /api/opac/history auth failed:", error);
      return errorResponse("Authentication required", 401);
    }
    logger.error({ error: String(error) }, "Error fetching history");
    return serverErrorResponse(error, "Failed to fetch reading history", req);
  }
}
