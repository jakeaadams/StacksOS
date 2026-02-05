/**
 * @deprecated
 * This module is kept for backward compatibility. Prefer:
 * - `src/lib/csv.ts` for CSV utilities
 * - `src/lib/format.ts` for formatting helpers
 */

import { downloadFile, ExportColumn, toCSVWithColumns } from "@/lib/csv";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

export type { ExportColumn };

export function toCSV<T extends Record<string, unknown>>(data: T[], columns: ExportColumn<T>[]): string {
  return toCSVWithColumns(data, columns);
}

export { downloadFile };
export { formatDate, formatDateTime, formatCurrency };

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string
): void {
  const csv = toCSVWithColumns(data, columns);
  downloadFile(csv, filename.endsWith(".csv") ? filename : `${filename}.csv`, "text/csv;charset=utf-8;");
}
