import { ZodError } from "zod";

export type AiErrorClass = "disabled" | "misconfigured" | "transient" | "unknown";

const TRANSIENT_PATTERNS = [
  "timeout",
  "timed out",
  "aborted",
  "fetch failed",
  "econnreset",
  "socket hang up",
  "network",
  "rate limit",
  "http 429",
  "http 500",
  "http 502",
  "http 503",
  "http 504",
  "invalid input",
  "zoderror",
  "unexpected token",
  "unexpected end of json",
  "cannot parse",
  "failed to parse",
  "json parse",
  "returned an empty completion",
];

const MISCONFIGURED_PATTERNS = [
  "not configured",
  "misconfigured",
  "missing api_key",
  "missing grok_api_key",
  "missing openai_api_key",
  "missing anthropic_api_key",
  "missing provider",
  "unknown ai provider",
  "invalid provider",
];

function normalizeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.toString();
  return String(error || "");
}

export function classifyAiError(error: unknown): AiErrorClass {
  const message = normalizeErrorMessage(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("ai is disabled")) return "disabled";

  if (MISCONFIGURED_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "misconfigured";
  }

  if (error instanceof ZodError) {
    // Provider responded with JSON that does not match our contract.
    return "transient";
  }

  if (error instanceof SyntaxError) {
    // Provider returned malformed JSON payload.
    return "transient";
  }

  if (TRANSIENT_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "transient";
  }

  return "unknown";
}
