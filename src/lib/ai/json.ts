import { z } from "zod";

export function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Fast path: already JSON.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;

  // Heuristic: find the first {...} block.
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  for (let i = firstBrace; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const candidate = trimmed.slice(firstBrace, i + 1).trim();
      return candidate.startsWith("{") ? candidate : null;
    }
  }

  return null;
}

export function parseAndValidateJson<T>(text: string, schema: z.ZodSchema<T>): T {
  const candidate = extractFirstJsonObject(text) ?? text;
  const parsed = JSON.parse(candidate);
  return schema.parse(parsed);
}

