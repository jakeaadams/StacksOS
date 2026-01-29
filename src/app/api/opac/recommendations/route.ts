import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

interface RecommendationSource {
  type: "history" | "holds" | "lists" | "similar" | "popular" | "new";
  weight: number;
}

// GET /api/opac/recommendations - Get personalized recommendations
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("type") || "personalized";
  const bibId = searchParams.get("bibId"); // For similar items
  const limit = parseInt(searchParams.get("limit") || "10");

  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;
    const patronId = cookieStore.get("patron_id")?.value;

    // If getting similar items for a specific bib
    if (type === "similar" && bibId) {
      return await getSimilarItems(parseInt(bibId), limit);
    }

    // If getting "While You Wait" recommendations for a hold
    if (type === "while-you-wait" && bibId) {
      return await getWhileYouWaitItems(parseInt(bibId), limit);
    }

    // If user is logged in, get personalized recommendations
    if (patronToken && patronId) {
      return await getPersonalizedRecommendations(
        patronToken,
        parseInt(patronId),
        type,
        limit
      );
    }

    // For anonymous users, return popular/trending items
    return await getPopularItems(limit);
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching recommendations");
    return serverErrorResponse(error, "Failed to fetch recommendations");
  }
}

async function getPersonalizedRecommendations(
  authtoken: string,
  patronId: number,
  type: string,
  limit: number
) {
  const recommendations: any[] = [];
  const seenBibIds = new Set<number>();

  try {
    // 1. Get checkout history for subject/author analysis
    const historyResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.history.circ.visible",
      [authtoken, patronId]
    );
    const history = historyResponse.payload?.[0] || [];

    // 2. Get current holds
    const holdsResponse = await callOpenSRF(
      "open-ils.circ",
      "open-ils.circ.holds.retrieve",
      [authtoken, patronId]
    );
    const holds = holdsResponse.payload?.[0] || [];

    // Track bib IDs to avoid recommending items already on hold or checked out
    for (const hold of holds) {
      if (hold.target) seenBibIds.add(hold.target);
    }

    // 3. Analyze checkout history to find preferred subjects/authors
    const subjectCounts: Record<string, number> = {};
    const authorCounts: Record<string, number> = {};

    // Get bib records for recent checkouts
    const recentCheckouts = history.slice(0, 20);
    for (const circ of recentCheckouts) {
      if (circ.target_biblio_record_entry) {
        seenBibIds.add(circ.target_biblio_record_entry);

        try {
          const modsResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.record.mods_slim.retrieve",
            [circ.target_biblio_record_entry]
          );
          const mods = modsResponse.payload?.[0];
          if (mods) {
            if (mods.author) {
              authorCounts[mods.author] = (authorCounts[mods.author] || 0) + 1;
            }
            // Would also extract subjects from MARC here
          }
        } catch (error) {
          // Continue on _error
        }
      }
    }

    // 4. Find top authors and search for their other works
    const topAuthors = Object.entries(authorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([author]) => author);

    for (const author of topAuthors) {
      const searchResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.biblio.multiclass.query",
        [{ limit: 5 }, `author: ${author}`, 1]
      );

      const results = searchResponse.payload?.[0];
      if (results?.ids) {
        for (const idArray of results.ids) {
          const id = Array.isArray(idArray) ? idArray[0] : idArray;
          if (!seenBibIds.has(id) && recommendations.length < limit) {
            const modsResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.biblio.record.mods_slim.retrieve",
              [id]
            );
            const mods = modsResponse.payload?.[0];
            if (mods && !mods.ilsevent) {
              recommendations.push({
                id,
                title: mods.title,
                author: mods.author,
                isbn: mods.isbn,
                coverUrl: mods.isbn
                  ? `https://covers.openlibrary.org/b/isbn/${mods.isbn}-M.jpg`
                  : null,
                reason: `Because you read books by ${author}`,
                source: "author",
              });
              seenBibIds.add(id);
            }
          }
        }
      }
    }

    // 5. Add popular items to fill remaining slots
    if (recommendations.length < limit) {
      const popularResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.biblio.multiclass.query",
        [{ limit: limit - recommendations.length, sort: ["popularity", "desc"] }, "keyword:*", 1]
      );

      const popular = popularResponse.payload?.[0];
      if (popular?.ids) {
        for (const idArray of popular.ids) {
          const id = Array.isArray(idArray) ? idArray[0] : idArray;
          if (!seenBibIds.has(id)) {
            const modsResponse = await callOpenSRF(
              "open-ils.search",
              "open-ils.search.biblio.record.mods_slim.retrieve",
              [id]
            );
            const mods = modsResponse.payload?.[0];
            if (mods && !mods.ilsevent) {
              recommendations.push({
                id,
                title: mods.title,
                author: mods.author,
                isbn: mods.isbn,
                coverUrl: mods.isbn
                  ? `https://covers.openlibrary.org/b/isbn/${mods.isbn}-M.jpg`
                  : null,
                reason: "Popular at your library",
                source: "popular",
              });
              seenBibIds.add(id);
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error({ error: String(error) }, "Error building personalized recommendations");
  }

  return successResponse({
    recommendations,
    personalized: true,
  });
}

async function getSimilarItems(bibId: number, limit: number) {
  const recommendations: any[] = [];

  try {
    // Get the source record details
    const modsResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.record.mods_slim.retrieve",
      [bibId]
    );
    const sourceMods = modsResponse.payload?.[0];

    if (!sourceMods) {
      return successResponse({ recommendations: [] });
    }

    const seenBibIds = new Set<number>([bibId]);

    // Search for items by same author
    if (sourceMods.author) {
      const authorSearchResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.biblio.multiclass.query",
        [{ limit: 5 }, `author: ${sourceMods.author}`, 1]
      );

      const results = authorSearchResponse.payload?.[0];
      if (results?.ids) {
        for (const idArray of results.ids) {
          const id = Array.isArray(idArray) ? idArray[0] : idArray;
          if (!seenBibIds.has(id) && recommendations.length < limit) {
            const mods = await fetchMods(id);
            if (mods) {
              recommendations.push({
                ...mods,
                reason: `Also by ${sourceMods.author}`,
                source: "author",
              });
              seenBibIds.add(id);
            }
          }
        }
      }
    }

    // Would also search by subject here using MARC 650 fields
  } catch (error) {
    logger.error({ error: String(error) }, "Error getting similar items");
  }

  return successResponse({ recommendations });
}

async function getWhileYouWaitItems(bibId: number, limit: number) {
  // Similar to getSimilarItems but specifically for hold queue
  // Prioritizes available items in similar genres
  return getSimilarItems(bibId, limit);
}

async function getPopularItems(limit: number) {
  const recommendations: any[] = [];

  try {
    const searchResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.multiclass.query",
      [{ limit, sort: ["popularity", "desc"] }, "keyword:*", 1]
    );

    const results = searchResponse.payload?.[0];
    if (results?.ids) {
      for (const idArray of results.ids) {
        const id = Array.isArray(idArray) ? idArray[0] : idArray;
        const mods = await fetchMods(id);
        if (mods) {
          recommendations.push({
            ...mods,
            reason: "Popular at your library",
            source: "popular",
          });
        }
      }
    }
  } catch (error) {
    logger.error({ error: String(error) }, "Error getting popular items");
  }

  return successResponse({
    recommendations,
    personalized: false,
  });
}

async function fetchMods(bibId: number) {
  try {
    const modsResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.record.mods_slim.retrieve",
      [bibId]
    );
    const mods = modsResponse.payload?.[0];
    if (mods && !mods.ilsevent) {
      return {
        id: bibId,
        title: mods.title,
        author: mods.author,
        isbn: mods.isbn,
        coverUrl: mods.isbn
          ? `https://covers.openlibrary.org/b/isbn/${mods.isbn}-M.jpg`
          : null,
      };
    }
  } catch (error) {
    // Continue on _error
  }
  return null;
}
