/**
 * Rate Limiting Unit Tests
 * 
 * Tests the rate limiting functionality used to protect authentication endpoints
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  clearRateLimit,
  getRateLimitStatus,
} from "@/lib/rate-limit";

describe("Rate Limiting", () => {
  beforeEach(async () => {
    // Clear all rate limits before each test
    await clearRateLimit("test-ip-1");
    await clearRateLimit("test-ip-2");
    await clearRateLimit("test-ip-3");
  });

  describe("checkRateLimit", () => {
    it("should allow first request", async () => {
      const result = await checkRateLimit("test-ip-1", {
        maxAttempts: 5,
        windowMs: 60000,
        endpoint: "test-endpoint",
      });

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);
      expect(result.limit).toBe(5);
    });

    it("should track multiple attempts", async () => {
      const config = {
        maxAttempts: 3,
        windowMs: 60000,
        endpoint: "test-endpoint-2",
      };

      // First attempt
      let result = await checkRateLimit("test-ip-2", config);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);

      // Second attempt
      result = await checkRateLimit("test-ip-2", config);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(2);

      // Third attempt
      result = await checkRateLimit("test-ip-2", config);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(3);
    });

    it("should block requests exceeding limit", async () => {
      const config = {
        maxAttempts: 2,
        windowMs: 60000,
        endpoint: "test-endpoint-3",
      };

      // First two allowed
      await checkRateLimit("test-ip-3", config);
      await checkRateLimit("test-ip-3", config);

      // Third should be blocked
      const result = await checkRateLimit("test-ip-3", config);
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(3);
    });

    it("should use default endpoint if not specified", async () => {
      const result = await checkRateLimit("test-ip-1", {
        maxAttempts: 5,
        windowMs: 60000,
      });

      expect(result.allowed).toBe(true);
    });

    it("should track different endpoints separately", async () => {
      const config1 = { maxAttempts: 1, windowMs: 60000, endpoint: "endpoint-a" };
      const config2 = { maxAttempts: 1, windowMs: 60000, endpoint: "endpoint-b" };

      // Exhaust limit on endpoint A
      await checkRateLimit("test-ip-1", config1);
      const resultA = await checkRateLimit("test-ip-1", config1);
      expect(resultA.allowed).toBe(false);

      // Endpoint B should still be allowed
      const resultB = await checkRateLimit("test-ip-1", config2);
      expect(resultB.allowed).toBe(true);
    });

    it("should track different IPs separately", async () => {
      const config = { maxAttempts: 1, windowMs: 60000, endpoint: "shared-endpoint" };

      // Exhaust limit for IP 1
      await checkRateLimit("test-ip-1", config);
      const result1 = await checkRateLimit("test-ip-1", config);
      expect(result1.allowed).toBe(false);

      // IP 2 should still be allowed
      const result2 = await checkRateLimit("test-ip-2", config);
      expect(result2.allowed).toBe(true);
    });

    it("should provide correct reset time information", async () => {
      const windowMs = 60000;
      const result = await checkRateLimit("test-ip-1", {
        maxAttempts: 5,
        windowMs,
        endpoint: "reset-test",
      });

      expect(result.resetIn).toBeLessThanOrEqual(windowMs);
      expect(result.resetIn).toBeGreaterThan(0);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });
  });

  describe("clearRateLimit", () => {
    it("should clear rate limit for specific endpoint", async () => {
      const config = { maxAttempts: 1, windowMs: 60000, endpoint: "clear-test" };

      // Exhaust the limit
      await checkRateLimit("test-ip-1", config);
      let result = await checkRateLimit("test-ip-1", config);
      expect(result.allowed).toBe(false);

      // Clear and verify
      await clearRateLimit("test-ip-1", "clear-test");
      result = await checkRateLimit("test-ip-1", config);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);
    });

    it("should clear all endpoints for an IP when endpoint not specified", async () => {
      const config1 = { maxAttempts: 1, windowMs: 60000, endpoint: "endpoint-1" };
      const config2 = { maxAttempts: 1, windowMs: 60000, endpoint: "endpoint-2" };

      // Exhaust both endpoints
      await checkRateLimit("test-ip-1", config1);
      await checkRateLimit("test-ip-1", config1);
      await checkRateLimit("test-ip-1", config2);
      await checkRateLimit("test-ip-1", config2);

      // Clear all
      await clearRateLimit("test-ip-1");

      // Both should be reset
      expect((await checkRateLimit("test-ip-1", config1)).allowed).toBe(true);
      expect((await checkRateLimit("test-ip-1", config2)).allowed).toBe(true);
    });
  });

  describe("getRateLimitStatus", () => {
    it("should return null for unknown identifier", async () => {
      const status = await getRateLimitStatus("unknown-ip", "unknown-endpoint");
      expect(status).toBeNull();
    });

    it("should return current status for tracked identifier", async () => {
      const config = { maxAttempts: 5, windowMs: 60000, endpoint: "status-test" };
      
      await checkRateLimit("test-ip-1", config);
      await checkRateLimit("test-ip-1", config);

      const status = await getRateLimitStatus("test-ip-1", "status-test");
      expect(status).not.toBeNull();
      expect(status?.count).toBe(2);
    });
  });

  describe("authentication rate limits", () => {
    it("should support staff auth rate limit config (5 attempts per 15 min)", async () => {
      const staffAuthConfig = {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
        endpoint: "staff-auth",
      };

      // First 5 attempts should be allowed
      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit("staff-test-ip", staffAuthConfig);
        expect(result.allowed).toBe(true);
      }

      // 6th attempt should be blocked
      const blocked = await checkRateLimit("staff-test-ip", staffAuthConfig);
      expect(blocked.allowed).toBe(false);
      
      // Verify wait time is provided
      expect(blocked.resetIn).toBeGreaterThan(0);
      expect(blocked.resetIn).toBeLessThanOrEqual(15 * 60 * 1000);

      // Cleanup
      await clearRateLimit("staff-test-ip");
    });

    it("should support patron auth rate limit config (10 attempts per 15 min)", async () => {
      const patronAuthConfig = {
        maxAttempts: 10,
        windowMs: 15 * 60 * 1000, // 15 minutes
        endpoint: "patron-auth",
      };

      // First 10 attempts should be allowed
      for (let i = 0; i < 10; i++) {
        const result = await checkRateLimit("patron-test-ip", patronAuthConfig);
        expect(result.allowed).toBe(true);
      }

      // 11th attempt should be blocked
      const blocked = await checkRateLimit("patron-test-ip", patronAuthConfig);
      expect(blocked.allowed).toBe(false);

      // Cleanup
      await clearRateLimit("patron-test-ip");
    });
  });
});
