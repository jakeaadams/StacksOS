/**
 * Rate limiting utility for preventing brute force attacks
 *
 * Default: in-memory storage with automatic cleanup.
 * Multi-instance: when `STACKSOS_REDIS_URL` is set, use Redis for shared limits.
 */

import { createHash } from "crypto";
import { logger } from "./logger";
import { getRedisClient, redisEnabled, redisKey } from "@/lib/redis";
import type { RedisClientType } from "redis";

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstAttempt: number;
}

const GLOBAL_STORE_KEY = "__stacksos_rateLimitStore";
const GLOBAL_CLEANUP_KEY = "__stacksos_rateLimitCleanupInterval";

// In-memory store - maps IP:endpoint to attempt count.
// Use a global singleton to avoid duplicate stores/intervals during dev HMR.
const rateLimitStore: Map<string, RateLimitEntry> =
  ((globalThis as any)[GLOBAL_STORE_KEY] as Map<string, RateLimitEntry> | undefined) ??
  new Map<string, RateLimitEntry>();

if (!(globalThis as any)[GLOBAL_STORE_KEY]) {
  (globalThis as any)[GLOBAL_STORE_KEY] = rateLimitStore;
}

// Cleanup old entries every 5 minutes (singleton).
if (!(globalThis as any)[GLOBAL_CLEANUP_KEY]) {
  const handle = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Best-effort: don't keep the process alive just for cleanup (useful for tests).
  (handle as any).unref?.();

  (globalThis as any)[GLOBAL_CLEANUP_KEY] = handle;
}

export interface RateLimitConfig {
  /**
   * Maximum number of attempts allowed within the window
   */
  maxAttempts: number;
  
  /**
   * Time window in milliseconds
   */
  windowMs: number;
  
  /**
   * Optional identifier for the endpoint (defaults to 'default')
   */
  endpoint?: string;
}

export interface RateLimitResult {
  /**
   * Whether the request is allowed
   */
  allowed: boolean;
  
  /**
   * Current attempt count
   */
  currentCount: number;
  
  /**
   * Maximum attempts allowed
   */
  limit: number;
  
  /**
   * Time remaining until reset (milliseconds)
   */
  resetIn: number;
  
  /**
   * Timestamp when the limit resets
   */
  resetTime: number;
}

/**
 * Check if a request should be rate limited
 *
 * @param identifier - Unique identifier (usually IP address)
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and metadata
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (redisEnabled()) {
    const client = await getRedisClient();
    if (client) {
      try {
        return await checkRateLimitRedis(client, identifier, config);
      } catch (err) {
        logger.error({ error: String(err) }, "Redis rate limit failed; falling back to in-memory");
      }
    }
  }

  return checkRateLimitMemory(identifier, config);
}

function checkRateLimitMemory(identifier: string, config: RateLimitConfig): RateLimitResult {
  const { maxAttempts, windowMs, endpoint = "default" } = config;
  const key = `${identifier}:${endpoint}`;
  const now = Date.now();
  
  let entry = rateLimitStore.get(key);
  
  // No entry exists - first attempt
  if (!entry) {
    entry = {
      count: 1,
      resetTime: now + windowMs,
      firstAttempt: now,
    };
    rateLimitStore.set(key, entry);
    
    return {
      allowed: true,
      currentCount: 1,
      limit: maxAttempts,
      resetIn: windowMs,
      resetTime: entry.resetTime,
    };
  }
  
  // Entry exists but window has expired - reset
  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + windowMs;
    entry.firstAttempt = now;
    rateLimitStore.set(key, entry);
    
    return {
      allowed: true,
      currentCount: 1,
      limit: maxAttempts,
      resetIn: windowMs,
      resetTime: entry.resetTime,
    };
  }
  
  // Within window - increment count
  entry.count++;
  const allowed = entry.count <= maxAttempts;
  const resetIn = entry.resetTime - now;
  
  if (!allowed) {
    logger.warn(
      {
        identifier,
        endpoint,
        count: entry.count,
        limit: maxAttempts,
        resetIn,
      },
      `Rate limit exceeded for ${identifier} on ${endpoint}`
    );
  }
  
  return {
    allowed,
    currentCount: entry.count,
    limit: maxAttempts,
    resetIn,
    resetTime: entry.resetTime,
  };
}

/**
 * Record a successful authentication to potentially reset or adjust rate limit
 *
 * @param identifier - Unique identifier (IP address)
 * @param endpoint - Endpoint identifier
 */
export async function recordSuccess(identifier: string, endpoint: string = "default"): Promise<void> {
  const key = `${identifier}:${endpoint}`;

  // On successful auth, reset attempts to avoid penalizing real users.
  rateLimitStore.delete(key);

  if (redisEnabled()) {
    const client = await getRedisClient();
    if (client) {
      try {
        await client.del(redisRateLimitKey(endpoint, identifier));
      } catch (err) {
        logger.warn({ error: String(err) }, "Failed to clear Redis rate limit key");
      }
    }
  }

  logger.debug({ identifier, endpoint }, "Successful authentication recorded");
}

/**
 * Clear rate limit for an identifier (useful for testing or manual intervention)
 *
 * @param identifier - Unique identifier
 * @param endpoint - Optional endpoint (clears all if not specified)
 */
export async function clearRateLimit(identifier: string, endpoint?: string): Promise<void> {
  if (endpoint) {
    const key = `${identifier}:${endpoint}`;
    rateLimitStore.delete(key);
  } else {
    // Clear all entries for this identifier
    for (const key of rateLimitStore.keys()) {
      if (key.startsWith(`${identifier}:`)) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!redisEnabled()) return;
  const client = await getRedisClient();
  if (!client) return;

  try {
    if (endpoint) {
      await client.del(redisRateLimitKey(endpoint, identifier));
      return;
    }

    // Best-effort: scan and delete all endpoints for this identifier.
    const pattern = redisKey(`ratelimit:*:${hashIdentifier(identifier)}`);
    const batch: string[] = [];
    for await (const k of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      batch.push(String(k));
      if (batch.length >= 500) {
        await client.del(batch);
        batch.length = 0;
      }
    }
    if (batch.length) await client.del(batch);
  } catch (err) {
    logger.warn({ error: String(err) }, "Failed to clear Redis rate limits (best-effort)");
  }
}

/**
 * Get current rate limit status without incrementing
 *
 * @param identifier - Unique identifier
 * @param endpoint - Endpoint identifier
 * @returns Current entry or null if no limit active
 */
export async function getRateLimitStatus(
  identifier: string,
  endpoint: string = "default"
): Promise<RateLimitEntry | null> {
  const key = `${identifier}:${endpoint}`;
  const local = rateLimitStore.get(key) || null;

  if (!redisEnabled()) return local;
  const client = await getRedisClient();
  if (!client) return local;

  try {
    const data = await client.hGetAll(redisRateLimitKey(endpoint, identifier));
    const count = Number(data?.count);
    const resetTime = Number(data?.resetTime);
    const firstAttempt = Number(data?.firstAttempt);
    if (!Number.isFinite(count) || count <= 0) return local;
    if (!Number.isFinite(resetTime) || !Number.isFinite(firstAttempt)) return local;
    return { count, resetTime, firstAttempt };
  } catch (err) {
    logger.warn({ error: String(err) }, "Failed to fetch Redis rate limit status; using local");
    return local;
  }
}

function hashIdentifier(identifier: string): string {
  // Avoid putting raw IPs/emails/etc directly into Redis keys.
  return createHash("sha256").update(identifier).digest("hex").slice(0, 32);
}

function redisRateLimitKey(endpoint: string, identifier: string): string {
  return redisKey(`ratelimit:${endpoint}:${hashIdentifier(identifier)}`);
}

async function checkRateLimitRedis(
  client: RedisClientType,
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { maxAttempts, windowMs, endpoint = "default" } = config;
  const now = Date.now();
  const key = redisRateLimitKey(endpoint, identifier);

  // Atomic fixed-window counter implemented as a Redis hash with an expiry.
  // Fields:
  // - count: int
  // - firstAttempt: epoch ms
  // - resetTime: epoch ms
  const lua = `
local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local now = tonumber(ARGV[2])

local resetTime = redis.call('HGET', key, 'resetTime')
if not resetTime then
  local rt = now + windowMs
  redis.call('HSET', key, 'count', 1, 'firstAttempt', now, 'resetTime', rt)
  redis.call('PEXPIRE', key, windowMs)
  return {1, rt, now}
end

resetTime = tonumber(resetTime)
if now > resetTime then
  local rt = now + windowMs
  redis.call('HSET', key, 'count', 1, 'firstAttempt', now, 'resetTime', rt)
  redis.call('PEXPIRE', key, windowMs)
  return {1, rt, now}
end

local count = redis.call('HINCRBY', key, 'count', 1)
local firstAttempt = tonumber(redis.call('HGET', key, 'firstAttempt') or now)
return {count, resetTime, firstAttempt}
`;

  const reply = (await client.eval(lua, {
    keys: [key],
    arguments: [String(windowMs), String(now)],
  })) as unknown;

  const arr = Array.isArray(reply) ? reply : [];
  const count = Number(arr[0]);
  const resetTime = Number(arr[1]);
  const firstAttempt = Number(arr[2]);

  if (!Number.isFinite(count) || !Number.isFinite(resetTime) || !Number.isFinite(firstAttempt)) {
    // Should never happen; treat as allowed to avoid false lockouts.
    return checkRateLimitMemory(identifier, config);
  }

  const allowed = count <= maxAttempts;
  const resetIn = Math.max(0, resetTime - now);

  if (!allowed) {
    logger.warn(
      {
        identifier,
        endpoint,
        count,
        limit: maxAttempts,
        resetIn,
      },
      `Rate limit exceeded for ${identifier} on ${endpoint}`
    );
  }

  return {
    allowed,
    currentCount: count,
    limit: maxAttempts,
    resetIn,
    resetTime,
  };
}
