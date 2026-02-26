/**
 * Format Utilities Tests
 *
 * Tests the shared formatting functions used across UI and export code.
 */

import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/format";

describe("formatDate", () => {
  it("formats a valid ISO date string", () => {
    const result = formatDate("2026-03-15T10:00:00.000Z");
    expect(result).toBeTruthy();
    // Should contain the year, month, and day in some locale format
    expect(result).toContain("2026");
    expect(result).toMatch(/03.*15|15.*03/);
  });

  it("formats a Date object", () => {
    const result = formatDate(new Date("2026-01-05"));
    expect(result).toBeTruthy();
    expect(result).toContain("2026");
  });

  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatDate("")).toBe("");
  });

  it("returns empty string for invalid date string", () => {
    expect(formatDate("not-a-date")).toBe("");
  });

  it("respects locale parameter when provided", () => {
    // Use a Date object to avoid timezone-dependent string parsing
    const result = formatDate(new Date(2026, 2, 15), "en-US");
    expect(result).toBeTruthy();
    // en-US uses MM/DD/YYYY
    expect(result).toMatch(/03\/15\/2026/);
  });
});

describe("formatDateTime", () => {
  it("formats a valid ISO datetime string with time component", () => {
    const result = formatDateTime("2026-03-15T14:30:00.000Z");
    expect(result).toBeTruthy();
    expect(result).toContain("2026");
    // Should include some time representation
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("formats a Date object with time", () => {
    const date = new Date("2026-06-01T09:15:00Z");
    const result = formatDateTime(date);
    expect(result).toBeTruthy();
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns empty string for null", () => {
    expect(formatDateTime(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDateTime(undefined)).toBe("");
  });

  it("returns empty string for invalid date string", () => {
    expect(formatDateTime("invalid")).toBe("");
  });

  it("respects locale parameter", () => {
    const result = formatDateTime("2026-03-15T14:30:00.000Z", "en-US");
    expect(result).toBeTruthy();
    expect(result).toContain("2026");
  });
});

describe("formatCurrency", () => {
  it("formats a positive number as USD by default", () => {
    const result = formatCurrency(42.5);
    expect(result).toMatch(/\$42\.50/);
  });

  it("formats zero", () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/\$0\.00/);
  });

  it("formats a negative number", () => {
    const result = formatCurrency(-15.99);
    // Should contain the dollar sign and the amount
    expect(result).toMatch(/15\.99/);
    // Should indicate negative (various locale representations exist)
    expect(result).toMatch(/-|\(/);
  });

  it("returns empty string for null", () => {
    expect(formatCurrency(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatCurrency(undefined)).toBe("");
  });

  it("returns empty string for NaN", () => {
    expect(formatCurrency(NaN)).toBe("");
  });

  it("returns empty string for Infinity", () => {
    expect(formatCurrency(Infinity)).toBe("");
  });

  it("returns empty string for -Infinity", () => {
    expect(formatCurrency(-Infinity)).toBe("");
  });

  it("formats with a different currency code", () => {
    const result = formatCurrency(100, "EUR");
    expect(result).toBeTruthy();
    // Should contain the euro symbol or "EUR"
    expect(result).toMatch(/€|EUR/);
  });

  it("formats with locale override", () => {
    const result = formatCurrency(1234.56, "USD", "en-US");
    expect(result).toMatch(/\$1,234\.56/);
  });

  it("handles large numbers", () => {
    const result = formatCurrency(1_000_000.99);
    expect(result).toBeTruthy();
    expect(result).toMatch(/1.*000.*000/);
  });

  it("falls back gracefully for invalid currency code", () => {
    // Should not throw, should return some string
    const result = formatCurrency(10, "INVALID_CURRENCY");
    expect(typeof result).toBe("string");
  });
});
