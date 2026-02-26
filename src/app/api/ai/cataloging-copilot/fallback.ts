import { z } from "zod";

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

export const responseSchema = z.object({
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

export type CatalogingCopilotResponse = z.infer<typeof responseSchema>;

export type CatalogingCopilotRequest = {
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

export function extractTitleKeywords(title: string): string[] {
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

export function deterministicFallback(input: CatalogingCopilotRequest): CatalogingCopilotResponse {
  const { marcData, bibId } = input;
  const title = marcData.title || "Untitled";
  const keywords = extractTitleKeywords(title);

  const subjectSuggestions: CatalogingCopilotResponse["subjectSuggestions"] = [];

  // Generate basic LCSH-style headings from title keywords
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

  // Ensure at least one subject suggestion
  if (subjectSuggestions.length === 0) {
    subjectSuggestions.push({
      heading: "General works",
      source: "inferred",
      confidence: "low",
      provenance: "Default heading; insufficient metadata for inference",
    });
  }

  const metadataImprovements: CatalogingCopilotResponse["metadataImprovements"] = [];

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
