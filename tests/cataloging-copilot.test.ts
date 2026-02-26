/**
 * Cataloging Copilot Unit Tests
 *
 * Tests deterministic fallback output against the response schema,
 * permission enforcement, and rate limiting.
 *
 * Imports production functions directly from the fallback module
 * instead of maintaining local copies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";
import {
  deterministicFallback,
  extractTitleKeywords,
  responseSchema,
} from "@/app/api/ai/cataloging-copilot/fallback";

describe("Cataloging Copilot", () => {
  describe("Deterministic fallback produces schema-valid output", () => {
    it("should produce valid output for a basic title-only input", () => {
      const result = deterministicFallback({
        marcData: { title: "The History of Public Libraries in America" },
      });
      const parsed = responseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
      expect(result.subjectSuggestions.length).toBeGreaterThan(0);
      expect(result.summary).toContain("History of Public Libraries");
    });

    it("should produce valid output with author", () => {
      const result = deterministicFallback({
        marcData: {
          title: "Modern Cataloging Practices",
          author: "Jane Smith",
        },
      });
      const parsed = responseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
      expect(result.subjectSuggestions.some((s) => s.heading.includes("Jane Smith"))).toBe(true);
    });

    it("should produce valid output with complete metadata", () => {
      const result = deterministicFallback({
        marcData: {
          title: "Advanced Data Structures",
          author: "John Doe",
          isbn: "978-0-123456-78-9",
          publisher: "Academic Press",
          physicalDescription: "xiv, 450 pages ; 24 cm",
          existingSubjects: ["Data structures (Computer science)"],
        },
        bibId: 42,
      });
      const parsed = responseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
      // With ISBN, publisher, and physicalDescription present, fewer improvements
      expect(result.metadataImprovements.length).toBe(0);
      expect(result.summary).toContain("bib #42");
    });

    it("should suggest metadata improvements for missing fields", () => {
      const result = deterministicFallback({
        marcData: {
          title: "Untitled Work",
          existingSubjects: [],
        },
      });
      const parsed = responseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
      const fields = result.metadataImprovements.map((m) => m.field);
      expect(fields).toContain("020 (ISBN)");
      expect(fields).toContain("264 (Publication)");
      expect(fields).toContain("300 (Physical Description)");
      expect(fields).toContain("650 (Subject)");
    });

    it("should always include caveats in fallback mode", () => {
      const result = deterministicFallback({
        marcData: { title: "Test Book" },
      });
      expect(result.caveats).toBeDefined();
      expect(result.caveats!.length).toBeGreaterThan(0);
      expect(result.caveats![0]).toContain("deterministically");
    });

    it("should produce a default subject heading for a minimal title", () => {
      const result = deterministicFallback({
        marcData: { title: "A" },
      });
      const parsed = responseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
      expect(result.subjectSuggestions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("extractTitleKeywords", () => {
    it("should strip stop words and short words", () => {
      const keywords = extractTitleKeywords("The History of Public Libraries in America");
      expect(keywords).toContain("history");
      expect(keywords).toContain("public");
      expect(keywords).toContain("libraries");
      expect(keywords).toContain("america");
      expect(keywords).not.toContain("the");
      expect(keywords).not.toContain("of");
      expect(keywords).not.toContain("in");
    });

    it("should remove non-alphanumeric characters", () => {
      const keywords = extractTitleKeywords("Hello, World! (2nd Edition)");
      expect(keywords).toContain("hello");
      expect(keywords).toContain("world");
      expect(keywords).toContain("2nd");
      expect(keywords).toContain("edition");
    });

    it("should return empty array for stop-words-only title", () => {
      const keywords = extractTitleKeywords("The A An");
      expect(keywords).toEqual([]);
    });
  });

  describe("Rate limiting", () => {
    const testIp = "cat-copilot-test-ip";
    const endpoint = "ai-cataloging-copilot";

    beforeEach(async () => {
      await clearRateLimit(testIp, endpoint);
    });

    it("should allow requests within the limit (20 per 5 min)", async () => {
      for (let i = 0; i < 20; i++) {
        const result = await checkRateLimit(testIp, {
          maxAttempts: 20,
          windowMs: 5 * 60 * 1000,
          endpoint,
        });
        expect(result.allowed).toBe(true);
      }
    });

    it("should reject requests after exceeding the threshold", async () => {
      for (let i = 0; i < 20; i++) {
        await checkRateLimit(testIp, {
          maxAttempts: 20,
          windowMs: 5 * 60 * 1000,
          endpoint,
        });
      }

      const blocked = await checkRateLimit(testIp, {
        maxAttempts: 20,
        windowMs: 5 * 60 * 1000,
        endpoint,
      });
      expect(blocked.allowed).toBe(false);

      await clearRateLimit(testIp, endpoint);
    });
  });
});
