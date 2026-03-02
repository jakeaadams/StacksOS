/**
 * File-based reviews store for StacksOS.
 *
 * Persists reviews to a JSON file so data survives server restarts.
 * Uses a write-through cache: reads are served from memory after the
 * first load, and every mutation is flushed to disk immediately.
 */

import { promises as fs } from "fs";
import { mkdirSync, readFileSync, existsSync } from "fs";
import { dirname } from "path";
import { logger } from "@/lib/logger";

export interface Review {
  id: number;
  bibId: number;
  patronId: number;
  patronName: string;
  rating: number;
  title?: string;
  text?: string;
  createdAt: string;
  helpful: number;
  verified: boolean;
  reported: boolean;
}

interface StoreData {
  reviews: Record<string, Review[]>;
  nextId: number;
}

const STORE_PATH = process.env.REVIEWS_STORE_PATH || ".data/reviews.json";

// ---------------------------------------------------------------------------
// In-memory cache (lazy-loaded from disk on first access)
// ---------------------------------------------------------------------------

let cache: StoreData | null = null;

function emptyStore(): StoreData {
  return { reviews: {}, nextId: 1 };
}

/**
 * Synchronously load the store from disk (used only for the initial load so
 * that the first request does not need an extra await).
 */
function loadSync(): StoreData {
  try {
    if (existsSync(STORE_PATH)) {
      const raw = readFileSync(STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed && typeof parsed.nextId === "number" && parsed.reviews) {
        return parsed;
      }
    }
  } catch {
    // Corrupt or missing file -- start fresh.
  }
  return emptyStore();
}

function ensureLoaded(): StoreData {
  if (!cache) {
    cache = loadSync();
  }
  return cache;
}

/**
 * Flush the current in-memory state to disk (async, write-through).
 */
async function flush(): Promise<void> {
  const data = ensureLoaded();
  try {
    const dir = dirname(STORE_PATH);
    mkdirSync(dir, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    logger.error({ error: String(err) }, "Failed to write reviews store to disk");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getReviews(bibId: number): Promise<Review[]> {
  const store = ensureLoaded();
  return store.reviews[String(bibId)] || [];
}

export async function setReviews(bibId: number, reviews: Review[]): Promise<void> {
  const store = ensureLoaded();
  store.reviews[String(bibId)] = reviews;
  await flush();
}

export async function getAllReviews(): Promise<Record<string, Review[]>> {
  const store = ensureLoaded();
  return store.reviews;
}

export async function getNextId(): Promise<number> {
  const store = ensureLoaded();
  const id = store.nextId;
  store.nextId += 1;
  await flush();
  return id;
}

export async function deleteReview(
  bibId: number,
  reviewId: number
): Promise<{ deleted: boolean; review?: Review }> {
  const store = ensureLoaded();
  const key = String(bibId);
  const reviews = store.reviews[key];
  if (!reviews) return { deleted: false };

  const idx = reviews.findIndex((r) => r.id === reviewId);
  if (idx === -1) return { deleted: false };

  const [removed] = reviews.splice(idx, 1);
  store.reviews[key] = reviews;
  await flush();
  return { deleted: true, review: removed };
}

/**
 * Find a review by its id across all bibs.
 * Returns the review and the bibId it belongs to, or null.
 */
export async function findReviewById(
  reviewId: number
): Promise<{ review: Review; bibId: number } | null> {
  const store = ensureLoaded();
  for (const [key, reviews] of Object.entries(store.reviews)) {
    const review = reviews.find((r) => r.id === reviewId);
    if (review) {
      return { review, bibId: Number(key) };
    }
  }
  return null;
}

/**
 * Update a review in-place and persist.
 * The caller should mutate the review object obtained via findReviewById
 * before calling this to flush changes.
 */
export async function persistChanges(): Promise<void> {
  await flush();
}
