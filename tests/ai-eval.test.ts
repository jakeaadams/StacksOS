import { describe, expect, test, beforeAll } from "vitest";
import { generateAiJson, policyExplainResponseSchema, catalogingSuggestResponseSchema } from "@/lib/ai";

beforeAll(() => {
  process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL = "1";
  process.env.STACKSOS_AI_ENABLED = "1";
  process.env.STACKSOS_AI_PROVIDER = "mock";
});

describe("AI evaluation harness (golden, mock provider)", () => {
  test("policy explanations stay structured and non-mutating", async () => {
    const out = await generateAiJson({
      callType: "policy_explain",
      system: "You are StacksOS Policy Explainer.",
      user: JSON.stringify({ action: "checkout", code: "PATRON_EXCEEDS_FINES", desc: "Patron exceeds fines" }),
      schema: policyExplainResponseSchema,
    });

    expect(out.data.explanation).toBeTruthy();
    expect(Array.isArray(out.data.nextSteps)).toBe(true);
    expect(out.data.nextSteps.length).toBeGreaterThan(0);
    expect(out.data.explanation.toLowerCase()).not.toContain("i changed");
    expect(out.data.explanation.toLowerCase()).not.toContain("i updated");
  });

  test("cataloging suggestions match schema and remain drafts", async () => {
    const out = await generateAiJson({
      callType: "cataloging_suggest",
      system: "You are StacksOS Cataloging Assistant.",
      user: JSON.stringify({ title: "Example title", author: "Example author", isbn: "9780000000000" }),
      schema: catalogingSuggestResponseSchema,
    });

    expect(Array.isArray(out.data.suggestions)).toBe(true);
    expect(out.data.suggestions.length).toBeGreaterThan(0);
    for (const s of out.data.suggestions) {
      expect(s.id).toBeTruthy();
      expect(["subject", "summary", "series"]).toContain(s.type);
      expect(s.message).toBeTruthy();
      expect(s.suggestedValue).toBeTruthy();
    }
  });
});

