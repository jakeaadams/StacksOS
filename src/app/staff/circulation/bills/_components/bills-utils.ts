import { escapeHtml, printHtml as _printHtml } from "@/lib/print";

export type ViewMode = "outstanding" | "all";

export interface PatronMini {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
}

export interface TransactionRow {
  xactId: number;
  type: string;
  title: string;
  barcode: string;
  billedDate: string;
  amount: number;
  paid: number;
  balance: number;
  selected: boolean;
}

export function formatCurrency(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return "$" + n.toFixed(2);
}

export function formatDate(value: unknown): string {
  if (!value) return "";
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString();
}

export function safeNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function extractTitle(entry: any): string {
  return (
    entry?.xact?.circulation?.target_copy?.call_number?.record?.simple_record?.title ||
    entry?.xact?.circulation?.target_copy?.call_number?.record?.title ||
    entry?.xact?.circulation?.target_copy?.call_number?.record?.simple_record?.author ||
    entry?.title ||
    entry?.note ||
    entry?.billing_type ||
    entry?.xact?.xact_type ||
    "Fee"
  );
}

export function extractBarcode(entry: any): string {
  return (
    entry?.xact?.circulation?.target_copy?.barcode ||
    entry?.barcode ||
    entry?.target_copy?.barcode ||
    "-"
  );
}

export function extractType(entry: any): string {
  return (
    entry?.xact?.xact_type || entry?.xact_type || entry?.billing_type || entry?.type || "other"
  );
}

export function normalizeTransactions(raw: any[]): TransactionRow[] {
  const byId = new Map<number, TransactionRow>();

  for (const entry of Array.isArray(raw) ? raw : []) {
    const xact = entry?.xact || entry;

    const xactId = Number.isFinite(Number(xact?.id))
      ? Number(xact.id)
      : Number.isFinite(Number(entry?.xactId))
        ? Number(entry.xactId)
        : Number.isFinite(Number(entry?.id))
          ? Number(entry.id)
          : NaN;

    if (!Number.isFinite(xactId) || xactId <= 0) continue;

    const paid = safeNumber(xact?.total_paid ?? entry?.total_paid ?? entry?.xact?.total_paid);
    const balance = safeNumber(
      xact?.balance_owed ?? entry?.balance_owed ?? entry?.xact?.balance_owed
    );

    // Prefer total_owed if available; else infer.
    const totalOwedRaw = xact?.total_owed ?? entry?.total_owed;
    const amount =
      totalOwedRaw !== undefined ? safeNumber(totalOwedRaw) : safeNumber(paid + balance);

    const billedDate =
      formatDate(entry?.billing_ts) ||
      formatDate(xact?.xact_start) ||
      formatDate(xact?.create_time) ||
      "";

    const existing = byId.get(xactId);

    const row: TransactionRow = {
      xactId,
      type: extractType(entry),
      title: extractTitle(entry),
      barcode: extractBarcode(entry),
      billedDate,
      amount,
      paid,
      balance,
      selected: existing?.selected || false,
    };

    // If we somehow see multiple rows for the same transaction, keep the one
    // with the largest balance/amount (more likely to be the summary row).
    if (!existing) {
      byId.set(xactId, row);
    } else {
      const pick = (a: TransactionRow, b: TransactionRow) => {
        if (b.balance > a.balance) return b;
        if (b.amount > a.amount) return b;
        return a;
      };
      byId.set(xactId, pick(existing, row));
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    (b.billedDate || "").localeCompare(a.billedDate || "")
  );
}

export function buildPaymentReceiptHtml(args: {
  patron: PatronMini;
  staffLabel?: string;
  workstation?: string;
  orgName?: string;
  total: number;
  method: string;
  note?: string;
  payments: Array<{ xactId: number; title: string; barcode: string; amount: number }>;
}): string {
  const now = new Date();
  const methodLabel: Record<string, string> = {
    cash_payment: "Cash",
    credit_card_payment: "Credit Card",
    debit_card_payment: "Debit Card",
    check_payment: "Check",
    credit: "Credit",
  };

  const rows = args.payments
    .map(
      (p) =>
        `<tr>
          <td class="mono">${escapeHtml(p.xactId)}</td>
          <td>${escapeHtml(p.title)}</td>
          <td class="mono">${escapeHtml(p.barcode)}</td>
          <td class="right mono">${escapeHtml(formatCurrency(p.amount))}</td>
        </tr>`
    )
    .join("\n");

  return `
    <div class="box">
      <div class="brand">STACKSOS</div>
      <h1>Payment Receipt</h1>
      <div class="muted">${escapeHtml(now.toLocaleString())}</div>

      <div class="meta">
        <div><span class="k">Patron:</span> <span class="v">${escapeHtml(args.patron.lastName + ", " + args.patron.firstName)}</span></div>
        <div><span class="k">Barcode:</span> <span class="v mono">${escapeHtml(args.patron.barcode)}</span></div>
        ${args.staffLabel ? `<div><span class="k">Staff:</span> <span class="v">${escapeHtml(args.staffLabel)}</span></div>` : ""}
        ${args.workstation ? `<div><span class="k">Workstation:</span> <span class="v mono">${escapeHtml(args.workstation)}</span></div>` : ""}
        ${args.orgName ? `<div><span class="k">Location:</span> <span class="v">${escapeHtml(args.orgName)}</span></div>` : ""}
      </div>

      <h2>Payment</h2>
      <div class="meta">
        <div><span class="k">Method:</span> <span class="v">${escapeHtml(methodLabel[args.method] || args.method)}</span></div>
        <div><span class="k">Total:</span> <span class="v mono">${escapeHtml(formatCurrency(args.total))}</span></div>
      </div>
      ${args.note ? `<div class="muted" style="margin-top:6px"><span class="k">Note:</span> ${escapeHtml(args.note)}</div>` : ""}

      <h2>Applied To</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Txn</th>
            <th scope="col">Description</th>
            <th scope="col">Barcode</th>
            <th scope="col" class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" class="muted">No line items</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export function buildRefundReceiptHtml(args: {
  patron: PatronMini;
  staffLabel?: string;
  workstation?: string;
  orgName?: string;
  xactId: number;
  title: string;
  barcode: string;
  refundAmount: number;
  note?: string;
}): string {
  const now = new Date();
  return `
    <div class="box">
      <div class="brand">STACKSOS</div>
      <h1>Refund Receipt</h1>
      <div class="muted">${escapeHtml(now.toLocaleString())}</div>

      <div class="meta">
        <div><span class="k">Patron:</span> <span class="v">${escapeHtml(args.patron.lastName + ", " + args.patron.firstName)}</span></div>
        <div><span class="k">Barcode:</span> <span class="v mono">${escapeHtml(args.patron.barcode)}</span></div>
        ${args.staffLabel ? `<div><span class="k">Staff:</span> <span class="v">${escapeHtml(args.staffLabel)}</span></div>` : ""}
        ${args.workstation ? `<div><span class="k">Workstation:</span> <span class="v mono">${escapeHtml(args.workstation)}</span></div>` : ""}
        ${args.orgName ? `<div><span class="k">Location:</span> <span class="v">${escapeHtml(args.orgName)}</span></div>` : ""}
      </div>

      <h2>Refund</h2>
      <div class="meta">
        <div><span class="k">Txn:</span> <span class="v mono">${escapeHtml(args.xactId)}</span></div>
        <div><span class="k">Amount:</span> <span class="v mono">${escapeHtml(formatCurrency(args.refundAmount))}</span></div>
      </div>
      <div class="muted" style="margin-top:6px">${escapeHtml(args.title)} ${args.barcode && args.barcode !== "-" ? "(" + escapeHtml(args.barcode) + ")" : ""}</div>
      ${args.note ? `<div class="muted" style="margin-top:6px"><span class="k">Note:</span> ${escapeHtml(args.note)}</div>` : ""}
    </div>
  `;
}
