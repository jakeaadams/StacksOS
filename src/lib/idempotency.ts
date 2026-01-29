/**
 * Idempotency helpers for mutation endpoints.
 *
 * Goal: allow safe client retries on timeouts without duplicating side effects.
 *
 * Implementation (P0):
 * - Client sends `x-idempotency-key` (stable across retries).
 * - Server stores the JSON response for that key under `.logs/idempotency/`.
 * - If the same key is seen again:
 *    - If the first request is still in-flight, wait for it.
 *    - Otherwise, replay the stored response.
 *
 * Notes:
 * - This is process-local + file-backed. It survives restarts, but is not
 *   distributed across multiple instances. For P1 multi-instance SaaS, replace
 *   with Redis or a control-plane datastore.
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export interface IdempotencyOptions {
  /** How long to keep idempotency entries (ms). Default: 6 hours. */
  ttlMs?: number;
}

interface IdempotencyEntry {
  createdAt: string;
  status: number;
  body: unknown;
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

const inflight = new Map<string, Promise<IdempotencyEntry>>();

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function storeDir(): string {
  // Next.js runs with CWD = project root.
  return path.join(process.cwd(), ".logs", "idempotency");
}

function entryPath(keyHash: string): string {
  return path.join(storeDir(), `${keyHash}.json`);
}

async function ensureStoreDir(): Promise<void> {
  await fs.mkdir(storeDir(), { recursive: true });
}

async function readEntry(filePath: string): Promise<IdempotencyEntry | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;

    const createdAt = typeof data.createdAt === "string" ? data.createdAt : null;
    const status = Number(data.status);
    const body = (data as any).body;

    if (!createdAt || !Number.isFinite(status)) return null;

    return { createdAt, status, body };
  } catch {
    return null;
  }
}

function isExpired(entry: IdempotencyEntry, ttlMs: number): boolean {
  const ts = Date.parse(entry.createdAt);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > ttlMs;
}

async function writeEntry(filePath: string, entry: IdempotencyEntry): Promise<void> {
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(entry), "utf8");
  await fs.rename(tmp, filePath);
}

function toReplayResponse(entry: IdempotencyEntry, replay: boolean): NextResponse {
  const res = NextResponse.json(entry.body, {
    status: entry.status,
  });
  if (replay) {
    res.headers.set("x-idempotency-replay", "1");
  }
  return res;
}

/**
 * Wrap a mutation handler with idempotency support.
 *
 * Usage:
 * `return withIdempotency(req, "api.foo", async () => { ... })`
 */
export async function withIdempotency(
  req: Request,
  route: string,
  handler: () => Promise<Response>,
  options: IdempotencyOptions = {}
): Promise<Response> {
  const rawKey = req.headers.get("x-idempotency-key") || "";
  const key = rawKey.trim();
  if (!key) {
    return handler();
  }

  const ttlMs = Number.isFinite(Number(options.ttlMs)) ? Number(options.ttlMs) : DEFAULT_TTL_MS;
  const keyHash = hashKey(key);
  const file = entryPath(keyHash);

  await ensureStoreDir();

  // Fast path: replay if present and fresh.
  const existing = await readEntry(file);
  if (existing) {
    if (isExpired(existing, ttlMs)) {
      try {
        await fs.unlink(file);
      } catch {
        // ignore
      }
    } else {
      logger.info({ route, requestId: req.headers.get("x-request-id"), idempotencyKey: keyHash }, "Idempotency replay");
      return toReplayResponse(existing, true);
    }
  }

  const inflightPromise = inflight.get(keyHash);
  if (inflightPromise) {
    const entry = await inflightPromise;
    return toReplayResponse(entry, true);
  }

  const work = (async (): Promise<IdempotencyEntry> => {
    const response = await handler();

    // Clone response so we can persist JSON while returning equivalent data.
    const cloned = response.clone();

    let body: unknown = null;
    try {
      body = await cloned.json();
    } catch {
      try {
        body = await cloned.text();
      } catch {
        body = null;
      }
    }

    const entry: IdempotencyEntry = {
      createdAt: new Date().toISOString(),
      status: response.status,
      body,
    };

    await writeEntry(file, entry);
    return entry;
  })();

  inflight.set(keyHash, work);

  try {
    const entry = await work;
    return toReplayResponse(entry, false);
  } finally {
    inflight.delete(keyHash);
  }
}
