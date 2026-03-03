import { z } from "zod";

export function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Fast path: already JSON.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;

  // Find the first '{' and try progressively longer substrings ending with '}'
  // until JSON.parse succeeds. This is immune to braces inside strings.
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace < 0) return null;

  // Walk forward from the first '{' to each '}' and try to parse.
  for (let i = firstBrace + 1; i < trimmed.length; i++) {
    if (trimmed[i] !== "}") continue;
    const candidate = trimmed.slice(firstBrace, i + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Not valid JSON yet; keep going.
    }
  }

  return null;
}

export function parseAndValidateJson<T>(text: string, schema: z.ZodSchema<T>): T {
  const candidate = extractFirstJsonObject(text) ?? text;
  const parsed = JSON.parse(candidate);
  return schema.parse(parsed);
}
