import { describe, expect, test } from "vitest";
import { extractFirstJsonObject, parseAndValidateJson } from "@/lib/ai/json";
import { z } from "zod";

describe("AI JSON parsing", () => {
  test("extracts the first JSON object from text", () => {
    const text = "Here you go:\\n\\n```json\\n{\"a\":1}\\n```\\nThanks!";
    expect(extractFirstJsonObject(text)).toBe("{\"a\":1}");
  });

  test("parses and validates with Zod", () => {
    const schema = z.object({ ok: z.boolean(), n: z.number() });
    const text = "{\"ok\":true,\"n\":2}";
    expect(parseAndValidateJson(text, schema)).toEqual({ ok: true, n: 2 });
  });
});

