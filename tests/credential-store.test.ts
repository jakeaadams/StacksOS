/**
 * Credential Store Unit Tests
 *
 * Tests the one-time credential store used for patron password retrieval.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { storeCredential, consumeCredential } from "@/lib/credential-store";

describe("Credential Store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("storeCredential", () => {
    it("should return a UUID token", () => {
      const token = storeCredential("mySecretPassword");
      // UUID v4 pattern
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("should return unique tokens for different passwords", () => {
      const token1 = storeCredential("password1");
      const token2 = storeCredential("password2");
      expect(token1).not.toBe(token2);
    });

    it("should return unique tokens for the same password", () => {
      const token1 = storeCredential("samePassword");
      const token2 = storeCredential("samePassword");
      expect(token1).not.toBe(token2);
    });
  });

  describe("consumeCredential", () => {
    it("should return the stored password on first retrieval", () => {
      const token = storeCredential("secret123");
      const result = consumeCredential(token);
      expect(result).toBe("secret123");
    });

    it("should return null on second retrieval (one-time use)", () => {
      const token = storeCredential("secret123");
      consumeCredential(token); // first retrieval
      const result = consumeCredential(token); // second retrieval
      expect(result).toBeNull();
    });

    it("should return null for an invalid token", () => {
      const result = consumeCredential("nonexistent-token");
      expect(result).toBeNull();
    });

    it("should return null for an empty string token", () => {
      const result = consumeCredential("");
      expect(result).toBeNull();
    });

    it("should return null for expired credentials", () => {
      const token = storeCredential("expiring-password");

      // Advance time past the 5-minute TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      const result = consumeCredential(token);
      expect(result).toBeNull();
    });

    it("should return password if retrieved before TTL expires", () => {
      const token = storeCredential("still-valid");

      // Advance time but stay within TTL
      vi.advanceTimersByTime(4 * 60 * 1000);

      const result = consumeCredential(token);
      expect(result).toBe("still-valid");
    });
  });
});
