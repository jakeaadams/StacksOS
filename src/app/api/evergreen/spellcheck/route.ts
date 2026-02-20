import { NextRequest, NextResponse } from "next/server";
import { callOpenSRF } from "@/lib/api";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Spellcheck / "Did you mean?" API
 *
 * Strategy:
 * 1. Run the original query against Evergreen catalog
 * 2. If result count < 3, generate fuzzy variations of the query
 * 3. Run each variation and pick the one with the most results
 * 4. Return the best suggestion (if it has more results than the original)
 */

// ---------------------------------------------------------------------------
// Fuzzy variation generators
// ---------------------------------------------------------------------------

/** Levenshtein-distance-1 edits: deletions, transpositions, replacements, insertions */
function generateEdits(word: string): Set<string> {
  const edits = new Set<string>();
  const letters = "abcdefghijklmnopqrstuvwxyz";

  for (let i = 0; i < word.length; i++) {
    // Deletions
    edits.add(word.slice(0, i) + word.slice(i + 1));
    // Replacements
    for (const c of letters) {
      if (c !== word[i]) {
        edits.add(word.slice(0, i) + c + word.slice(i + 1));
      }
    }
    // Transpositions
    if (i < word.length - 1) {
      edits.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
    }
  }
  // Insertions
  for (let i = 0; i <= word.length; i++) {
    for (const c of letters) {
      edits.add(word.slice(0, i) + c + word.slice(i));
    }
  }

  return edits;
}

/** Common misspelling patterns */
const SWAP_PAIRS = [
  ["ie", "ei"],
  ["ei", "ie"],
  ["tion", "shun"],
  ["ph", "f"],
  ["ght", "t"],
  ["ck", "k"],
  ["oo", "u"],
  ["ee", "ea"],
  ["ea", "ee"],
  ["ou", "ow"],
  ["ow", "ou"],
  ["th", "t"],
  ["sh", "s"],
  ["ss", "s"],
  ["ll", "l"],
  ["tt", "t"],
  ["rr", "r"],
  ["mm", "m"],
  ["nn", "n"],
  ["pp", "p"],
];

function commonSwaps(word: string): Set<string> {
  const results = new Set<string>();
  for (const [from, to] of SWAP_PAIRS) {
    const idx = word.indexOf(from);
    if (idx >= 0) {
      results.add(word.slice(0, idx) + to + word.slice(idx + from.length));
    }
  }
  // Remove doubled letters
  results.add(word.replace(/(.)\1/g, "$1"));
  return results;
}

/** Generate candidate corrections for a multi-word query */
function generateCandidates(query: string): string[] {
  const lowerQuery = query.toLowerCase().trim();
  const words = lowerQuery.split(/\s+/);
  const candidates = new Set<string>();

  // For single-word queries, generate edits directly
  if (words.length === 1) {
    const edits = generateEdits(words[0]);
    const swaps = commonSwaps(words[0]);
    for (const e of edits) candidates.add(e);
    for (const s of swaps) candidates.add(s);
  } else {
    // For multi-word queries, try editing each word independently
    for (let wi = 0; wi < words.length; wi++) {
      const edits = generateEdits(words[wi]);
      const swaps = commonSwaps(words[wi]);
      const allVariations = new Set([...edits, ...swaps]);

      for (const variation of allVariations) {
        const newWords = [...words];
        newWords[wi] = variation;
        candidates.add(newWords.join(" "));
      }
    }
  }

  // Also try a wildcard/truncation approach: append * to each word
  const truncated = words.map((w) => (w.length > 3 ? w.slice(0, -1) + "*" : w)).join(" ");
  if (truncated !== lowerQuery) {
    candidates.add(truncated);
  }

  // Remove the original query and empty strings
  candidates.delete(lowerQuery);
  candidates.delete("");

  // Limit candidates to prevent too many API calls
  return Array.from(candidates).slice(0, 15);
}

/** Quick search that returns just the result count */
async function getResultCount(query: string): Promise<{ count: number; topTitle?: string }> {
  try {
    const response = await callOpenSRF(
      "open-ils.search",
      "open-ils.search.biblio.multiclass.query",
      [{ limit: 1, offset: 0 }, query, 1]
    );

    const payload = response?.payload?.[0];
    if (!payload) return { count: 0 };

    const count =
      typeof payload.count === "number"
        ? payload.count
        : parseInt(String(payload.count || "0"), 10);

    // Try to extract the top result title for display
    let topTitle: string | undefined;
    const ids = payload.ids || [];
    if (ids.length > 0) {
      const firstId = Array.isArray(ids[0]) ? ids[0][0] : ids[0];
      if (firstId) {
        try {
          const modsRes = await callOpenSRF(
            "open-ils.search",
            "open-ils.search.biblio.record.mods_slim.retrieve",
            [parseInt(String(firstId))]
          );
          const mods = modsRes?.payload?.[0];
          if (mods && !mods.ilsevent) {
            topTitle = mods.title;
          }
        } catch {
          // ignore - title is optional
        }
      }
    }

    return { count: Number.isFinite(count) ? count : 0, topTitle };
  } catch {
    return { count: 0 };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";

  if (!query.trim()) {
    return NextResponse.json({ ok: true, suggestion: null });
  }

  // Rate limit: 60 spellcheck requests per hour per IP
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rateResult = await checkRateLimit(clientIp, {
    maxAttempts: 60,
    windowMs: 60 * 60 * 1000,
    endpoint: "spellcheck",
  });
  if (!rateResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "Spellcheck rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  try {
    // Step 1: Check the original query result count
    const original = await getResultCount(query.trim());

    // If original has enough results, no suggestion needed
    if (original.count >= 3) {
      return NextResponse.json({
        ok: true,
        suggestion: null,
        originalCount: original.count,
      });
    }

    logger.debug(
      { query, originalCount: original.count },
      "Spellcheck: low result count, generating candidates"
    );

    // Step 2: Generate candidate corrections
    const candidates = generateCandidates(query);

    // Step 3: Test candidates in parallel (batched to avoid overwhelming the server)
    let bestCandidate: string | null = null;
    let bestCount = original.count;

    // Test in batches of 5
    for (let i = 0; i < candidates.length; i += 5) {
      const batch = candidates.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (candidate) => ({
          candidate,
          ...(await getResultCount(candidate)),
        }))
      );

      for (const result of results) {
        if (result.count > bestCount) {
          bestCount = result.count;
          bestCandidate = result.candidate;
        }
      }

      // If we found something good, stop early
      if (bestCount >= 10) break;
    }

    // Only suggest if the candidate has meaningfully more results
    if (bestCandidate && bestCount > original.count && bestCount >= 1) {
      // Clean up wildcard from display
      const displaySuggestion = bestCandidate.replace(/\*/g, "");

      return NextResponse.json({
        ok: true,
        suggestion: displaySuggestion,
        suggestionCount: bestCount,
        originalCount: original.count,
      });
    }

    return NextResponse.json({
      ok: true,
      suggestion: null,
      originalCount: original.count,
    });
  } catch (err) {
    logger.error({ err, query }, "Spellcheck error");
    return NextResponse.json({ ok: true, suggestion: null });
  }
}
