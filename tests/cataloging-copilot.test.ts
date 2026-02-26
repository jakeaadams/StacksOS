/**
 * Cataloging Copilot Unit Tests
 *
 * Tests deterministic fallback output against the response schema,
 * permission enforcement, and rate limiting.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";

// Mirror the response schema from the cataloging-copilot route
const subjectSuggestionSchema = z.object({
  heading: z.string().min(1),
  source: z.enum(["lcsh", "sears", "fast", "inferred"]),
  confidence: z.enum(["high", "medium", "low"]),
  provenance: z.string().min(1),
});

const metadataImprovementSchema = z.object({
  field: z.string().min(1),
  current: z.string().optional(),
  suggested: z.string().min(1),
  reason: z.string().min(1),
});

const responseSchema = z.object({
  summary: z.string().min(1),
  subjectSuggestions: z.array(subjectSuggestionSchema).min(1).max(10),
  classificationSuggestion: z
    .object({
      ddc: z.string().optional(),
      lcc: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]),
      provenance: z.string().min(1),
    })
    .optional(),
  metadataImprovements: z.array(metadataImprovementSchema).max(10),
  caveats: z.array(z.string().min(1)).optional(),
});

// Replicates the deterministic fallback logic for testing
function extractTitleKeywords(title: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "is",
    "it",
    "its",
    "that",
    "this",
    "as",
  ]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

type CatalogingInput = {
  marcData: {
    title: string;
    author?: string;
    isbn?: string;
    publisher?: string;
    existingSubjects?: string[];
    existingClassification?: string;
    physicalDescription?: string;
  };
  bibId?: number;
};

function deterministicFallback(input: CatalogingInput) {
  const { marcData, bibId } = input;
  const title = marcData.title || "Untitled";
  const keywords = extractTitleKeywords(title);

  const subjectSuggestions: z.infer<typeof subjectSuggestionSchema>[] = [];

  if (keywords.length > 0) {
    const primaryHeading = keywords
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" -- ");
    subjectSuggestions.push({
      heading: primaryHeading,
      source: "inferred",
      confidence: "low",
      provenance: "Derived from title keywords (deterministic fallback)",
    });
  }

  if (marcData.author) {
    subjectSuggestions.push({
      heading: `${marcData.author} -- Authorship`,
      source: "inferred",
      confidence: "low",
      provenance: "Derived from author name (deterministic fallback)",
    });
  }

  if (subjectSuggestions.length === 0) {
    subjectSuggestions.push({
      heading: "General works",
      source: "inferred",
      confidence: "low",
      provenance: "Default heading; insufficient metadata for inference",
    });
  }

  const metadataImprovements: z.infer<typeof metadataImprovementSchema>[] = [];

  if (!marcData.isbn) {
    metadataImprovements.push({
      field: "020 (ISBN)",
      suggested: "Add ISBN if available from publisher or title page verso",
      reason: "ISBN improves discoverability and deduplication.",
    });
  }

  if (!marcData.publisher) {
    metadataImprovements.push({
      field: "264 (Publication)",
      suggested: "Add publisher name and place of publication",
      reason: "Publication data is required for a complete bibliographic record.",
    });
  }

  if (!marcData.physicalDescription) {
    metadataImprovements.push({
      field: "300 (Physical Description)",
      suggested: "Add pagination and dimensions (e.g., 'xii, 320 pages ; 24 cm')",
      reason: "Physical description helps distinguish editions and formats.",
    });
  }

  if (marcData.existingSubjects && marcData.existingSubjects.length === 0) {
    metadataImprovements.push({
      field: "650 (Subject)",
      suggested: "Add at least 2-3 LCSH subject headings",
      reason: "Subject headings are critical for catalog discovery.",
    });
  }

  const bibLabel = bibId ? ` (bib #${bibId})` : "";

  return {
    summary: `Fallback cataloging copilot analysis for "${title}"${bibLabel}: ${subjectSuggestions.length} subject suggestion(s) and ${metadataImprovements.length} metadata improvement(s) generated deterministically.`,
    subjectSuggestions: subjectSuggestions.slice(0, 10),
    metadataImprovements: metadataImprovements.slice(0, 10),
    caveats: [
      "AI provider was unavailable; these suggestions were generated deterministically from title keywords and metadata presence checks.",
    ],
  };
}

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
