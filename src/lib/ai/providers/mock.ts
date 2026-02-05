import type { AiCompletion } from "../types";
import type { AiProvider, AiJsonRequest } from "./provider";
import { validateProviderJson } from "./provider";

function buildMockPayload(system: string, user: string): unknown {
  const sys = system.toLowerCase();
  if (sys.includes("policy explainer")) {
    return {
      explanation: "This action was blocked by circulation policy. Review the reason and confirm eligibility before overriding.",
      nextSteps: [
        "Verify the patron and item are correct.",
        "Read the Evergreen code shown in the error for the exact policy reason.",
        "If an override is available, enter a clear reason and proceed.",
      ],
      suggestedNote: "Override requested after verifying patron identity and policy eligibility.",
      requiresConfirmation: true,
    };
  }
  if (sys.includes("cataloging assistant")) {
    return {
      suggestions: [
        {
          id: "mock-subject-1",
          type: "subject",
          confidence: 0.72,
          message: "Add a topical subject heading based on the title.",
          suggestedValue: "StacksOS (Computer software)",
          provenance: ["Derived from title metadata"],
        },
        {
          id: "mock-summary-1",
          type: "summary",
          confidence: 0.66,
          message: "Provide a short staff-editable summary.",
          suggestedValue: "A practical introduction to StacksOS features and workflows.",
          provenance: ["Derived from title/author metadata"],
        },
      ],
    };
  }
  if (sys.includes("analytics narrator")) {
    return {
      summary: "Today’s circulation activity is steady. Holds are within normal range based on the provided counts.",
      highlights: [
        "Checkouts and checkins are within expected daily volume.",
        "Pending holds and in-transit holds are balanced.",
      ],
      caveats: ["This summary uses aggregate counts only."],
      drilldowns: [
        { label: "Reports dashboard", url: "/staff/reports" },
        { label: "Holds management", url: "/staff/circulation/holds-management" },
      ],
    };
  }
  if (sys.includes("reranker") || sys.includes("search reranker")) {
    // Best-effort: leave original order but provide reasons.
    try {
      const parsed = JSON.parse(user);
      const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
      return {
        ranked: candidates.slice(0, 20).map((c: any, idx: number) => ({
          id: c.id,
          score: Math.max(0, Math.min(1, 1 - idx * 0.02)),
          reason: "Matches query keywords and intent.",
        })),
      };
    } catch {
      return { ranked: [] };
    }
  }
  return { ok: true };
}

export const mockProvider: AiProvider = {
  id: "mock",
  async completeJson<T>(req: AiJsonRequest<T>) {
    const payload = buildMockPayload(req.system, req.user);
    const completion: AiCompletion = {
      provider: "mock",
      model: "mock",
      text: JSON.stringify(payload),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
    const data = await validateProviderJson(completion, req.schema);
    return { data, completion };
  },
};

