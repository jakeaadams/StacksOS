/**
 * CSV Export Utilities
 *
 * Reusable utilities for converting data to CSV format and triggering downloads.
 * Supports proper escaping, formatting, and handles large datasets efficiently.
 */

import { useState } from "react";

export interface ExportColumn<T extends Record<string, unknown> = Record<string, unknown>> {
  key: string;
  label: string;
  formatter?: (value: unknown, row: T) => string;
}

/**
 * Escapes a value for CSV format
 * Handles special characters (commas, quotes, newlines)
 */
function escapeCSVValue(value: unknown): string {
  const str = String(value ?? "");

  // If the string contains comma, quote, newline, or carriage return, wrap in quotes
  if (/[\n\r,"]/.test(str)) {
    // Escape quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generic file download helper (browser-only).
 */
export function downloadFile(content: BlobPart | BlobPart[], filename: string, mimeType: string): void {
  const blob = new Blob(Array.isArray(content) ? content : [content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Converts an array of objects to CSV format
 *
 * @param data - Array of objects to convert to CSV
 * @param options - Optional configuration
 * @returns CSV string with headers and data rows
 *
 * @example
 * const data = [
 *   { name: "John", age: 30, city: "New York" },
 *   { name: "Jane", age: 25, city: "Boston" }
 * ];
 * const csv = convertToCSV(data);
 */
export function convertToCSV<T extends Record<string, unknown>>(
  data: T[],
  options?: {
    /** Custom header labels (key -> label mapping) */
    headers?: Record<string, string>;
    /** Specific columns to include (in order) */
    columns?: string[];
    /** Include header row (default: true) */
    includeHeaders?: boolean;
  }
): string {
  if (!data || data.length === 0) {
    return "";
  }

  const { headers: customHeaders, columns, includeHeaders = true } = options || {};

  // Determine columns to include
  const columnKeys = columns || Array.from(
    data.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  // Build header row
  const headerRow = columnKeys.map((key) => {
    const label = customHeaders?.[key] || key;
    return escapeCSVValue(label);
  }).join(",");

  // Build data rows
  const dataRows = data.map((row) =>
    columnKeys.map((key) => escapeCSVValue(row[key])).join(",")
  );

  // Combine header and data
  const rows = includeHeaders ? [headerRow, ...dataRows] : dataRows;

  return rows.join("\n");
}

/**
 * Converts an array of objects to CSV using an explicit column definition
 * (useful when you need formatting or stable ordering).
 */
export function toCSVWithColumns<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  options?: { includeHeaders?: boolean }
): string {
  if (!data || data.length === 0) return "";

  const includeHeaders = options?.includeHeaders !== false;
  const headerRow = columns.map((c) => escapeCSVValue(c.label)).join(",");

  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = (row as any)?.[col.key];
        const formatted = col.formatter ? col.formatter(value, row) : String(value ?? "");
        return escapeCSVValue(formatted);
      })
      .join(",")
  );

  return includeHeaders ? [headerRow, ...rows].join("\n") : rows.join("\n");
}

/**
 * Triggers a browser download of a CSV file
 *
 * @param filename - Name of the file to download (should end with .csv)
 * @param csvContent - CSV content as a string
 *
 * @example
 * const csv = convertToCSV(data);
 * downloadCSV("report.csv", csv);
 */
export function downloadCSV(filename: string, csvContent: string): void {
  // Ensure filename ends with .csv
  const csvFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;

  // Create blob with proper MIME type and UTF-8 BOM for Excel compatibility
  const BOM = "\uFEFF";
  downloadFile(BOM + csvContent, csvFilename, "text/csv;charset=utf-8;");
}

/**
 * Export data to CSV and trigger download in one step
 *
 * @param filename - Name of the file to download
 * @param data - Array of objects to export
 * @param options - Optional configuration for CSV conversion
 *
 * @example
 * exportToCSV("users-report.csv", users, {
 *   columns: ["id", "name", "email", "created_at"],
 *   headers: { created_at: "Registration Date" }
 * });
 */
export function exportToCSV<T extends Record<string, unknown>>(
  filename: string,
  data: T[],
  options?: Parameters<typeof convertToCSV>[1]
): void {
  const csv = convertToCSV(data, options);
  downloadCSV(filename, csv);
}

/**
 * Generate a timestamped filename for exports
 *
 * @param base - Base filename (without extension)
 * @param extension - File extension (default: "csv")
 * @returns Filename with timestamp
 *
 * @example
 * generateExportFilename("report") // "report-2024-01-25-143022.csv"
 */
export function generateExportFilename(base: string, extension = "csv"): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/T/, "-")
    .replace(/:/g, "")
    .replace(/\..+/, "")
    .substring(0, 15); // YYYY-MM-DD-HHMMSS

  return `${base}-${timestamp}.${extension}`;
}

/**
 * Hook for managing CSV export state
 * Provides loading state and error handling
 *
 * @example
 * const { exportData, isExporting, error } = useCSVExport();
 *
 * const handleExport = () => {
 *   exportData("report.csv", data);
 * };
 */
export function useCSVExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportData = async <T extends Record<string, unknown>>(
    filename: string,
    data: T[],
    options?: Parameters<typeof convertToCSV>[1]
  ) => {
    setIsExporting(true);
    setError(null);

    try {
      // For large datasets, use setTimeout to prevent UI blocking
      if (data.length > 1000) {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            exportToCSV(filename, data, options);
            resolve();
          }, 0);
        });
      } else {
        exportToCSV(filename, data, options);
      }
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsExporting(false);
    }
  };

  return { exportData, isExporting, error };
}
