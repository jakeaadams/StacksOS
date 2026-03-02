import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";

/**
 * Enrich a raw circulation history item with bib details (title, author, etc.).
 */
async function enrichHistoryItem(circ: any) {
  let title = "Unknown Title";
  let author = "";
  let coverUrl = null;
  let isbn = "";

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
        coverUrl = isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : null;
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
    renewalCount: circ.renewal_remaining ? 3 - circ.renewal_remaining : 0,
  };
}

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

    const rawHistory: any[] = historyResponse.payload?.[0] || [];

    // --- Text search requires enrichment on ALL items (fallback to old path) ---
    // Note: text search (q param) requires bib enrichment to search by title/author,
    // so when a query is present we must enrich everything first, then filter + paginate.
    // When there's no query, we paginate raw data first and only enrich the current page.
    if (query) {
      // Fallback: enrich all, then filter, sort, paginate (old behavior)
      const processedHistory = await Promise.all(rawHistory.map(enrichHistoryItem));

      // Filter by year
      let filteredHistory = processedHistory;
      if (year) {
        filteredHistory = processedHistory.filter((item) => {
          const itemYear = new Date(item.checkoutDate).getFullYear();
          return itemYear === parseInt(year);
        });
      }

      // Filter by search query
      const q = query.toLowerCase();
      filteredHistory = filteredHistory.filter(
        (item) => item.title.toLowerCase().includes(q) || item.author.toLowerCase().includes(q)
      );

      // Sort
      if (sort === "title") {
        filteredHistory.sort((a, b) => a.title.localeCompare(b.title));
      } else if (sort === "author") {
        filteredHistory.sort((a, b) => a.author.localeCompare(b.author));
      } else {
        filteredHistory.sort(
          (a, b) => new Date(b.checkoutDate).getTime() - new Date(a.checkoutDate).getTime()
        );
      }

      // Stats (computed from full enriched set)
      const stats = computeStats(processedHistory);

      // Paginate
      const offset = (page - 1) * limit;
      const paginatedHistory = filteredHistory.slice(offset, offset + limit);

      return successResponse({
        history: paginatedHistory,
        stats,
        total: filteredHistory.length,
        historyEnabled: true,
      });
    }

    // --- Optimized path: sort/filter/paginate raw data BEFORE enrichment ---

    // Sort raw items by date (default, most common sort).
    // For title/author sort, we must enrich first, so fall through to full enrichment.
    if (sort === "title" || sort === "author") {
      // These sorts require bib data; enrich all then sort + paginate.
      const processedHistory = await Promise.all(rawHistory.map(enrichHistoryItem));

      let filteredHistory = processedHistory;
      if (year) {
        filteredHistory = processedHistory.filter((item) => {
          const itemYear = new Date(item.checkoutDate).getFullYear();
          return itemYear === parseInt(year);
        });
      }

      if (sort === "title") {
        filteredHistory.sort((a, b) => a.title.localeCompare(b.title));
      } else {
        filteredHistory.sort((a, b) => a.author.localeCompare(b.author));
      }

      const stats = computeStats(processedHistory);
      const offset = (page - 1) * limit;
      const paginatedHistory = filteredHistory.slice(offset, offset + limit);

      return successResponse({
        history: paginatedHistory,
        stats,
        total: filteredHistory.length,
        historyEnabled: true,
      });
    }

    // Date sort (default): can be done on raw xact_start without enrichment
    let sortedRaw = [...rawHistory];
    sortedRaw.sort(
      (a: any, b: any) => new Date(b.xact_start).getTime() - new Date(a.xact_start).getTime()
    );

    // Filter by year on raw data
    if (year) {
      sortedRaw = sortedRaw.filter(
        (item: any) => new Date(item.xact_start).getFullYear() === parseInt(year)
      );
    }

    const totalFiltered = sortedRaw.length;

    // Paginate RAW data first (much fewer API calls)
    const offset = (page - 1) * limit;
    const paginatedRaw = sortedRaw.slice(offset, offset + limit);

    // Only enrich the current page
    const processedHistory = await Promise.all(paginatedRaw.map(enrichHistoryItem));

    // Calculate stats from raw data (no enrichment needed for counts)
    const stats = computeStatsFromRaw(rawHistory);

    return successResponse({
      history: processedHistory,
      stats,
      total: totalFiltered,
      historyEnabled: true,
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      logger.warn({ error: String(error) }, "Route /api/opac/history auth failed");
      return errorResponse("Authentication required", 401);
    }
    logger.error({ error: String(error) }, "Error fetching history");
    return serverErrorResponse(error, "Failed to fetch reading history", req);
  }
}

/**
 * Compute reading stats from enriched history items (includes favoriteAuthor).
 */
function computeStats(processedHistory: { checkoutDate: string; author: string }[]) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const authorCounts: Record<string, number> = {};
  processedHistory.forEach((item) => {
    if (item.author) {
      authorCounts[item.author] = (authorCounts[item.author] || 0) + 1;
    }
  });
  const favoriteAuthor = Object.entries(authorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const thisYearItems = processedHistory.filter(
    (item) => new Date(item.checkoutDate).getFullYear() === thisYear
  );
  const thisMonthItems = processedHistory.filter((item) => {
    const d = new Date(item.checkoutDate);
    return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
  });

  const sortedByDate = [...processedHistory].sort(
    (a, b) => new Date(a.checkoutDate).getTime() - new Date(b.checkoutDate).getTime()
  );
  const firstCheckout = sortedByDate[0]?.checkoutDate
    ? new Date(sortedByDate[0].checkoutDate)
    : now;
  const monthsActive = Math.max(
    1,
    Math.ceil((now.getTime() - firstCheckout.getTime()) / (30 * 24 * 60 * 60 * 1000))
  );

  return {
    totalBooksRead: processedHistory.length,
    totalThisYear: thisYearItems.length,
    totalThisMonth: thisMonthItems.length,
    averagePerMonth: Math.round(processedHistory.length / monthsActive),
    favoriteAuthor,
    longestStreak: 0,
  };
}

/**
 * Compute reading stats from raw (unenriched) history items.
 * favoriteAuthor is null because we don't have bib data without enrichment.
 */
function computeStatsFromRaw(rawHistory: any[]) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const thisYearCount = rawHistory.filter(
    (c: any) => new Date(c.xact_start).getFullYear() === thisYear
  ).length;

  const thisMonthCount = rawHistory.filter((c: any) => {
    const d = new Date(c.xact_start);
    return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
  }).length;

  const sortedByDate = [...rawHistory].sort(
    (a: any, b: any) => new Date(a.xact_start).getTime() - new Date(b.xact_start).getTime()
  );
  const firstCheckout = sortedByDate[0]?.xact_start ? new Date(sortedByDate[0].xact_start) : now;
  const monthsActive = Math.max(
    1,
    Math.ceil((now.getTime() - firstCheckout.getTime()) / (30 * 24 * 60 * 60 * 1000))
  );

  return {
    totalBooksRead: rawHistory.length,
    totalThisYear: thisYearCount,
    totalThisMonth: thisMonthCount,
    averagePerMonth: Math.round(rawHistory.length / monthsActive),
    // favoriteAuthor requires bib enrichment; null in optimized path
    favoriteAuthor: null,
    longestStreak: 0,
  };
}
