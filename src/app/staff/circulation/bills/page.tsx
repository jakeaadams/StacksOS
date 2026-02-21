"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";

import { useAuth } from "@/contexts/auth-context";
import { ApiError, useMutation } from "@/hooks";
import { clientLogger } from "@/lib/client-logger";
import { escapeHtml, printHtml } from "@/lib/print";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {

  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Banknote,
  CheckCircle2,
  CreditCard,
  DollarSign,
  HelpCircle,
  Loader2,
  Printer,
  Search,
  RotateCcw,
} from "lucide-react";

import {
  BarcodeInput,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  PermissionDeniedState,
  PageContainer,
  PageContent,
  PageHeader,
} from "@/components/shared";

type ViewMode = "outstanding" | "all";

interface PatronMini {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
}

interface TransactionRow {
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

function formatCurrency(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return "$" + n.toFixed(2);
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString();
}

function safeNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractTitle(entry: any): string {
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

function extractBarcode(entry: any): string {
  return (
    entry?.xact?.circulation?.target_copy?.barcode ||
    entry?.barcode ||
    entry?.target_copy?.barcode ||
    "-"
  );
}

function extractType(entry: any): string {
  return (
    entry?.xact?.xact_type ||
    entry?.xact_type ||
    entry?.billing_type ||
    entry?.type ||
    "other"
  );
}

function normalizeTransactions(raw: any[]): TransactionRow[] {
  const byId = new Map<number, TransactionRow>();

  for (const entry of Array.isArray(raw) ? raw : []) {
    const xact = entry?.xact || entry;

    const xactId =
      Number.isFinite(Number(xact?.id))
        ? Number(xact.id)
        : Number.isFinite(Number(entry?.xactId))
          ? Number(entry.xactId)
          : Number.isFinite(Number(entry?.id))
            ? Number(entry.id)
            : NaN;

    if (!Number.isFinite(xactId) || xactId <= 0) continue;

    const paid = safeNumber(xact?.total_paid ?? entry?.total_paid ?? entry?.xact?.total_paid);
    const balance = safeNumber(xact?.balance_owed ?? entry?.balance_owed ?? entry?.xact?.balance_owed);

    // Prefer total_owed if available; else infer.
    const totalOwedRaw = xact?.total_owed ?? entry?.total_owed;
    const amount = totalOwedRaw !== undefined ? safeNumber(totalOwedRaw) : safeNumber(paid + balance);

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

  return Array.from(byId.values()).sort((a, b) => (b.billedDate || "").localeCompare(a.billedDate || ""));
}

function buildPaymentReceiptHtml(args: {
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

function buildRefundReceiptHtml(args: {
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

function BillsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [view, setView] = useState<ViewMode>("outstanding");
  const [patronBarcode, setPatronBarcode] = useState(searchParams.get("patron") || "");
  const [patron, setPatron] = useState<PatronMini | null>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState<{ message: string; missing: string[]; requestId?: string } | null>(null);

  const payBillsMutation = useMutation<any, any>();
  const refundMutation = useMutation<any, any>();

  // Payments
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_payment");
  const [paymentNote, setPaymentNote] = useState("");

  // Refunds
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");

  const outstanding = rows.filter((r) => r.balance > 0);
  const allTotalOwed = rows.reduce((sum, r) => sum + r.balance, 0);

  const selected = outstanding.filter((r) => r.selected);
  const selectedTotal = selected.reduce((sum, r) => sum + r.balance, 0);

  const loadTransactions = useCallback(
    async (patronId: number, scope: ViewMode) => {
      const scopeParam = scope === "all" ? "all" : "open";
      const res = await fetchWithAuth(`/api/evergreen/circulation?action=bills&patron_id=${patronId}&scope=${scopeParam}`
      );
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        window.dispatchEvent(new Event("stacksos:auth-expired"));
        throw new Error("Session expired");
      }

      if (res.status === 403) {
        setPermissionDenied({
          message: data?.error || "Permission denied",
          missing: Array.isArray(data?.details?.missing) ? data.details.missing : [],
          requestId: data?.details?.requestId,
        });
        setRows([]);
        return;
      }

      setPermissionDenied(null);

      if (!data.ok) {
        throw new Error(data.error || "Failed to load transactions");
      }

      const normalized = normalizeTransactions(data.bills || []);
      setRows(normalized);
    },
    []
  );

  const handlePatronLoad = useCallback(
    async (barcodeRaw: string) => {
      const barcode = barcodeRaw.trim();
      if (!barcode) return;

      setPatronBarcode(barcode);
      setIsLoading(true);

      try {
        const patronRes = await fetchWithAuth(`/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`);
        const patronData = await patronRes.json().catch(() => ({}));

        if (patronRes.status === 401) {
          window.dispatchEvent(new Event("stacksos:auth-expired"));
          throw new Error("Session expired");
        }

        if (patronRes.status === 403) {
          setPermissionDenied({
            message: patronData?.error || "Permission denied",
            missing: Array.isArray(patronData?.details?.missing) ? patronData.details.missing : [],
            requestId: patronData?.details?.requestId,
          });
          setPatron(null);
          setRows([]);
          return;
        }

        setPermissionDenied(null);

        if (!patronData.ok || !patronData.patron) {
          toast.error("Patron not found");
          setPatron(null);
          setRows([]);
          return;
        }

        const p = patronData.patron;
        const nextPatron: PatronMini = {
          id: p.id,
          barcode,
          firstName: p.first_given_name || "",
          lastName: p.family_name || "",
        };

        setPatron(nextPatron);
        await loadTransactions(nextPatron.id, view);
        toast.success("Patron loaded");
      } catch (err) {
        clientLogger.error("Error loading bills:", err);
        toast.error("Failed to load patron bills");
        setPatron(null);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    },
    [loadTransactions, view]
  );

  const patronParam = searchParams.get("patron") || "";
  useEffect(() => {
    if (!patronParam) return;
    if (isLoading) return;
    if (patron?.barcode === patronParam) return;
    void handlePatronLoad(patronParam);
  }, [handlePatronLoad, isLoading, patron, patronParam]);

  // Reload transactions when switching views (without re-fetching patron).
  useEffect(() => {
    if (!patron) return;
    void (async () => {
      setIsLoading(true);
      try {
        await loadTransactions(patron.id, view);
      } catch (err) {
        clientLogger.error("Error switching bill view:", err);
        toast.error("Failed to load transactions");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadTransactions, patron, view]);

  const handleSelectAll = useCallback((checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.balance > 0 ? checked : false,
      }))
    );
  }, []);

  const handleSelectOne = useCallback((xactId: number, checked: boolean) => {
    setRows((prev) => prev.map((r) => (r.xactId == xactId ? { ...r, selected: checked } : r)));
  }, []);

  const openPaymentDialog = useCallback(
    (mode: "selected" | "all") => {
      if (!patron) {
        toast.message("Load a patron first");
        return;
      }

      if (mode === "selected") {
        if (selected.length === 0) {
          toast.message("Select at least one bill");
          return;
        }
        setPaymentAmount(selectedTotal.toFixed(2));
        setPaymentDialogOpen(true);
        return;
      }

      // all
      const next = outstanding.map((r) => ({ ...r, selected: r.balance > 0 }));
      setRows((prev) => prev.map((r) => ({ ...r, selected: r.balance > 0 })));
      const owed = next.reduce((sum, r) => sum + r.balance, 0);
      if (owed <= 0) {
        toast.message("No balance to pay");
        return;
      }
      setPaymentAmount(owed.toFixed(2));
      setPaymentDialogOpen(true);
    },
    [outstanding, patron, selected, selectedTotal]
  );

  const processPayment = useCallback(async () => {
    if (!patron) return;

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Invalid amount");
      return;
    }

    // Build payments list in priority order (oldest first is ideal, but we don't
    // have a stable timestamp; we just pay in table order).
    const targets = selected.length > 0 ? selected : outstanding;
    if (targets.length === 0) {
      toast.message("No bills selected");
      return;
    }

    let remaining = amount;
    const payments: [number, number][] = [];
    const receiptLines: Array<{ xactId: number; title: string; barcode: string; amount: number }> = [];

    for (const row of targets) {
      if (remaining <= 0) break;
      const payAmount = Math.min(remaining, row.balance);
      if (payAmount <= 0) continue;

      payments.push([row.xactId, payAmount]);
      receiptLines.push({ xactId: row.xactId, title: row.title, barcode: row.barcode, amount: payAmount });
      remaining -= payAmount;
    }

    setIsLoading(true);

    try {
      const data = await payBillsMutation.mutateAsync("/api/evergreen/circulation", {
        action: "pay_bills",
        patron_id: patron.id,
        payments,
        payment_type: paymentMethod,
        payment_note: paymentNote || undefined,
      });

      if (!data?.ok) {
        toast.error(data?.error || "Payment failed");
        return;
      }

      toast.success("Payment processed", { description: formatCurrency(amount) + " received" });

      printHtml(
        buildPaymentReceiptHtml({
          patron,
          staffLabel: user?.displayName,
          workstation: user?.workstation,
          orgName: user?.activeOrgName,
          total: amount,
          method: paymentMethod,
          note: paymentNote || undefined,
          payments: receiptLines,
        }),
        { title: "StacksOS Payment Receipt", tone: "receipt" }
      );

      setPaymentDialogOpen(false);
      setPaymentAmount("");
      setPaymentNote("");

      await loadTransactions(patron.id, view);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          const missing = Array.isArray((err.details as any)?.missing) ? (err.details as any).missing : [];
          const requestId = (err.details as any)?.requestId;
          setPermissionDenied({ message: err.message || "Permission denied", missing, requestId });
          toast.error("Permission denied", { description: err.message });
          return;
        }

        if (err.status === 408) {
          toast.error("Payment timed out", { description: err.message });
          return;
        }
      }

      clientLogger.error("Payment failed:", err);
      toast.error("Payment failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setIsLoading(false);
    }
  }, [loadTransactions, outstanding, patron, payBillsMutation, paymentAmount, paymentMethod, paymentNote, selected, user, view]);

  const openRefund = useCallback((row: TransactionRow) => {
    if (!patron) {
      toast.message("Load a patron first");
      return;
    }

    if (row.paid <= 0) {
      toast.message("No payments to refund for this transaction");
      return;
    }

    setRefundTarget(row);
    setRefundAmount(row.paid.toFixed(2));
    setRefundNote("");
    setRefundDialogOpen(true);
  }, [patron]);

  const processRefund = useCallback(async () => {
    if (!patron || !refundTarget) return;

    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Invalid amount");
      return;
    }

    setIsLoading(true);

    try {
      const data = await refundMutation.mutateAsync("/api/evergreen/circulation", {
        action: "process_refund",
        patron_id: patron.id,
        xactId: refundTarget.xactId,
        refundAmount: amount,
        refund_note: refundNote || undefined,
      });

      if (!data?.ok) {
        toast.error(data?.error || "Refund failed");
        return;
      }

      toast.success("Refund processed", { description: formatCurrency(amount) });

      printHtml(
        buildRefundReceiptHtml({
          patron,
          staffLabel: user?.displayName,
          workstation: user?.workstation,
          orgName: user?.activeOrgName,
          xactId: refundTarget.xactId,
          title: refundTarget.title,
          barcode: refundTarget.barcode,
          refundAmount: amount,
          note: refundNote || undefined,
        }),
        { title: "StacksOS Refund Receipt", tone: "receipt" }
      );

      setRefundDialogOpen(false);
      setRefundTarget(null);
      setRefundAmount("");
      setRefundNote("");

      await loadTransactions(patron.id, view);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          const missing = Array.isArray((err.details as any)?.missing) ? (err.details as any).missing : [];
          const requestId = (err.details as any)?.requestId;
          setPermissionDenied({ message: err.message || "Permission denied", missing, requestId });
          toast.error("Permission denied", { description: err.message });
          return;
        }

        if (err.status === 408) {
          toast.error("Refund timed out", { description: err.message });
          return;
        }
      }

      clientLogger.error("Refund failed:", err);
      toast.error("Refund failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setIsLoading(false);
    }
  }, [loadTransactions, patron, refundAmount, refundMutation, refundNote, refundTarget, user, view]);

  const printStatement = useCallback(() => {
    if (!patron) {
      toast.message("Load a patron first");
      return;
    }

    const visible = view === "outstanding" ? outstanding : rows;

    const rowsHtml = visible
      .map(
        (r) =>
          `<tr>
            <td class="mono">${escapeHtml(r.xactId)}</td>
            <td>${escapeHtml(r.title)}</td>
            <td class="mono">${escapeHtml(r.barcode)}</td>
            <td class="right mono">${escapeHtml(formatCurrency(r.amount))}</td>
            <td class="right mono">${escapeHtml(formatCurrency(r.paid))}</td>
            <td class="right mono">${escapeHtml(formatCurrency(r.balance))}</td>
          </tr>`
      )
      .join("\n");

    const title = view === "outstanding" ? "Outstanding Balance" : "Account Activity";

    const html = `
      <div class="box">
        <div class="brand">STACKSOS</div>
        <h1>Account Statement</h1>
        <div class="muted">${escapeHtml(new Date().toLocaleString())}</div>
        <div class="meta">
          <div><span class="k">Patron:</span> <span class="v">${escapeHtml(patron.lastName + ", " + patron.firstName)}</span></div>
          <div><span class="k">Barcode:</span> <span class="v mono">${escapeHtml(patron.barcode)}</span></div>
          <div><span class="k">View:</span> <span class="v">${escapeHtml(title)}</span></div>
        </div>
        <h2>${escapeHtml(title)}</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Txn</th>
              <th scope="col">Description</th>
              <th scope="col">Barcode</th>
              <th scope="col" class="right">Total</th>
              <th scope="col" class="right">Paid</th>
              <th scope="col" class="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="6" class="muted">No results</td></tr>`}
          </tbody>
        </table>
        <div class="meta" style="justify-content:flex-end">
          <div><span class="k">Total Owed:</span> <span class="v mono">${escapeHtml(formatCurrency(allTotalOwed))}</span></div>
        </div>
      </div>
    `;

    printHtml(html, { title: "StacksOS Account Statement", tone: "report" });
  }, [allTotalOwed, outstanding, patron, rows, view]);

  const columnsOutstanding = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={outstanding.length > 0 && outstanding.every((r) => r.selected)}
            onCheckedChange={(checked) => handleSelectAll(!!checked)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.original.selected}
            onCheckedChange={(checked) => handleSelectOne(row.original.xactId, !!checked)}
            disabled={row.original.balance <= 0}
          />
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] uppercase">
            {row.original.type}
          </Badge>
        ),
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Item / Description" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-sm font-medium">{row.original.title}</div>
            {row.original.barcode !== "-" && (
              <div className="text-[11px] text-muted-foreground font-mono">{row.original.barcode}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "billedDate",
        header: "Billed",
        cell: ({ row }) => <span className="text-xs">{row.original.billedDate || "—"}</span>,
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <span className="text-xs mono">{formatCurrency(row.original.amount)}</span>,
      },
      {
        accessorKey: "paid",
        header: "Paid",
        cell: ({ row }) => <span className="text-xs text-emerald-600 mono">{formatCurrency(row.original.paid)}</span>,
      },
      {
        accessorKey: "balance",
        header: "Balance",
        cell: ({ row }) => (
          <span className="text-xs font-semibold text-rose-600 mono">{formatCurrency(row.original.balance)}</span>
        ),
      },
    ],
    [handleSelectAll, handleSelectOne, outstanding]
  );

  const columnsAll = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] uppercase">
            {row.original.type}
          </Badge>
        ),
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Item / Description" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-sm font-medium">{row.original.title}</div>
            {row.original.barcode !== "-" && (
              <div className="text-[11px] text-muted-foreground font-mono">{row.original.barcode}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "billedDate",
        header: "Billed",
        cell: ({ row }) => <span className="text-xs">{row.original.billedDate || "—"}</span>,
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <span className="text-xs mono">{formatCurrency(row.original.amount)}</span>,
      },
      {
        accessorKey: "paid",
        header: "Paid",
        cell: ({ row }) => <span className="text-xs text-emerald-600 mono">{formatCurrency(row.original.paid)}</span>,
      },
      {
        accessorKey: "balance",
        header: "Balance",
        cell: ({ row }) => (
          <span className="text-xs font-semibold mono">{formatCurrency(row.original.balance)}</span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => openRefund(row.original)}
            disabled={row.original.paid <= 0 || !patron}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refund
          </Button>
        ),
      },
    ],
    [openRefund, patron]
  );

  const headerBadges = (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary" className="rounded-full">
        Total Owed: {formatCurrency(allTotalOwed)}
      </Badge>
      {view === "outstanding" && selected.length > 0 && (
        <Badge variant="outline" className="rounded-full">
          Selected: {formatCurrency(selectedTotal)}
        </Badge>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={view === "outstanding" ? "default" : "outline"}
          onClick={() => setView("outstanding")}
          disabled={!patron}
        >
          Outstanding
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "all" ? "default" : "outline"}
          onClick={() => setView("all")}
          disabled={!patron}
        >
          All Activity
        </Button>
      </div>
    </div>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Bills & Payments"
        subtitle="Manage patron fines, fees, payments, and refunds."
        breadcrumbs={[{ label: "Circulation" }, { label: "Bills" }]}
        actions={[
          {
            label: "Pay Selected",
            onClick: () => openPaymentDialog("selected"),
            icon: DollarSign,
            disabled: !patron || view !== "outstanding" || selected.length === 0,
          },
          {
            label: "Pay All",
            onClick: () => openPaymentDialog("all"),
            icon: Banknote,
            disabled: !patron || view !== "outstanding" || outstanding.length === 0,
          },
          {
            label: "Print Statement",
            onClick: printStatement,
            icon: Printer,
            disabled: !patron,
            variant: "outline",
          },
          { label: "Walkthrough", onClick: () => window.location.assign("/staff/training?workflow=bills"), icon: HelpCircle, variant: "outline" },
        ]}
      >
        {headerBadges}
      </PageHeader>

      <PageContent className="space-y-6">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Patron</h3>
            <BarcodeInput
              label="Patron Barcode"
              placeholder="Scan patron barcode..."
              value={patronBarcode}
              onChange={setPatronBarcode}
              onSubmit={handlePatronLoad}
              isLoading={isLoading}
            />
            <div className="flex gap-2">
              <Button onClick={() => handlePatronLoad(patronBarcode)} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-1" />
                    Load
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPatronBarcode("");
                  setPatron(null);
                  setRows([]);
                }}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <DataTable
              columns={view === "outstanding" ? columnsOutstanding : columnsAll}
              data={view === "outstanding" ? outstanding : rows}
              isLoading={isLoading}
              searchable
              searchPlaceholder="Search by title, barcode, or txn id..."
              emptyState={
                permissionDenied ? (
                  <PermissionDeniedState
                    message={permissionDenied.message}
                    missing={permissionDenied.missing}
                    requestId={permissionDenied.requestId}
                  />
                ) : (
                  <EmptyState
                    icon={CheckCircle2}
                    title={patron ? "No results" : "Search for a patron"}
                    description={
                      patron
                        ? view === "outstanding"
                          ? "This patron has no outstanding balance."
                          : "No transactions found."
                        : "Scan a patron barcode to view bills and payments."
                    }
                    action={
                      patron
                        ? { label: "Open patron record", onClick: () => router.push(`/staff/patrons/${patron.id}`) }
                        : { label: "Seed demo data", onClick: () => router.push("/staff/help#demo-data") }
                    }
                    secondaryAction={
                      patron
                        ? { label: "How billing works", onClick: () => router.push("/staff/help#evergreen-setup") }
                        : { label: "Search patrons", onClick: () => router.push("/staff/patrons") }
                    }
                  />
                )
              }
            />
          </div>

          {patron && (
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div>
                  <h3 className="font-semibold text-sm">
                    {patron.lastName}, {patron.firstName}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-mono">{patron.barcode}</p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Owed</span>
                    <span className="font-semibold text-rose-600">{formatCurrency(allTotalOwed)}</span>
                  </div>
                  {view === "outstanding" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Selected</span>
                      <span className="font-medium">{formatCurrency(selectedTotal)}</span>
                    </div>
                  )}
                </div>

                {view === "outstanding" && (
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() => openPaymentDialog("selected")}
                      disabled={selected.length === 0}
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Pay {formatCurrency(selectedTotal)}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => openPaymentDialog("all")}
                      disabled={outstanding.length === 0}
                    >
                      Pay Full Balance
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageContent>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Apply a payment to {selected.length > 0 ? selected.length : outstanding.length} transaction(s).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="amount" className="text-sm font-medium">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="amount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="pl-12 text-lg font-mono"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="payment-method" className="text-sm font-medium">Payment Method</label>
              <Select id="payment-method" value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_payment">Cash</SelectItem>
                  <SelectItem value="credit_card_payment">Credit Card</SelectItem>
                  <SelectItem value="debit_card_payment">Debit Card</SelectItem>
                  <SelectItem value="check_payment">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="note" className="text-sm font-medium">Note (optional)</label>
              <Input id="note"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Add note"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={processPayment} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-1" />
              )}
              Process Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              {refundTarget
                ? `Refund against transaction ${refundTarget.xactId}. The API will cap the refund to the refundable amount.`
                : "Select a transaction to refund."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="amount-2" className="text-sm font-medium">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="amount-2"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="pl-12 text-lg font-mono"
                  placeholder="0.00"
                />
              </div>
              {refundTarget && (
                <p className="text-xs text-muted-foreground">
                  Paid: {formatCurrency(refundTarget.paid)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="note-2" className="text-sm font-medium">Note (optional)</label>
              <Input id="note-2"
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                placeholder="Reason for refund"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={processRefund} disabled={isLoading || !refundTarget}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Process Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

export default function BillsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <BillsContent />
    </Suspense>
  );
}
