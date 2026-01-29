/**
 * Rate Limiting Unit Tests
 * 
 * Tests the rate limiting functionality used to protect authentication endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  clearRateLimit,
  getRateLimitStatus,
} from "@/lib/rate-limit";

describe("Rate Limiting", () => {
  beforeEach(() => {
    // Clear all rate limits before each test
    clearRateLimit("test-ip-1");
    clearRateLimit("test-ip-2");
    clearRateLimit("test-ip-3");
  });

  describe("checkRateLimit", () => {
    it("should allow first request", () => {
      const result = checkRateLimit("test-ip-1", {
        maxAttempts: 5,
        windowMs: 60000,
        endpoint: "test-endpoint",
      });

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);
      expect(result.limit).toBe(5);
    });

    it("should track multiple attempts", () => {
      const config = {
        maxAttempts: 3,
        windowMs: 60000,
        endpoint: "test-endpoint-2",
      };

      // First attempt
      let result = checkRateLimit("test-ip-2", config);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);

      // Second attempt
      result = checkRateLimit("test-ip-2", config);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(2);

      // Third attempt
      result = checkRateLimit("test-ip-2", config);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(3);
    });

    it("should block requests exceeding limit", () => {
      const config = {
        maxAttempts: 2,
        windowMs: 60000,
        endpoint: "test-endpoint-3",
      };

      // First two allowed
      checkRateLimit("test-ip-3", config);
      checkRateLimit("test-ip-3", config);

      // Third should be blocked
      const result = checkRateLimit("test-ip-3", config);
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(3);
    });

    it("should use default endpoint if not specified", () => {
      const result = checkRateLimit("test-ip-1", {
        maxAttempts: 5,
        windowMs: 60000,
      });

      expect(result.allowed).toBe(true);
    });

    it("should track different endpoints separately", () => {
      const config1 = { maxAttempts: 1, windowMs: 60000, endpoint: "endpoint-a" };
      const config2 = { maxAttempts: 1, windowMs: 60000, endpoint: "endpoint-b" };

      // Exhaust limit on endpoint A
      checkRateLimit("test-ip-1", config1);
      const resultA = checkRateLimit("test-ip-1", config1);
      expect(resultA.allowed).toBe(false);

      // Endpoint B should still be allowed
      const resultB = checkRateLimit("test-ip-1", config2);
      expect(resultB.allowed).toBe(true);
    });

    it("should track different IPs separately", () => {
      const config = { maxAttempts: 1, windowMs: 60000, endpoint: "shared-endpoint" };

      // Exhaust limit for IP 1
      checkRateLimit("test-ip-1", config);
      const result1 = checkRateLimit("test-ip-1", config);
      expect(result1.allowed).toBe(false);

      // IP 2 should still be allowed
      const result2 = checkRateLimit("test-ip-2", config);
      expect(result2.allowed).toBe(true);
    });

    it("should provide correct reset time information", () => {
      const windowMs = 60000;
      const result = checkRateLimit("test-ip-1", {
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
    it("should clear rate limit for specific endpoint", () => {
      const config = { maxAttempts: 1, windowMs: 60000, endpoint: "clear-test" };

      // Exhaust the limit
      checkRateLimit("test-ip-1", config);
      let result = checkRateLimit("test-ip-1", config);
      expect(result.allowed).toBe(false);

      // Clear and verify
      clearRateLimit("test-ip-1", "clear-test");
      result = checkRateLimit("test-ip-1", config);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);
    });

    it("should clear all endpoints for an IP when endpoint not specified", () => {
      const config1 = { maxAttempts: 1, windowMs: 60000, endpoint: "endpoint-1" };
      const config2 = { maxAttempts: 1, windowMs: 60000, endpoint: "endpoint-2" };

      // Exhaust both endpoints
      checkRateLimit("test-ip-1", config1);
      checkRateLimit("test-ip-1", config1);
      checkRateLimit("test-ip-1", config2);
      checkRateLimit("test-ip-1", config2);

      // Clear all
      clearRateLimit("test-ip-1");

      // Both should be reset
      expect(checkRateLimit("test-ip-1", config1).allowed).toBe(true);
      expect(checkRateLimit("test-ip-1", config2).allowed).toBe(true);
    });
  });

  describe("getRateLimitStatus", () => {
    it("should return null for unknown identifier", () => {
      const status = getRateLimitStatus("unknown-ip", "unknown-endpoint");
      expect(status).toBeNull();
    });

    it("should return current status for tracked identifier", () => {
      const config = { maxAttempts: 5, windowMs: 60000, endpoint: "status-test" };
      
      checkRateLimit("test-ip-1", config);
      checkRateLimit("test-ip-1", config);

      const status = getRateLimitStatus("test-ip-1", "status-test");
      expect(status).not.toBeNull();
      expect(status?.count).toBe(2);
    });
  });

  describe("authentication rate limits", () => {
    it("should support staff auth rate limit config (5 attempts per 15 min)", () => {
      const staffAuthConfig = {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
        endpoint: "staff-auth",
      };

      // First 5 attempts should be allowed
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit("staff-test-ip", staffAuthConfig);
        expect(result.allowed).toBe(true);
      }

      // 6th attempt should be blocked
      const blocked = checkRateLimit("staff-test-ip", staffAuthConfig);
      expect(blocked.allowed).toBe(false);
      
      // Verify wait time is provided
      expect(blocked.resetIn).toBeGreaterThan(0);
      expect(blocked.resetIn).toBeLessThanOrEqual(15 * 60 * 1000);

      // Cleanup
      clearRateLimit("staff-test-ip");
    });

    it("should support patron auth rate limit config (10 attempts per 15 min)", () => {
      const patronAuthConfig = {
        maxAttempts: 10,
        windowMs: 15 * 60 * 1000, // 15 minutes
        endpoint: "patron-auth",
      };

      // First 10 attempts should be allowed
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit("patron-test-ip", patronAuthConfig);
        expect(result.allowed).toBe(true);
      }

      // 11th attempt should be blocked
      const blocked = checkRateLimit("patron-test-ip", patronAuthConfig);
      expect(blocked.allowed).toBe(false);

      // Cleanup
      clearRateLimit("patron-test-ip");
    });
  });
});
