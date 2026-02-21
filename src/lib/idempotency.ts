/**
 * Idempotency helpers for mutation endpoints.
 *
 * Goal: allow safe client retries on timeouts without duplicating side effects.
 *
 * Implementation:
 * - Client sends `x-idempotency-key` (stable across retries).
 * - Server stores the JSON response for that key:
 *    - Redis when `STACKSOS_REDIS_URL` is set (multi-instance safe)
 *    - Otherwise under `.logs/idempotency/` (file-backed, single-instance)
 * - If the same key is seen again:
 *    - If the first request is still in-flight, wait for it.
 *    - Otherwise, replay the stored response.
 *
 * Notes:
 * - The in-process `inflight` map only deduplicates within a single instance.
 *   Redis mode adds a best-effort distributed lock to deduplicate across instances.
 */

import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getRedisClient, redisEnabled, redisKey } from "@/lib/redis";
import type { RedisClientType } from "redis";

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
    const body = (data as Record<string, unknown>).body;

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

function redisEntryKey(keyHash: string): string {
  return redisKey(`idempotency:${keyHash}`);
}

function redisLockKey(keyHash: string): string {
  return redisKey(`idempotency:lock:${keyHash}`);
}

async function tryParseEntry(raw: string | null): Promise<IdempotencyEntry | null> {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;

    const createdAt = typeof (data as Record<string, unknown>).createdAt === "string" ? (data as Record<string, unknown>).createdAt as string : null;
    const status = Number((data as Record<string, unknown>).status);
    const body = (data as Record<string, unknown>).body;
    if (!createdAt || !Number.isFinite(status)) return null;

    return { createdAt, status, body };
  } catch {
    return null;
  }
}

async function releaseRedisLock(client: RedisClientType, key: string, token: string): Promise<void> {
  // Only release if we still own the lock.
  const lua = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  try {
    await client.eval(lua, { keys: [key], arguments: [token] });
  } catch {
    // Best-effort; idempotency correctness depends on the entry key, not the lock.
  }
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
  const requestId = req.headers.get("x-request-id");

  // Prefer Redis when configured, but fall back gracefully.
  if (redisEnabled()) {
    const client = await getRedisClient();
    if (client) {
      try {
        return await withIdempotencyRedis(client, req, route, handler, { ttlMs }, keyHash, requestId);
      } catch (err: any) {
        logger.error({ error: String(err), route, requestId }, "Redis idempotency failed; falling back to file store");
      }
    }
  }

  return await withIdempotencyFile(req, route, handler, { ttlMs }, keyHash, requestId);
}

async function withIdempotencyFile(
  req: Request,
  route: string,
  handler: () => Promise<Response>,
  options: Required<Pick<IdempotencyOptions, "ttlMs">>,
  keyHash: string,
  requestId: string | null
): Promise<Response> {
  const ttlMs = options.ttlMs;
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
      logger.info({ route, requestId, idempotencyKey: keyHash }, "Idempotency replay");
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

async function withIdempotencyRedis(
  client: RedisClientType,
  req: Request,
  route: string,
  handler: () => Promise<Response>,
  options: Required<Pick<IdempotencyOptions, "ttlMs">>,
  keyHash: string,
  requestId: string | null
): Promise<Response> {
  const ttlMs = options.ttlMs;
  const entryKey = redisEntryKey(keyHash);
  const lockKey = redisLockKey(keyHash);

  // Fast path: replay if present.
  const existing = await tryParseEntry(await client.get(entryKey));
  if (existing) {
    logger.info({ route, requestId, idempotencyKey: keyHash }, "Idempotency replay");
    return toReplayResponse(existing, true);
  }

  const inflightPromise = inflight.get(keyHash);
  if (inflightPromise) {
    const entry = await inflightPromise;
    return toReplayResponse(entry, true);
  }

  const token = randomUUID();
  const lockTtlMs = Math.min(60_000, Math.max(5_000, Math.floor(ttlMs / 10)));
  const acquired = (await client.set(lockKey, token, { NX: true, PX: lockTtlMs })) === "OK";

  if (!acquired) {
    // Another instance is likely processing. Poll briefly for the stored entry.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const polled = await tryParseEntry(await client.get(entryKey));
      if (polled) return toReplayResponse(polled, true);
      await new Promise((r) => setTimeout(r, 250));
    }

    logger.warn({ route, requestId, idempotencyKey: keyHash }, "Idempotency lock wait timed out");
    const res = NextResponse.json(
      { ok: false, error: "Request in progress. Retry later." },
      { status: 409 }
    );
    res.headers.set("retry-after", "1");
    return res;
  }

  const work = (async (): Promise<IdempotencyEntry> => {
    try {
      const response = await handler();
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

      await client.set(entryKey, JSON.stringify(entry), { PX: ttlMs });
      return entry;
    } finally {
      await releaseRedisLock(client, lockKey, token);
    }
  })();

  inflight.set(keyHash, work);

  try {
    const entry = await work;
    return toReplayResponse(entry, false);
  } finally {
    inflight.delete(keyHash);
  }
}
