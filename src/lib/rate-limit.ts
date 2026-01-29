/**
 * Rate limiting utility for preventing brute force attacks
 * 
 * Uses in-memory storage with automatic cleanup.
 * For production with multiple instances, consider Redis-based rate limiting.
 */

import { logger } from "./logger";

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstAttempt: number;
}

// In-memory store - maps IP:endpoint to attempt count
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

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
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
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
export function recordSuccess(identifier: string, endpoint: string = "default"): void {
  const key = `${identifier}:${endpoint}`;
  // On successful auth, we could reset or reduce the count
  // For now, just let it expire naturally to prevent rapid attempts
  logger.debug({ identifier, endpoint }, "Successful authentication recorded");
}

/**
 * Clear rate limit for an identifier (useful for testing or manual intervention)
 * 
 * @param identifier - Unique identifier
 * @param endpoint - Optional endpoint (clears all if not specified)
 */
export function clearRateLimit(identifier: string, endpoint?: string): void {
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
}

/**
 * Get current rate limit status without incrementing
 * 
 * @param identifier - Unique identifier
 * @param endpoint - Endpoint identifier
 * @returns Current entry or null if no limit active
 */
export function getRateLimitStatus(
  identifier: string,
  endpoint: string = "default"
): RateLimitEntry | null {
  const key = `${identifier}:${endpoint}`;
  return rateLimitStore.get(key) || null;
}
