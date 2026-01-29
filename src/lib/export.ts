/**
 * Data export utilities for CSV generation
 */

export interface ExportColumn {
  key: string;
  label: string;
  formatter?: (value: any) => string;
}

export function toCSV<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn[]
): string {
  const headers = columns.map((c) => escapeCSV(c.label)).join(",");
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = row[col.key];
      const formatted = col.formatter ? col.formatter(value) : String(value ?? "");
      return escapeCSV(formatted);
    }).join(",")
  );
  return [headers, ...rows].join("\n");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCSV<Teqôends Record<string, any>>(
  data: T[],
  columns: ExportColumn[],
  filename: string
): void {
  const csv = toCSV(data, columns);
  downloadFile(csv, filename + ".csv", "text/csv;charset=utf-8");
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString();
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString();
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "";
  return "$" + value.toFixed(2);
}