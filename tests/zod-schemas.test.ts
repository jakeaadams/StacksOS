/**
 * Zod Schema Validation Unit Tests
 *
 * Tests key Zod schemas used across the application.
 */

import { describe, it, expect } from "vitest";
import {
  policyExplainResponseSchema,
  catalogingSuggestResponseSchema,
} from "@/lib/ai/index";
import { aiProviderSchema, aiSafetyModeSchema } from "@/lib/ai/types";

describe("Zod Schemas", () => {
  describe("aiProviderSchema", () => {
    it("should accept 'openai'", () => {
      expect(aiProviderSchema.parse("openai")).toBe("openai");
    });

    it("should accept 'anthropic'", () => {
      expect(aiProviderSchema.parse("anthropic")).toBe("anthropic");
    });

    it("should accept 'moonshot'", () => {
      expect(aiProviderSchema.parse("moonshot")).toBe("moonshot");
    });

    it("should accept 'mock'", () => {
      expect(aiProviderSchema.parse("mock")).toBe("mock");
    });

    it("should reject invalid provider", () => {
      expect(() => aiProviderSchema.parse("invalid")).toThrow();
    });

    it("should reject empty string", () => {
      expect(() => aiProviderSchema.parse("")).toThrow();
    });
  });

  describe("aiSafetyModeSchema", () => {
    it("should accept 'strict'", () => {
      expect(aiSafetyModeSchema.parse("strict")).toBe("strict");
    });

    it("should accept 'balanced'", () => {
      expect(aiSafetyModeSchema.parse("balanced")).toBe("balanced");
    });

    it("should accept 'off'", () => {
      expect(aiSafetyModeSchema.parse("off")).toBe("off");
    });

    it("should reject invalid mode", () => {
      expect(() => aiSafetyModeSchema.parse("none")).toThrow();
    });
  });

  describe("policyExplainResponseSchema", () => {
    it("should accept valid policy explanation", () => {
      const valid = {
        explanation: "This policy allows checkout for 21 days",
        nextSteps: ["Check the due date", "Renew if needed"],
      };
      const result = policyExplainResponseSchema.parse(valid);
      expect(result.explanation).toBe("This policy allows checkout for 21 days");
      expect(result.nextSteps).toHaveLength(2);
    });

    it("should reject missing explanation", () => {
      expect(() =>
        policyExplainResponseSchema.parse({ nextSteps: ["step"] })
      ).toThrow();
    });

    it("should reject missing nextSteps", () => {
      expect(() =>
        policyExplainResponseSchema.parse({ explanation: "test" })
      ).toThrow();
    });

    it("should reject empty nextSteps array", () => {
      expect(() =>
        policyExplainResponseSchema.parse({
          explanation: "test",
          nextSteps: [],
        })
      ).toThrow();
    });

    it("should accept with optional suggestedNote", () => {
      const valid = {
        explanation: "Policy explanation",
        nextSteps: ["Step 1"],
        suggestedNote: "Additional note",
      };
      const result = policyExplainResponseSchema.parse(valid);
      expect(result.suggestedNote).toBe("Additional note");
    });

    it("should default requiresConfirmation to true", () => {
      const valid = {
        explanation: "Policy explanation",
        nextSteps: ["Step 1"],
      };
      const result = policyExplainResponseSchema.parse(valid);
      expect(result.requiresConfirmation).toBe(true);
    });
  });

  describe("catalogingSuggestResponseSchema", () => {
    it("should accept valid cataloging suggestions", () => {
      const valid = {
        suggestions: [
          {
            id: "s1",
            type: "subject" as const,
            confidence: 0.95,
            message: "Suggested subject heading",
            suggestedValue: "Libraries -- Fiction",
          },
        ],
      };
      const result = catalogingSuggestResponseSchema.parse(valid);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]!.confidence).toBe(0.95);
    });

    it("should accept empty suggestions array", () => {
      const valid = { suggestions: [] };
      const result = catalogingSuggestResponseSchema.parse(valid);
      expect(result.suggestions).toHaveLength(0);
    });

    it("should reject missing suggestions field", () => {
      expect(() => catalogingSuggestResponseSchema.parse({})).toThrow();
    });

    it("should reject invalid suggestion type", () => {
      expect(() =>
        catalogingSuggestResponseSchema.parse({
          suggestions: [
            {
              id: "s1",
              type: "invalid_type",
              confidence: 0.5,
              message: "msg",
              suggestedValue: "val",
            },
          ],
        })
      ).toThrow();
    });

    it("should reject confidence out of range", () => {
      expect(() =>
        catalogingSuggestResponseSchema.parse({
          suggestions: [
            {
              id: "s1",
              type: "subject",
              confidence: 1.5,
              message: "msg",
              suggestedValue: "val",
            },
          ],
        })
      ).toThrow();
    });
  });
});
