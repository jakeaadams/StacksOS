import { NextRequest } from "next/server";
import { z } from "zod";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateAiJson, safeUserText } from "@/lib/ai";
import {
  buildNaturalLanguageSearchPrompt,
  buildAiSearchExplanationPrompt,
  buildSemanticRerankPrompt,
} from "@/lib/ai/prompts";

// ---------------------------------------------------------------------------
// Zod schemas for AI responses
// ---------------------------------------------------------------------------

const aiSearchDecomposeSchema = z.object({
  keywords: z.array(z.string()).max(5).default([]),
  subjects: z.array(z.string()).max(5).default([]),
  author: z.string().nullable().default(null),
  audience: z.enum(["adult", "young_adult", "juvenile"]).nullable().default(null),
  format: z.enum(["book", "ebook", "audiobook", "dvd", "serial"]).nullable().default(null),
  language: z.string().nullable().default(null),
  searchQuery: z.string().min(1),
});

const aiSearchExplanationSchema = z.object({
  explanations: z.array(
    z.object({
      id: z.number().int(),
      explanation: z.string().max(200),
    })
  ),
});

const semanticRerankSchema = z.object({
  ranked: z
    .array(
      z.object({
        id: z.number().int().positive(),
        score: z.number().min(0).max(1),
        reason: z.string().min(1),
      })
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// GET /api/evergreen/ai-search?q=...
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const rawQuery = (req.nextUrl.searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20, 50);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10) || 0;

  if (!rawQuery) {
    return errorResponse("Missing search query (q)", 400);
  }
  if (rawQuery.length > 500) {
    return errorResponse("Query too long (max 500 chars)", 400);
  }

  // Rate limit: 20 AI searches per hour per IP
  const ip = getClientIp(req);
  const rateResult = await checkRateLimit(ip, {
    maxAttempts: 20,
    windowMs: 60 * 60 * 1000, // 1 hour
    endpoint: "ai-search",
  });
  if (!rateResult.allowed) {
    return errorResponse("AI search rate limit exceeded. Please try again later.", 429, {
      retryAfter: Math.ceil(rateResult.resetIn / 1000),
    });
  }

  const meta = getRequestMeta(req);

  try {
    // 1. Decompose the natural language query using AI
    const safeQuery = safeUserText(rawQuery);
    const prompt = buildNaturalLanguageSearchPrompt(safeQuery);

    const { data: decomposed } = await generateAiJson({
      requestId: meta.requestId || undefined,
      system: prompt.system,
      user: prompt.user,
      schema: aiSearchDecomposeSchema,
      callType: "ai_search_decompose",
      ip: meta.ip,
      userAgent: meta.userAgent,
      promptTemplateId: prompt.id,
      promptVersion: prompt.version,
    });

    logger.info(
      {
        route: "api.evergreen.ai-search",
        query: rawQuery,
        decomposed: {
          keywords: decomposed.keywords,
          subjects: decomposed.subjects,
          audience: decomposed.audience,
          format: decomposed.format,
          searchQuery: decomposed.searchQuery,
        },
      },
      "AI search decomposed"
    );

    // 2. Execute the decomposed search against Evergreen
    const searchQuery = decomposed.searchQuery;

    const searchArgs: Record<string, unknown> = {
      limit,
      offset,
      visibility_limit: 3000,
      default_class: "keyword",
    };

    const searchResponse = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.multiclass.query",
      [searchArgs, searchQuery, 1]
    );

    const payload = searchResponse?.payload?.[0];
    const ids: number[] = [];
    if (payload?.ids && Array.isArray(payload.ids)) {
      for (const entry of payload.ids) {
        const id = Array.isArray(entry) ? entry[0] : entry;
        const parsed = typeof id === "number" ? id : parseInt(String(id), 10);
        if (Number.isFinite(parsed) && parsed > 0) ids.push(parsed);
      }
    }

    const totalCount = parseInt(String(payload?.count ?? ids.length), 10) || ids.length;

    if (ids.length === 0) {
      return successResponse({
        records: [],
        count: 0,
        decomposed: {
          keywords: decomposed.keywords,
          subjects: decomposed.subjects,
          audience: decomposed.audience,
          format: decomposed.format,
          language: decomposed.language,
          searchQuery: decomposed.searchQuery,
        },
        aiPowered: true,
      });
    }

    // 3. Fetch MODS for each result
    const records = await Promise.all(
      ids.slice(0, limit).map(async (bibId) => {
        try {
          const modsResponse = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.record.mods_slim.retrieve",
            [bibId]
          );
          const mods = modsResponse?.payload?.[0];
          if (!mods || mods.ilsevent) return null;

          return {
            id: bibId,
            title: mods.title || "Unknown Title",
            author: mods.author || undefined,
            pubdate: mods.pubdate || undefined,
            publisher: mods.publisher || undefined,
            isbn: mods.isbn || undefined,
            subjects: Array.isArray(mods.subject)
              ? mods.subject
              : typeof mods.subject === "string"
                ? [mods.subject]
                : [],
            summary: mods.abstract || undefined,
          };
        } catch {
          return null;
        }
      })
    );

    type RecordType = {
      id: number;
      title: string;
      author?: string;
      pubdate?: string;
      publisher?: string;
      isbn?: string;
      subjects: string[];
      summary?: string;
      rankingScore?: number;
      rankingReason?: string;
    };

    const validRecords: RecordType[] = records.filter(
      (r): r is NonNullable<typeof r> => r !== null
    );

    // 4. Re-rank using semantic rerank (best-effort)
    let rankedRecords: RecordType[] = validRecords;
    try {
      if (validRecords.length > 1) {
        const rerankPrompt = buildSemanticRerankPrompt({
          query: rawQuery,
          candidates: validRecords.map((r) => ({
            id: r.id,
            title: r.title,
            author: r.author,
            pubdate: r.pubdate,
            publisher: r.publisher,
            isbn: r.isbn,
          })),
        });

        const { data: reranked } = await generateAiJson({
          requestId: meta.requestId || undefined,
          system: rerankPrompt.system,
          user: rerankPrompt.user,
          schema: semanticRerankSchema,
          callType: "ai_search_rerank",
          ip: meta.ip,
          userAgent: meta.userAgent,
          promptTemplateId: rerankPrompt.id,
          promptVersion: rerankPrompt.version,
        });

        // Reorder records based on AI ranking
        const idToRecord = new Map(validRecords.map((r) => [r.id, r]));
        const idToRanking = new Map(
          reranked.ranked.map((r) => [r.id, { score: r.score, reason: r.reason }])
        );

        const reorderedRecords: RecordType[] = reranked.ranked
          .map((r) => {
            const record = idToRecord.get(r.id);
            if (!record) return null;
            return { ...record, rankingScore: r.score, rankingReason: r.reason };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        // Append any records that were not in the reranked set
        for (const r of validRecords) {
          if (!idToRanking.has(r.id)) {
            reorderedRecords.push(r);
          }
        }

        rankedRecords = reorderedRecords;
      }
    } catch (err) {
      logger.warn({ err: String(err) }, "AI search rerank failed (non-fatal)");
    }

    // 5. Generate AI explanations for results (best-effort)
    const explanationMap = new Map<number, string>();
    try {
      if (rankedRecords.length > 0) {
        const explainPrompt = buildAiSearchExplanationPrompt({
          query: rawQuery,
          results: rankedRecords.slice(0, 20).map((r) => ({
            id: r.id,
            title: r.title,
            author: r.author,
            subjects: r.subjects,
            summary: r.summary,
          })),
        });

        const { data: explanations } = await generateAiJson({
          requestId: meta.requestId || undefined,
          system: explainPrompt.system,
          user: explainPrompt.user,
          schema: aiSearchExplanationSchema,
          callType: "ai_search_explain",
          ip: meta.ip,
          userAgent: meta.userAgent,
          promptTemplateId: explainPrompt.id,
          promptVersion: explainPrompt.version,
        });

        for (const e of explanations.explanations) {
          explanationMap.set(e.id, e.explanation);
        }
      }
    } catch (err) {
      logger.warn({ err: String(err) }, "AI search explanation failed (non-fatal)");
    }

    // 6. Build final response
    const responseRecords = rankedRecords.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      pubdate: r.pubdate,
      publisher: r.publisher,
      isbn: r.isbn,
      subjects: r.subjects,
      summary: r.summary,
      coverUrl: r.isbn
        ? `https://covers.openlibrary.org/b/isbn/${r.isbn.replace(/[^0-9Xx]/g, "")}-M.jpg`
        : undefined,
      ranking: {
        semanticScore: r.rankingScore ?? undefined,
        semanticReason: r.rankingReason ?? undefined,
      },
      aiExplanation: explanationMap.get(r.id) || undefined,
    }));

    return successResponse({
      records: responseRecords,
      count: totalCount,
      decomposed: {
        keywords: decomposed.keywords,
        subjects: decomposed.subjects,
        audience: decomposed.audience,
        format: decomposed.format,
        language: decomposed.language,
        searchQuery: decomposed.searchQuery,
      },
      aiPowered: true,
    });
  } catch (err) {
    logger.error(
      { route: "api.evergreen.ai-search", query: rawQuery, err: String(err) },
      "AI search failed"
    );
    return serverErrorResponse(err, "api.evergreen.ai-search", req);
  }
}
