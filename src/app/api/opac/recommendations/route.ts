import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, serverErrorResponse } from "@/lib/api";
import { payloadFirst } from "@/lib/api/extract-payload";
import { logger } from "@/lib/logger";
import { getOpacPrivacyPrefs } from "@/lib/db/opac";
import { requirePatronSession } from "@/lib/opac-auth";
import { z as _z } from "zod";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("type") || "personalized";
  const bibId = searchParams.get("bibId");
  const limit = parseInt(searchParams.get("limit") || "10");

  try {
    if (type === "similar" && bibId) return await getSimilarItems(parseInt(bibId), limit);
    if (type === "while-you-wait" && bibId)
      return await getWhileYouWaitItems(parseInt(bibId), limit);
    if (type === "because_you_read" && bibId)
      return await getBecauseYouReadItems(parseInt(bibId), limit);
    if (type === "trending") return await getTrendingItems(limit);

    try {
      const { patronToken, patronId } = await requirePatronSession();
      return await getPersonalizedRecommendations(patronToken, patronId, type, limit);
    } catch {
      // Fall back to popular items for guests
    }

    return await getPopularItems(limit);
  } catch (error: unknown) {
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
  const recommendations: Record<string, any>[] = [];
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

    const holdsResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.holds.retrieve", [
      authtoken,
      patronId,
    ]);
    const holds = holdsResponse.payload?.[0] || [];
    for (const hold of holds) {
      if (hold.target) seenBibIds.add(hold.target);
    }

    const authorCounts: Record<string, number> = {};
    const recentReads: Array<{ bibId: number; title: string }> = [];

    if (prefs.readingHistoryPersonalization) {
      let allowHistory = false;
      try {
        const settingsResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.patron.settings.retrieve",
          [authtoken, patronId, ["history.circ.retention_start"]]
        );
        const raw = payloadFirst(settingsResponse) || {};
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
        for (const circ of history.slice(0, 20)) {
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
                if (mods.author) authorCounts[mods.author] = (authorCounts[mods.author] || 0) + 1;
                if (mods.title)
                  recentReads.push({ bibId: circ.target_biblio_record_entry, title: mods.title });
              }
            } catch {
              /* continue */
            }
          }
        }
      }
    }

    // "Because you read" clusters
    const sourcesForClusters =
      recentReads.length > 0 ? recentReads.slice(0, 3) : await getHoldTitles(holds.slice(0, 3));

    for (const source of sourcesForClusters) {
      const similar = await getSimilarItems(
        source.bibId,
        Math.min(4, limit - recommendations.length)
      );
      const payload = await similar.json();
      const recs = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
      for (const r of recs) {
        if (recommendations.length >= limit) break;
        if (r?.id && !seenBibIds.has(r.id)) {
          recommendations.push({
            ...r,
            reason: `Because you ${recentReads.length > 0 ? "read" : "requested"} "${source.title}"`,
            reasonType: "because_you_read",
            sourceTitle: source.title,
            sourceBibId: source.bibId,
            source: "similar",
          });
          seenBibIds.add(r.id);
        }
      }
    }

    // Top authors (reading history opt-in only)
    const topAuthors = Object.entries(authorCounts)
      .sort((a: any, b: any) => b[1] - a[1])
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
                reasonType: "favorite_author",
                source: "author",
              });
              seenBibIds.add(id);
            }
          }
        }
      }
    }

    // Fill remaining with popular items
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
                reasonType: "popular",
                source: "popular",
              });
              seenBibIds.add(id);
            }
          }
        }
      }
    }
  } catch (error: unknown) {
    logger.error({ error: String(error) }, "Error building personalized recommendations");
  }

  return successResponse({
    recommendations,
    personalized: true,
    personalization: { enabled: true, readingHistory: prefs.readingHistoryPersonalization },
  });
}

async function getHoldTitles(holds: any[]): Promise<Array<{ bibId: number; title: string }>> {
  const results: Array<{ bibId: number; title: string }> = [];
  for (const hold of holds) {
    if (!hold.target) continue;
    try {
      const modsResponse = await callOpenSRF(
        "open-ils.search",
        "open-ils.search.biblio.record.mods_slim.retrieve",
        [hold.target]
      );
      const mods = modsResponse.payload?.[0];
      if (mods?.title) results.push({ bibId: hold.target, title: mods.title });
    } catch {
      /* skip */
    }
  }
  return results;
}

async function getBecauseYouReadItems(bibId: number, limit: number) {
  let sourceTitle = "this title";
  try {
    const modsResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.record.mods_slim.retrieve",
      [bibId]
    );
    const mods = modsResponse.payload?.[0];
    if (mods?.title) sourceTitle = mods.title;
  } catch {
    /* fallback */
  }

  const similar = await getSimilarItems(bibId, limit);
  const payload = await similar.json();
  const recs = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
  const enrichedRecs = recs.map((r: any) => ({
    ...r,
    reason: `Because you read "${sourceTitle}"`,
    reasonType: "because_you_read",
    sourceTitle,
    sourceBibId: bibId,
  }));

  return successResponse({ recommendations: enrichedRecs, sourceTitle, sourceBibId: bibId });
}

async function getTrendingItems(limit: number) {
  const recommendations: Record<string, any>[] = [];
  try {
    const searchResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.multiclass.query",
      [{ limit: limit * 2, sort: ["popularity", "desc"] }, "keyword:*", 1]
    );
    const results = searchResponse.payload?.[0];
    if (results?.ids) {
      for (const idArray of results.ids) {
        if (recommendations.length >= limit) break;
        const id = Array.isArray(idArray) ? idArray[0] : idArray;
        const mods = await fetchMods(id);
        if (mods) {
          let holdCount = 0;
          try {
            const hcr = await callOpenSRF("open-ils.circ", "open-ils.circ.bre.holds.count", [id]);
            holdCount = hcr.payload?.[0] || 0;
          } catch {
            /* optional */
          }

          recommendations.push({
            ...mods,
            holdCount,
            reason:
              holdCount > 5
                ? `Trending - ${holdCount} patrons are waiting for this`
                : "Trending at your library",
            reasonType: "trending",
            source: "trending",
          });
        }
      }
    }
    recommendations.sort((a: any, b: any) => (b.holdCount || 0) - (a.holdCount || 0));
  } catch (error: unknown) {
    logger.error({ error: String(error) }, "Error getting trending items");
  }
  return successResponse({ recommendations: recommendations.slice(0, limit), type: "trending" });
}

async function getSimilarItems(bibId: number, limit: number) {
  const recommendations: Record<string, any>[] = [];
  try {
    const modsResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.record.mods_slim.retrieve",
      [bibId]
    );
    const sourceMods = modsResponse.payload?.[0];
    if (!sourceMods) return successResponse({ recommendations: [] });

    const seenBibIds = new Set<number>([bibId]);

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

    if (recommendations.length < limit) {
      try {
        const marcResponse = await callOpenSRF(
          "open-ils.supercat",
          "open-ils.supercat.record.marcxml.retrieve",
          [bibId]
        );
        const marcXml =
          typeof marcResponse?.payload?.[0] === "string" ? String(marcResponse.payload[0]) : "";
        const subjects = Array.from(
          marcXml.matchAll(
            /<datafield\s+tag="650"[\s\S]*?<subfield\s+code="a">([^<]+)<\/subfield>/g
          )
        )
          .map((m: any) => String(m[1] || "").trim())
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
        /* best-effort */
      }
    }
  } catch (error: unknown) {
    logger.error({ error: String(error) }, "Error getting similar items");
  }
  return successResponse({ recommendations });
}

async function getWhileYouWaitItems(bibId: number, limit: number) {
  return getSimilarItems(bibId, limit);
}

async function getPopularItems(limit: number) {
  return successResponse({
    recommendations: await collectPopularItems(limit),
    personalized: false,
  });
}

async function collectPopularItems(limit: number) {
  const recommendations: Record<string, any>[] = [];
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
        if (mods)
          recommendations.push({
            ...mods,
            reason: "Popular at your library",
            reasonType: "popular",
            source: "popular",
          });
      }
    }
  } catch (error: unknown) {
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
        coverUrl: mods.isbn ? `https://covers.openlibrary.org/b/isbn/${mods.isbn}-M.jpg` : null,
      };
    }
  } catch {
    /* continue */
  }
  return null;
}
