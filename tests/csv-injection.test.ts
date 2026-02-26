/**
 * CSV Injection Defense Tests
 *
 * Verifies that CSV export utilities properly defend against formula injection
 * attacks. Tests both the generic escapeCSVValue (in src/lib/csv.ts) and the
 * K-12 specific escapeCsvValue (in src/lib/k12/export-helpers.ts).
 */

import { describe, it, expect } from "vitest";
import { convertToCSV, toCSVWithColumns } from "@/lib/csv";
import { escapeCsvValue, buildStatsCsvRows, type K12ExportStats } from "@/lib/k12/export-helpers";

// ---------------------------------------------------------------------------
// K-12 escapeCsvValue (explicit formula injection defense)
// ---------------------------------------------------------------------------
describe("CSV injection defense – escapeCsvValue (K-12)", () => {
  it("prefixes values starting with = to prevent formula injection", () => {
    const result = escapeCsvValue("=SUM(A1:A10)");
    expect(result).not.toMatch(/^"=/);
    expect(result).toContain("'=");
  });

  it("prefixes values starting with + to prevent formula injection", () => {
    const result = escapeCsvValue("+cmd|'/C calc'!A0");
    expect(result).toContain("'+");
  });

  it("prefixes values starting with - to prevent formula injection", () => {
    const result = escapeCsvValue("-1+1");
    expect(result).toContain("'-");
  });

  it("prefixes values starting with @ to prevent formula injection", () => {
    const result = escapeCsvValue("@SUM(A1)");
    expect(result).toContain("'@");
  });

  it("prefixes values starting with tab to prevent formula injection", () => {
    const result = escapeCsvValue("\tcmd");
    expect(result).toContain("'\t");
  });

  it("prefixes values starting with carriage return to prevent formula injection", () => {
    const result = escapeCsvValue("\rcmd");
    expect(result).toContain("'\r");
  });

  it("does not prefix safe values", () => {
    const result = escapeCsvValue("Hello World");
    expect(result).toBe('"Hello World"');
  });

  it("properly double-quotes internal quotes", () => {
    const result = escapeCsvValue('He said "hello"');
    expect(result).toBe('"He said ""hello"""');
  });

  it("handles empty string", () => {
    const result = escapeCsvValue("");
    expect(result).toBe('""');
  });

  it("wraps all values in quotes for consistent output", () => {
    const result = escapeCsvValue("simple");
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// K-12 buildStatsCsvRows (integration with escapeCsvValue)
// ---------------------------------------------------------------------------
describe("CSV injection defense – buildStatsCsvRows", () => {
  it("escapes mostActiveReader when it contains dangerous characters", () => {
    const stats: K12ExportStats = {
      totalCheckouts: 100,
      booksPerStudent: 5,
      avgCheckoutDurationDays: 14,
      overdueCount: 3,
      mostActiveReader: '=HYPERLINK("http://evil.com","Click")',
    };

    const rows = buildStatsCsvRows(stats);
    const readerRow = rows.find((r) => r.includes("Most Active Reader"));

    expect(readerRow).toBeDefined();
    // The dangerous = character should be prefixed
    expect(readerRow).toContain("'=");
    // Should not contain a raw unescaped formula
    expect(readerRow).not.toMatch(/,"=HYPERLINK/);
  });

  it("handles null mostActiveReader gracefully", () => {
    const stats: K12ExportStats = {
      totalCheckouts: 0,
      booksPerStudent: 0,
      avgCheckoutDurationDays: 0,
      overdueCount: 0,
      mostActiveReader: null,
    };

    const rows = buildStatsCsvRows(stats);
    const readerRow = rows.find((r) => r.includes("Most Active Reader"));
    expect(readerRow).toContain("N/A");
  });
});

// ---------------------------------------------------------------------------
// Generic CSV utilities (convertToCSV) formula injection defense
// ---------------------------------------------------------------------------
describe("CSV injection defense – convertToCSV", () => {
  it("escapes formula injection in cell values", () => {
    const data = [
      { name: "=cmd|'/C calc'!A0", score: 100 },
      { name: "Normal Name", score: 95 },
    ];

    const csv = convertToCSV(data);
    const lines = csv.split("\n");

    // First data row should have the dangerous value escaped
    expect(lines[1]).toContain("'=");
    // Should not start with a raw formula
    expect(lines[1]).not.toMatch(/^=cmd/);
  });

  it("escapes + prefix in values", () => {
    const data = [{ phone: "+1234567890" }];
    const csv = convertToCSV(data);
    expect(csv).toContain("'+");
  });

  it("escapes @ prefix in values", () => {
    const data = [{ email: "@mention" }];
    const csv = convertToCSV(data);
    expect(csv).toContain("'@");
  });

  it("handles null and undefined values safely", () => {
    const data = [{ a: null, b: undefined }];
    const csv = convertToCSV(data);
    // Should not throw and should produce valid output
    expect(csv).toBeDefined();
    expect(csv.split("\n").length).toBe(2); // header + 1 data row
  });
});

// ---------------------------------------------------------------------------
// toCSVWithColumns formula injection defense
// ---------------------------------------------------------------------------
describe("CSV injection defense – toCSVWithColumns", () => {
  it("escapes dangerous values through column formatters", () => {
    const data = [{ name: "=IMPORTRANGE(...)", value: 42 }];
    const columns = [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
    ];

    const csv = toCSVWithColumns(data, columns);
    expect(csv).toContain("'=");
  });

  it("escapes dangerous values in column labels", () => {
    const data = [{ x: "safe" }];
    const columns = [{ key: "x", label: "=DDE(...)" }];

    const csv = toCSVWithColumns(data, columns);
    // Label should be escaped
    expect(csv).toContain("'=");
  });
});
