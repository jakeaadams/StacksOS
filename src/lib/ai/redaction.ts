const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

// US-centric phone redaction (good enough for audit safety; not perfect).
// Avoid `\b` because many phone formats start with "(" which is not a word char.
const PHONE_RE = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

// Evergreen-style barcodes are often long digit sequences. Avoid redacting years, etc.
const LONG_DIGITS_RE = /\b\d{12,20}\b/g;

const NAME_KEYS_LOWER = new Set(
  [
    "firstName",
    "lastName",
    "middleName",
    "displayName",
    "first_given_name",
    "family_name",
    "middle_name",
    "usrname",
    "username",
  ].map((s) => s.toLowerCase())
);

function redactValueForKey(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const k = key.toLowerCase();

  if (typeof value === "string") {
    if (k.includes("email")) return "[REDACTED_EMAIL]";
    if (k.includes("phone")) return "[REDACTED_PHONE]";
    if (k.includes("barcode")) return "[REDACTED_BARCODE]";
    if (NAME_KEYS_LOWER.has(k)) return "[REDACTED_NAME]";
  }

  return value;
}

export function redactText(input: string): string {
  return input
    .replaceAll(EMAIL_RE, "[REDACTED_EMAIL]")
    .replaceAll(PHONE_RE, "[REDACTED_PHONE]")
    .replaceAll(LONG_DIGITS_RE, "[REDACTED_NUMBER]");
}

export function redactObject<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value) as unknown as T;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v: unknown) => redactObject(v)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const keyed = redactValueForKey(k, v);
    out[k] = redactObject(keyed);
  }
  return out as unknown as T;
}
