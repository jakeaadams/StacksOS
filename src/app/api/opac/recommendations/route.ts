import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  serverErrorResponse,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { getOpacPrivacyPrefs } from "@/lib/db/opac";
import { requirePatronSession } from "@/lib/opac-auth";

// GET /api/opac/recommendations - Get personalized recommendations
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("type") || "personalized";
  const bibId = searchParams.get("bibId"); // For similar items
  const limit = parseInt(searchParams.get("limit") || "10");

  try {
    // If getting similar items for a specific bib
    if (type === "similar" && bibId) {
      return await getSimilarItems(parseInt(bibId), limit);
    }

    // If getting "While You Wait" recommendations for a hold
    if (type === "while-you-wait" && bibId) {
      return await getWhileYouWaitItems(parseInt(bibId), limit);
    }

    // If user is logged in, optionally return personalized recommendations (opt-in).
    try {
      const { patronToken, patronId } = await requirePatronSession();
      return await getPersonalizedRecommendations(patronToken, patronId, type, limit);
    } catch {
      // Treat missing/expired session as "guest" and fall back to popular items.
    }

    return await getPopularItems(limit);
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching recommendations");
    return serverErrorResponse(error, "Failed to fetch recommendations", req);
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
  const prefs = await getOpacPrivacyPrefs(patronId);

  try {
    if (!prefs.personalizedRecommendations) {
      return successResponse({
        recommendations: await collectPopularItems(limit),
        personalized: false,
        disabledReason: "Personalized recommendations are disabled in your Privacy settings.",
      });
    }

    // 1) Current holds (safe personalization)
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

    // 2) Optional reading-history personalization (explicit opt-in)
    const authorCounts: Record<string, number> = {};

    if (prefs.readingHistoryPersonalization) {
      let allowHistory = false;
      // Respect Evergreen reading-history setting as an additional guardrail.
      try {
        const settingsResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.patron.settings.retrieve",
          [authtoken, patronId, ["history.circ.retention_start"]]
        );
        const raw = settingsResponse?.payload?.[0] || {};
        allowHistory = raw["history.circ.retention_start"] != null;
      } catch {
        allowHistory = false;
      }

      if (allowHistory) {
        const historyResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.history.circ.visible",
          [authtoken, patronId]
        );
        const history = historyResponse.payload?.[0] || [];

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
              if (mods && mods.author) {
                authorCounts[mods.author] = (authorCounts[mods.author] || 0) + 1;
              }
            } catch {
              // Continue on _error
            }
          }
        }
      }
    }

    // 3) "More like this" from current holds (metadata-only)
    for (const hold of holds.slice(0, 3)) {
      if (!hold.target) continue;
      const similar = await getSimilarItems(Number(hold.target), Math.min(4, limit - recommendations.length));
      const payload = await similar.json();
      const recs = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
      for (const r of recs) {
        if (recommendations.length >= limit) break;
        if (r?.id && !seenBibIds.has(r.id)) {
          recommendations.push({
            ...r,
            reason: r.reason || "Similar to an item you requested",
            source: "similar",
          });
          seenBibIds.add(r.id);
        }
      }
    }

    // 4) Top authors (only if reading history opt-in is enabled)
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
    personalization: {
      enabled: true,
      readingHistory: prefs.readingHistoryPersonalization,
    },
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

    // Search by a few subject headings (MARC 650$a) as a metadata-only "more like this"
    if (recommendations.length < limit) {
      try {
        const marcResponse = await callOpenSRF(
          "open-ils.supercat",
          "open-ils.supercat.record.marcxml.retrieve",
          [bibId]
        );
        const marcXml = typeof marcResponse?.payload?.[0] === "string" ? String(marcResponse.payload[0]) : "";
        const subjects = Array.from(
          marcXml.matchAll(/<datafield\s+tag="650"[\s\S]*?<subfield\s+code="a">([^<]+)<\/subfield>/g)
        )
          .map((m) => String(m[1] || "").trim())
          .filter(Boolean)
          .slice(0, 3);

        for (const subject of subjects) {
          if (recommendations.length >= limit) break;
          const subjSearchResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.multiclass.query",
            [{ limit: 5 }, `subject: ${subject}`, 1]
          );
          const results = subjSearchResponse.payload?.[0];
          if (!results?.ids) continue;
          for (const idArray of results.ids) {
            const id = Array.isArray(idArray) ? idArray[0] : idArray;
            if (!seenBibIds.has(id) && recommendations.length < limit) {
              const mods = await fetchMods(id);
              if (mods) {
                recommendations.push({
                  ...mods,
                  reason: `Similar subject: ${subject}`,
                  source: "subject",
                });
                seenBibIds.add(id);
              }
            }
          }
        }
      } catch {
        // Best-effort: subject extraction failures should not break recs.
      }
    }
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
  const recommendations = await collectPopularItems(limit);
  return successResponse({
    recommendations,
    personalized: false,
  });
}

async function collectPopularItems(limit: number) {
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

  return recommendations;
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
  } catch {
    // Continue on error
  }
  return null;
}
