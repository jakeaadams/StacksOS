/**
 * Formatting utilities shared across UI + export code.
 *
 * Keep these dependency-free so they can be used in both browser + server contexts.
 */

export function formatDate(value: string | Date | null | undefined, locale?: string): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function formatDateTime(value: string | Date | null | undefined, locale?: string): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function formatCurrency(
  value: number | null | undefined,
  currency: string = "USD",
  locale?: string
): string {
  if (value == null) return "";
  if (!Number.isFinite(value)) return "";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    // Fallback (e.g., invalid currency code)
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    return `${sign}$${abs.toFixed(2)}`;
  }
}

