const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Normalize checkout due-date input for Evergreen checkout calls.
 *
 * - Date-only input (`YYYY-MM-DD`) becomes local end-of-day (`YYYY-MM-DDT23:59:59`)
 *   to avoid timezone drift from UTC conversion.
 * - Datetime input is accepted as-is (seconds added when omitted).
 * - Unparseable values return null.
 */
export function normalizeCheckoutDueDate(input: string | null | undefined): string | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;

  if (DATE_ONLY_RE.test(raw)) {
    return `${raw}T23:59:59`;
  }

  if (DATE_TIME_RE.test(raw)) {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
      return `${raw}:00`;
    }
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return [
    `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`,
    `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}:${pad2(parsed.getSeconds())}`,
  ].join("T");
}
