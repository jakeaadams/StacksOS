/**
 * Shared helpers for K-12 CSV export and overdue dashboard.
 *
 * These helpers are used by:
 * - src/app/api/staff/k12/export/route.ts (CSV generation)
 * - src/app/api/staff/k12/overdue-dashboard/route.ts (overdue grouping)
 */

// ---------------------------------------------------------------------------
// CSV export helpers
// ---------------------------------------------------------------------------

export const CSV_STATS_HEADER = "Section,Metric,Value";

export interface K12ExportStats {
  totalCheckouts: number;
  booksPerStudent: number;
  avgCheckoutDurationDays: number;
  overdueCount: number;
  mostActiveReader: string | null;
}

/** Escape a value for CSV (double-quote escaping per RFC 4180). */
export function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Build the stats section rows for the K-12 export CSV. */
export function buildStatsCsvRows(stats: K12ExportStats): string[] {
  const lines: string[] = [];
  lines.push(CSV_STATS_HEADER);
  lines.push(`Stats,Total Checkouts,${stats.totalCheckouts}`);
  lines.push(`Stats,Books Per Student,${stats.booksPerStudent}`);
  lines.push(`Stats,Avg Checkout Duration (days),${stats.avgCheckoutDurationDays}`);
  lines.push(`Stats,Overdue Count,${stats.overdueCount}`);
  lines.push(`Stats,Most Active Reader,${escapeCsvValue(stats.mostActiveReader || "N/A")}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Overdue grouping helpers
// ---------------------------------------------------------------------------

export interface OverdueItem {
  checkoutId: number;
  studentId: number;
  studentName: string;
  copyBarcode: string;
  title: string | null;
  checkoutTs: string;
  dueTs: string;
  daysOverdue: number;
}

export interface OverdueGroup {
  studentId: number;
  studentName: string;
  items: OverdueItem[];
  totalOverdue: number;
}

export interface OverdueRow {
  checkout_id: number;
  student_id: number;
  student_name: string;
  copy_barcode: string;
  title: string | null;
  checkout_ts: string;
  due_ts: string;
  days_overdue: number;
}

/** Map a raw DB row to a typed OverdueItem. */
export function mapOverdueRow(row: OverdueRow): OverdueItem {
  return {
    checkoutId: row.checkout_id,
    studentId: row.student_id,
    studentName: row.student_name,
    copyBarcode: row.copy_barcode,
    title: row.title,
    checkoutTs: row.checkout_ts,
    dueTs: row.due_ts,
    daysOverdue: Number(row.days_overdue),
  };
}

/** Group overdue rows by student. */
export function groupOverdueByStudent(rows: OverdueRow[]): OverdueGroup[] {
  const groupMap = new Map<number, OverdueGroup>();
  for (const row of rows) {
    const item = mapOverdueRow(row);
    const existing = groupMap.get(row.student_id);
    if (existing) {
      existing.items.push(item);
      existing.totalOverdue = existing.items.length;
    } else {
      groupMap.set(row.student_id, {
        studentId: row.student_id,
        studentName: row.student_name,
        items: [item],
        totalOverdue: 1,
      });
    }
  }
  return Array.from(groupMap.values());
}
