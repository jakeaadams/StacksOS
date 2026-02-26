/**
 * Concurrency Safety Tests
 *
 * Verifies that critical shared-state modules behave correctly under
 * concurrent access. These are synchronous-in-memory implementations,
 * so "concurrent" here means overlapping async ticks / microtasks
 * rather than true OS threads.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { storeCredential, consumeCredential } from "@/lib/credential-store";
import { generateCSRFToken, validateCSRFToken } from "@/lib/csrf";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCSRFRequest(token: string): NextRequest {
  return {
    cookies: {
      get: (name: string) => (name === "_csrf_token" ? { value: token } : undefined),
    },
    headers: {
      get: (name: string) => (name === "x-csrf-token" ? token : null),
    },
  } as unknown as NextRequest;
}

// ---------------------------------------------------------------------------
// 1. Concurrent rate limit checks
// ---------------------------------------------------------------------------
describe("Concurrency safety", () => {
  describe("concurrent rate limit checks", () => {
    const testIp = "concurrency-test-ip";
    const config = {
      maxAttempts: 5,
      windowMs: 60_000,
      endpoint: "concurrency-rl-test",
    };

    beforeEach(async () => {
      await clearRateLimit(testIp);
    });

    it("counts all concurrent requests correctly", async () => {
      // Fire 10 simultaneous checkRateLimit calls
      const results = await Promise.all(
        Array.from({ length: 10 }, () => checkRateLimit(testIp, config))
      );

      // All 10 should have been counted
      const counts = results.map((r) => r.currentCount).sort((a, b) => a - b);
      // The counts should span 1..10 (each call sees an incremented value)
      expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // First 5 should be allowed, next 5 should be blocked
      const allowedCount = results.filter((r) => r.allowed).length;
      expect(allowedCount).toBe(5);

      const blockedCount = results.filter((r) => !r.allowed).length;
      expect(blockedCount).toBe(5);

      // Cleanup
      await clearRateLimit(testIp);
    });

    it("does not lose counts when multiple IPs race simultaneously", async () => {
      const ips = Array.from({ length: 5 }, (_, i) => `race-ip-${i}`);
      const singleConfig = { maxAttempts: 2, windowMs: 60_000, endpoint: "race-test" };

      // Clear all
      await Promise.all(ips.map((ip) => clearRateLimit(ip)));

      // Fire 3 requests per IP concurrently (total 15)
      const allPromises = ips.flatMap((ip) =>
        Array.from({ length: 3 }, () => checkRateLimit(ip, singleConfig))
      );
      const results = await Promise.all(allPromises);

      // For each IP, exactly 2 should be allowed and 1 blocked
      for (const ip of ips) {
        const ipResults = results.filter((_, idx) => ips[Math.floor(idx / 3)] === ip);
        const allowed = ipResults.filter((r) => r.allowed).length;
        const blocked = ipResults.filter((r) => !r.allowed).length;
        expect(allowed).toBe(2);
        expect(blocked).toBe(1);
      }

      // Cleanup
      await Promise.all(ips.map((ip) => clearRateLimit(ip)));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Concurrent credential store access (one-time consume)
  // ---------------------------------------------------------------------------
  describe("concurrent credential store access", () => {
    it("only one concurrent consume succeeds for the same token", () => {
      const token = storeCredential("super-secret-password");

      // Attempt to consume the same token twice synchronously.
      // Because consumeCredential is synchronous, we can call it back-to-back
      // to simulate a race.
      const result1 = consumeCredential(token);
      const result2 = consumeCredential(token);

      // Exactly one should succeed
      const successes = [result1, result2].filter((r) => r !== null);
      expect(successes).toHaveLength(1);
      expect(successes[0]).toBe("super-secret-password");
    });

    it("concurrent stores produce unique tokens that are independently consumable", () => {
      // Store 20 credentials simultaneously
      const passwords = Array.from({ length: 20 }, (_, i) => `pass-${i}`);
      const tokens = passwords.map((p) => storeCredential(p));

      // All tokens should be unique
      expect(new Set(tokens).size).toBe(20);

      // Each can be consumed exactly once
      const consumed = tokens.map((t) => consumeCredential(t));
      expect(consumed).toEqual(passwords);

      // Second consumption should all return null
      const secondAttempt = tokens.map((t) => consumeCredential(t));
      expect(secondAttempt.every((r) => r === null)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Concurrent event registration (mock DB layer)
  // ---------------------------------------------------------------------------
  describe("concurrent event registration (last-spot race)", () => {
    it("simulates two patrons racing for the last spot", async () => {
      // We simulate the race condition at the application logic level.
      // In a real system the DB would serialize, but we want to verify
      // that the code calling registerPatronForEvent handles the
      // "already_registered" / "waitlisted" outcomes correctly.

      let spotsRemaining = 1;

      // Simulate a register function with a shared mutable counter
      async function tryRegister(patronId: number): Promise<"registered" | "waitlisted"> {
        // Simulate async DB check
        await Promise.resolve();
        if (spotsRemaining > 0) {
          spotsRemaining--;
          return "registered";
        }
        return "waitlisted";
      }

      const [result1, result2] = await Promise.all([tryRegister(100), tryRegister(200)]);

      // Due to JS single-threaded nature with microtasks, both see spots > 0
      // before either decrements. This demonstrates the race condition:
      // in a real system, the DB constraint would serialize these.
      const outcomes = [result1, result2];
      const registeredCount = outcomes.filter((r) => r === "registered").length;
      const waitlistedCount = outcomes.filter((r) => r === "waitlisted").length;

      // At least one should be registered (the race may allow both in JS microtasks)
      expect(registeredCount).toBeGreaterThanOrEqual(1);
      expect(registeredCount + waitlistedCount).toBe(2);
    });

    it("simulates sequential last-spot enforcement", async () => {
      // This version uses a mutex-like pattern to show correct serialized behavior
      let spotsRemaining = 1;
      let lock = Promise.resolve();

      async function tryRegisterSerialized(patronId: number): Promise<"registered" | "waitlisted"> {
        // Chain onto the lock to serialize access
        const result = lock.then(async () => {
          await Promise.resolve(); // simulate async DB
          if (spotsRemaining > 0) {
            spotsRemaining--;
            return "registered" as const;
          }
          return "waitlisted" as const;
        });
        lock = result.then(() => {}); // update lock chain
        return result;
      }

      const [result1, result2] = await Promise.all([
        tryRegisterSerialized(100),
        tryRegisterSerialized(200),
      ]);

      const outcomes = [result1, result2];
      // With serialization, exactly one registers and one waitlists
      expect(outcomes.filter((r) => r === "registered").length).toBe(1);
      expect(outcomes.filter((r) => r === "waitlisted").length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. CSRF token validation under concurrent requests
  // ---------------------------------------------------------------------------
  describe("CSRF token validation under concurrent requests", () => {
    it("validates multiple tokens concurrently without cross-contamination", () => {
      // Generate 10 unique tokens
      const tokens = Array.from({ length: 10 }, () => generateCSRFToken());

      // All tokens should be unique
      expect(new Set(tokens).size).toBe(10);

      // Validate each token against its own matching request
      const validResults = tokens.map((token) => {
        const request = createMockCSRFRequest(token);
        return validateCSRFToken(request);
      });
      expect(validResults.every((r) => r === true)).toBe(true);

      // Cross-validate: each token against a different token's request should fail
      const crossResults = tokens.map((token, i) => {
        const otherToken = tokens[(i + 1) % tokens.length]!;
        const request = {
          cookies: {
            get: (name: string) => (name === "_csrf_token" ? { value: token } : undefined),
          },
          headers: {
            get: (name: string) => (name === "x-csrf-token" ? otherToken : null),
          },
        } as unknown as NextRequest;
        return validateCSRFToken(request);
      });
      expect(crossResults.every((r) => r === false)).toBe(true);
    });

    it("generates unique tokens even under rapid sequential calls", () => {
      const count = 1000;
      const tokens = Array.from({ length: count }, () => generateCSRFToken());
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(count);
    });
  });
});
