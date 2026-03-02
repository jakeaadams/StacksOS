import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifyAiError } from "@/lib/ai/error-classification";

describe("classifyAiError", () => {
  it("classifies disabled AI", () => {
    expect(classifyAiError(new Error("AI is disabled for this tenant"))).toBe("disabled");
  });

  it("classifies misconfigured providers", () => {
    expect(classifyAiError(new Error("Grok is not configured (missing GROK_API_KEY)"))).toBe(
      "misconfigured"
    );
  });

  it("classifies network/transient failures", () => {
    expect(classifyAiError(new Error("fetch failed: socket hang up"))).toBe("transient");
  });

  it("classifies malformed JSON outputs as transient", () => {
    expect(classifyAiError(new SyntaxError("Unexpected token 'h' in JSON at position 1"))).toBe(
      "transient"
    );
  });

  it("classifies zod schema violations as transient", () => {
    const schema = z.object({ summary: z.string() });
    const result = schema.safeParse({ summary: 42 });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected parse failure");
    }

    expect(classifyAiError(result.error)).toBe("transient");
  });

  it("returns unknown for unrelated errors", () => {
    expect(classifyAiError(new Error("something unexpected happened"))).toBe("unknown");
  });
});
