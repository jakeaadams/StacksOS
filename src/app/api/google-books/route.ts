import { NextRequest } from "next/server";

import { errorResponse, getRequestMeta, successResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisClient, redisEnabled, redisKey } from "@/lib/redis";

/**
 * Google Books API Integration
 * Fetches book ratings and supplemental metadata from Google Books
 * Free API - no key required for basic usage (rate limited)
 */

export interface GoogleBookData {
  isbn: string;
  averageRating: number | null;
  ratingsCount: number | null;
  thumbnail: string | null;
  description: string | null;
  previewLink: string | null;
}

export interface GoogleBooksSearchItem {
  id: string;
  title: string | null;
  authors: string[];
  publishedDate: string | null;
  thumbnail: string | null;
  image: string | null;
  previewLink: string | null;
  infoLink: string | null;
}

const GLOBAL_BACKOFF_KEY = "__stacksos_googleBooksBackoffUntilMs";
const REDIS_BACKOFF_KEY = redisKey("googlebooks:backoffUntilMs");

function normalizeGoogleImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  return url.replace(/^http:/, "https:");
}

function upgradeGoogleImageZoom(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/([?&]zoom=)(\d+)/, (_match, prefix: string) => `${prefix}2`);
}

function getLocalBackoffUntilMs(): number {
  const g = globalThis as any;
  const raw = g[GLOBAL_BACKOFF_KEY];
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function setLocalBackoffUntilMs(untilMs: number): void {
  (globalThis as any)[GLOBAL_BACKOFF_KEY] = untilMs;
}

async function getBackoffUntilMs(): Promise<number> {
  if (!redisEnabled()) return getLocalBackoffUntilMs();
  const client = await getRedisClient();
  if (!client) return getLocalBackoffUntilMs();

  try {
    const raw = await client.get(REDIS_BACKOFF_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return getLocalBackoffUntilMs();
  }
}

async function setBackoffUntilMs(untilMs: number): Promise<void> {
  setLocalBackoffUntilMs(untilMs);

  if (!redisEnabled()) return;
  const client = await getRedisClient();
  if (!client) return;

  const ttlMs = Math.max(1_000, untilMs - Date.now());
  try {
    await client.set(REDIS_BACKOFF_KEY, String(untilMs), { PX: ttlMs });
  } catch {
    // Best-effort; local backoff still applies for this instance.
  }
}

function parseRetryAfterSeconds(res: Response): number {
  const retryAfterHeader = String(res.headers.get("retry-after") || "").trim();
  const fromHeader = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? parseInt(retryAfterHeader, 10) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
  return 60;
}

async function fetchGoogleBook(isbn: string): Promise<{
  data: GoogleBookData | null;
  rateLimited: boolean;
  retryAfterSeconds: number | null;
}> {
  try {
    const now = Date.now();
    const backoffUntil = await getBackoffUntilMs();
    if (now < backoffUntil) {
      return {
        data: null,
        rateLimited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((backoffUntil - now) / 1000)),
      };
    }

    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`;
    const res = await fetch(url, { 
      next: { revalidate: 86400 } // Cache for 24 hours
    });
    
    if (res.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(res);
      await setBackoffUntilMs(Date.now() + Math.max(10, retryAfterSeconds) * 1000);
      return { data: null, rateLimited: true, retryAfterSeconds };
    }

    if (!res.ok) {
      logger.warn(
        { status: res.status, statusText: res.statusText, isbn },
        "Google Books lookup failed"
      );
      return { data: null, rateLimited: false, retryAfterSeconds: null };
    }
    
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) {
      return { data: null, rateLimited: false, retryAfterSeconds: null };
    }
    
    const book = data.items[0];
    const volumeInfo = book.volumeInfo || {};

    const imageLinks = volumeInfo?.imageLinks || {};
    const thumbnail =
      normalizeGoogleImageUrl(imageLinks.thumbnail) ||
      normalizeGoogleImageUrl(imageLinks.smallThumbnail);

    return {
      data: {
        isbn,
        averageRating: volumeInfo.averageRating ?? null,
        ratingsCount: volumeInfo.ratingsCount ?? null,
        thumbnail,
        description: volumeInfo.description ?? null,
        previewLink: volumeInfo.previewLink ?? null,
      },
      rateLimited: false,
      retryAfterSeconds: null,
    };
  } catch (error) {
    logger.error({ error: String(error), isbn }, "Error fetching Google Books data");
    return { data: null, rateLimited: false, retryAfterSeconds: null };
  }
}

async function searchGoogleBooks(query: string, maxResults: number, startIndex: number): Promise<{
  totalItems: number;
  items: GoogleBooksSearchItem[];
  rateLimited?: boolean;
  retryAfterSeconds?: number | null;
}> {
  const safeMaxResults = Math.max(1, Math.min(maxResults || 8, 12));
  const safeStartIndex = Math.max(0, Math.min(startIndex || 0, 200));
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${safeMaxResults}&startIndex=${safeStartIndex}`;

  const now = Date.now();
  const backoffUntilMs = await getBackoffUntilMs();
  if (now < backoffUntilMs) {
    return {
      totalItems: 0,
      items: [],
      rateLimited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((backoffUntilMs - now) / 1000)),
    };
  }

  const res = await fetch(url, {
    next: { revalidate: 86400 }, // Cache for 24 hours
  });

  if (res.status === 429) {
    const retryAfterSeconds = parseRetryAfterSeconds(res);
    await setBackoffUntilMs(Date.now() + Math.max(10, retryAfterSeconds) * 1000);
    return { totalItems: 0, items: [], rateLimited: true, retryAfterSeconds };
  }

  if (!res.ok) {
    throw new Error(`Google Books HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const totalItems = typeof data?.totalItems === "number" ? data.totalItems : 0;
  const rawItems = Array.isArray(data?.items) ? data.items : [];

  const items: GoogleBooksSearchItem[] = rawItems
    .map((book: any) => {
      const volumeInfo = book?.volumeInfo || {};
      const imageLinks = volumeInfo?.imageLinks || {};

      const thumbnail =
        normalizeGoogleImageUrl(imageLinks.smallThumbnail) ||
        normalizeGoogleImageUrl(imageLinks.thumbnail);

      const image =
        upgradeGoogleImageZoom(normalizeGoogleImageUrl(imageLinks.thumbnail)) ||
        upgradeGoogleImageZoom(normalizeGoogleImageUrl(imageLinks.smallThumbnail));

      return {
        id: typeof book?.id === "string" ? book.id : "",
        title: typeof volumeInfo?.title === "string" ? volumeInfo.title : null,
        authors: Array.isArray(volumeInfo?.authors) ? volumeInfo.authors.filter(Boolean) : [],
        publishedDate: typeof volumeInfo?.publishedDate === "string" ? volumeInfo.publishedDate : null,
        thumbnail,
        image,
        previewLink: typeof volumeInfo?.previewLink === "string" ? volumeInfo.previewLink : null,
        infoLink: typeof volumeInfo?.infoLink === "string" ? volumeInfo.infoLink : null,
      };
    })
    .filter((item: GoogleBooksSearchItem) => item.thumbnail || item.image);

  return { totalItems, items };
}

// GET /api/google-books?isbn=9780123456789
// GET /api/google-books?isbns=9780123456789,9780987654321 (batch)
// GET /api/google-books?q=intitle:...&maxResults=8&startIndex=0 (search)
export async function GET(request: NextRequest) {
  const { ip } = getRequestMeta(request);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 300,
    windowMs: 5 * 60 * 1000,
    endpoint: "google-books",
  });

  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  const { searchParams } = new URL(request.url);
  
  // Single ISBN
  const isbn = searchParams.get("isbn");
  if (isbn) {
    const cleaned = isbn.replace(/-/g, "");
    const { data, rateLimited, retryAfterSeconds } = await fetchGoogleBook(cleaned);
    return successResponse({ data, rateLimited, retryAfterSeconds });
  }
  
  // Batch ISBNs (comma-separated)
  const isbns = searchParams.get("isbns");
  if (isbns) {
    const isbnList = isbns.split(",").map((i) => i.trim().replace(/-/g, "")).filter(Boolean);
    
    // Limit to 20 ISBNs per request to avoid rate limiting
    const limitedList = isbnList.slice(0, 20);
    
    // Fetch in parallel with small delay between requests
    const results: Record<string, GoogleBookData | null> = {};
    let rateLimited = false;
    let retryAfterSeconds: number | null = null;
    
    await Promise.all(
      limitedList.map(async (isbnItem, index) => {
        // Stagger requests slightly to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, index * 100));
        const out = await fetchGoogleBook(isbnItem);
        results[isbnItem] = out.data;
        if (out.rateLimited) {
          rateLimited = true;
          retryAfterSeconds = out.retryAfterSeconds;
        }
      })
    );
    
    return successResponse({ results, rateLimited, retryAfterSeconds });
  }

  const q = searchParams.get("q");
  if (q) {
    try {
      const maxResults = parseInt(searchParams.get("maxResults") || "8", 10);
      const startIndex = parseInt(searchParams.get("startIndex") || "0", 10);

      const result = await searchGoogleBooks(q, maxResults, startIndex);
      return successResponse({ query: q, ...result });
    } catch (error) {
      logger.warn({ error: String(error), query: q }, "Google Books search failed");
      return errorResponse("Failed to search Google Books", 502);
    }
  }
  
  return errorResponse("Missing isbn, isbns, or q parameter", 400);
}
