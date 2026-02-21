"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { ApiError, useMutation } from "@/hooks";
import { clientLogger } from "@/lib/client-logger";
import { escapeHtml, printHtml } from "@/lib/print";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, CheckCircle2, DollarSign, HelpCircle, Loader2, Printer, Search } from "lucide-react";
import { BarcodeInput, DataTable, EmptyState, PermissionDeniedState, PageContainer, PageContent, PageHeader } from "@/components/shared";

import type { ViewMode, PatronMini, TransactionRow } from "./_components/bills-utils";
import { formatCurrency, normalizeTransactions, buildPaymentReceiptHtml, buildRefundReceiptHtml } from "./_components/bills-utils";
import { useOutstandingColumns, useAllColumns } from "./_components/bills-columns";
import { BillsDialogs } from "./_components/BillsDialogs";

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

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_payment");
  const [paymentNote, setPaymentNote] = useState("");

  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");

  const outstanding = rows.filter((r) => r.balance > 0);
  const allTotalOwed = rows.reduce((sum, r) => sum + r.balance, 0);
  const selected = outstanding.filter((r) => r.selected);
  const selectedTotal = selected.reduce((sum, r) => sum + r.balance, 0);

  const loadTransactions = useCallback(async (patronId: number, scope: ViewMode) => {
    const scopeParam = scope === "all" ? "all" : "open";
    const res = await fetchWithAuth(`/api/evergreen/circulation?action=bills&patron_id=${patronId}&scope=${scopeParam}`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { window.dispatchEvent(new Event("stacksos:auth-expired")); throw new Error("Session expired"); }
    if (res.status === 403) { setPermissionDenied({ message: data?.error || "Permission denied", missing: Array.isArray(data?.details?.missing) ? data.details.missing : [], requestId: data?.details?.requestId }); setRows([]); return; }
    setPermissionDenied(null);
    if (!data.ok) throw new Error(data.error || "Failed to load transactions");
    setRows(normalizeTransactions(data.bills || []));
  }, []);

  const handlePatronLoad = useCallback(async (barcodeRaw: string) => {
    const barcode = barcodeRaw.trim();
    if (!barcode) return;
    setPatronBarcode(barcode);
    setIsLoading(true);
    try {
      const patronRes = await fetchWithAuth(`/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`);
      const patronData = await patronRes.json().catch(() => ({}));
      if (patronRes.status === 401) { window.dispatchEvent(new Event("stacksos:auth-expired")); throw new Error("Session expired"); }
      if (patronRes.status === 403) { setPermissionDenied({ message: patronData?.error || "Permission denied", missing: Array.isArray(patronData?.details?.missing) ? patronData.details.missing : [], requestId: patronData?.details?.requestId }); setPatron(null); setRows([]); return; }
      setPermissionDenied(null);
      if (!patronData.ok || !patronData.patron) { toast.error("Patron not found"); setPatron(null); setRows([]); return; }
      const p = patronData.patron;
      const nextPatron: PatronMini = { id: p.id, barcode, firstName: p.first_given_name || "", lastName: p.family_name || "" };
      setPatron(nextPatron);
      await loadTransactions(nextPatron.id, view);
      toast.success("Patron loaded");
    } catch (err) { clientLogger.error("Error loading bills:", err); toast.error("Failed to load patron bills"); setPatron(null); setRows([]); } finally { setIsLoading(false); }
  }, [loadTransactions, view]);

  const patronParam = searchParams.get("patron") || "";
  useEffect(() => { if (!patronParam || isLoading || patron?.barcode === patronParam) return; void handlePatronLoad(patronParam); }, [handlePatronLoad, isLoading, patron, patronParam]);

  useEffect(() => {
    if (!patron) return;
    void (async () => { setIsLoading(true); try { await loadTransactions(patron.id, view); } catch (err) { clientLogger.error("Error switching bill view:", err); toast.error("Failed to load transactions"); } finally { setIsLoading(false); } })();
  }, [loadTransactions, patron, view]);

  const handleSelectAll = useCallback((checked: boolean) => { setRows((prev) => prev.map((r) => ({ ...r, selected: r.balance > 0 ? checked : false }))); }, []);
  const handleSelectOne = useCallback((xactId: number, checked: boolean) => { setRows((prev) => prev.map((r) => (r.xactId == xactId ? { ...r, selected: checked } : r))); }, []);

  // Column hooks
  const columnsOutstanding = useOutstandingColumns({ outstanding, onSelectAll: handleSelectAll, onSelectOne: handleSelectOne });
  const columnsAll = useAllColumns({ onRefund: openRefund, patron });

  function openPaymentDialog(mode: "selected" | "all") {
    if (!patron) { toast.message("Load a patron first"); return; }
    if (mode === "selected") {
      if (selected.length === 0) { toast.message("Select at least one bill"); return; }
      setPaymentAmount(selectedTotal.toFixed(2)); setPaymentDialogOpen(true); return;
    }
    setRows((prev) => prev.map((r) => ({ ...r, selected: r.balance > 0 })));
    const owed = outstanding.reduce((sum, r) => sum + r.balance, 0);
    if (owed <= 0) { toast.message("No balance to pay"); return; }
    setPaymentAmount(owed.toFixed(2)); setPaymentDialogOpen(true);
  }

  const processPayment = useCallback(async () => {
    if (!patron) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Invalid amount"); return; }
    const targets = selected.length > 0 ? selected : outstanding;
    if (targets.length === 0) { toast.message("No bills selected"); return; }
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
      const data = await payBillsMutation.mutateAsync("/api/evergreen/circulation", { action: "pay_bills", patron_id: patron.id, payments, payment_type: paymentMethod, payment_note: paymentNote || undefined });
      if (!data?.ok) { toast.error(data?.error || "Payment failed"); return; }
      toast.success("Payment processed", { description: formatCurrency(amount) + " received" });
      printHtml(buildPaymentReceiptHtml({ patron, staffLabel: user?.displayName, workstation: user?.workstation, orgName: user?.activeOrgName, total: amount, method: paymentMethod, note: paymentNote || undefined, payments: receiptLines }), { title: "StacksOS Payment Receipt", tone: "receipt" });
      setPaymentDialogOpen(false); setPaymentAmount(""); setPaymentNote("");
      await loadTransactions(patron.id, view);
    } catch (err) {
      if (err instanceof ApiError) { if (err.status === 403) { const missing = Array.isArray((err.details as any)?.missing) ? (err.details as any).missing : []; setPermissionDenied({ message: err.message || "Permission denied", missing, requestId: (err.details as any)?.requestId }); toast.error("Permission denied", { description: err.message }); return; } if (err.status === 408) { toast.error("Payment timed out", { description: err.message }); return; } }
      clientLogger.error("Payment failed:", err); toast.error("Payment failed", { description: err instanceof Error ? err.message : undefined });
    } finally { setIsLoading(false); }
  }, [loadTransactions, outstanding, patron, payBillsMutation, paymentAmount, paymentMethod, paymentNote, selected, user, view]);

  function openRefund(row: TransactionRow) {
    if (!patron) { toast.message("Load a patron first"); return; }
    if (row.paid <= 0) { toast.message("No payments to refund for this transaction"); return; }
    setRefundTarget(row); setRefundAmount(row.paid.toFixed(2)); setRefundNote(""); setRefundDialogOpen(true);
  }

  const processRefund = useCallback(async () => {
    if (!patron || !refundTarget) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Invalid amount"); return; }
    setIsLoading(true);
    try {
      const data = await refundMutation.mutateAsync("/api/evergreen/circulation", { action: "process_refund", patron_id: patron.id, xactId: refundTarget.xactId, refundAmount: amount, refund_note: refundNote || undefined });
      if (!data?.ok) { toast.error(data?.error || "Refund failed"); return; }
      toast.success("Refund processed", { description: formatCurrency(amount) });
      printHtml(buildRefundReceiptHtml({ patron, staffLabel: user?.displayName, workstation: user?.workstation, orgName: user?.activeOrgName, xactId: refundTarget.xactId, title: refundTarget.title, barcode: refundTarget.barcode, refundAmount: amount, note: refundNote || undefined }), { title: "StacksOS Refund Receipt", tone: "receipt" });
      setRefundDialogOpen(false); setRefundTarget(null); setRefundAmount(""); setRefundNote("");
      await loadTransactions(patron.id, view);
    } catch (err) {
      if (err instanceof ApiError) { if (err.status === 403) { const missing = Array.isArray((err.details as any)?.missing) ? (err.details as any).missing : []; setPermissionDenied({ message: err.message || "Permission denied", missing, requestId: (err.details as any)?.requestId }); toast.error("Permission denied", { description: err.message }); return; } if (err.status === 408) { toast.error("Refund timed out", { description: err.message }); return; } }
      clientLogger.error("Refund failed:", err); toast.error("Refund failed", { description: err instanceof Error ? err.message : undefined });
    } finally { setIsLoading(false); }
  }, [loadTransactions, patron, refundAmount, refundMutation, refundNote, refundTarget, user, view]);

  const printStatement = useCallback(() => {
    if (!patron) { toast.message("Load a patron first"); return; }
    const visible = view === "outstanding" ? outstanding : rows;
    const rowsHtml = visible.map((r) => `<tr><td class="mono">${escapeHtml(r.xactId)}</td><td>${escapeHtml(r.title)}</td><td class="mono">${escapeHtml(r.barcode)}</td><td class="right mono">${escapeHtml(formatCurrency(r.amount))}</td><td class="right mono">${escapeHtml(formatCurrency(r.paid))}</td><td class="right mono">${escapeHtml(formatCurrency(r.balance))}</td></tr>`).join("\n");
    const title = view === "outstanding" ? "Outstanding Balance" : "Account Activity";
    const html = `<div class="box"><div class="brand">STACKSOS</div><h1>Account Statement</h1><div class="muted">${escapeHtml(new Date().toLocaleString())}</div><div class="meta"><div><span class="k">Patron:</span> <span class="v">${escapeHtml(patron.lastName + ", " + patron.firstName)}</span></div><div><span class="k">Barcode:</span> <span class="v mono">${escapeHtml(patron.barcode)}</span></div><div><span class="k">View:</span> <span class="v">${escapeHtml(title)}</span></div></div><h2>${escapeHtml(title)}</h2><table><thead><tr><th scope="col">Txn</th><th scope="col">Description</th><th scope="col">Barcode</th><th scope="col" class="right">Total</th><th scope="col" class="right">Paid</th><th scope="col" class="right">Balance</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="6" class="muted">No results</td></tr>'}</tbody></table><div class="meta" style="justify-content:flex-end"><div><span class="k">Total Owed:</span> <span class="v mono">${escapeHtml(formatCurrency(allTotalOwed))}</span></div></div></div>`;
    printHtml(html, { title: "StacksOS Account Statement", tone: "report" });
  }, [allTotalOwed, outstanding, patron, rows, view]);

  const headerBadges = (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary" className="rounded-full">Total Owed: {formatCurrency(allTotalOwed)}</Badge>
      {view === "outstanding" && selected.length > 0 && <Badge variant="outline" className="rounded-full">Selected: {formatCurrency(selectedTotal)}</Badge>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant={view === "outstanding" ? "default" : "outline"} onClick={() => setView("outstanding")} disabled={!patron}>Outstanding</Button>
        <Button type="button" size="sm" variant={view === "all" ? "default" : "outline"} onClick={() => setView("all")} disabled={!patron}>All Activity</Button>
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
          { label: "Pay Selected", onClick: () => openPaymentDialog("selected"), icon: DollarSign, disabled: !patron || view !== "outstanding" || selected.length === 0 },
          { label: "Pay All", onClick: () => openPaymentDialog("all"), icon: Banknote, disabled: !patron || view !== "outstanding" || outstanding.length === 0 },
          { label: "Print Statement", onClick: printStatement, icon: Printer, disabled: !patron, variant: "outline" },
          { label: "Walkthrough", onClick: () => window.location.assign("/staff/training?workflow=bills"), icon: HelpCircle, variant: "outline" },
        ]}
      >
        {headerBadges}
      </PageHeader>

      <PageContent className="space-y-6">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Patron</h3>
            <BarcodeInput label="Patron Barcode" placeholder="Scan patron barcode..." value={patronBarcode} onChange={setPatronBarcode} onSubmit={handlePatronLoad} isLoading={isLoading} />
            <div className="flex gap-2">
              <Button onClick={() => handlePatronLoad(patronBarcode)} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4 mr-1" />Load</>}
              </Button>
              <Button variant="outline" onClick={() => { setPatronBarcode(""); setPatron(null); setRows([]); }}>Clear</Button>
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
                  <PermissionDeniedState message={permissionDenied.message} missing={permissionDenied.missing} requestId={permissionDenied.requestId} />
                ) : (
                  <EmptyState
                    icon={CheckCircle2}
                    title={patron ? "No results" : "Search for a patron"}
                    description={patron ? (view === "outstanding" ? "This patron has no outstanding balance." : "No transactions found.") : "Scan a patron barcode to view bills and payments."}
                    action={patron ? { label: "Open patron record", onClick: () => router.push(`/staff/patrons/${patron.id}`) } : { label: "Seed demo data", onClick: () => router.push("/staff/help#demo-data") }}
                    secondaryAction={patron ? { label: "How billing works", onClick: () => router.push("/staff/help#evergreen-setup") } : { label: "Search patrons", onClick: () => router.push("/staff/patrons") }}
                  />
                )
              }
            />
          </div>

          {patron && (
            <Card className="rounded-2xl border-border/70 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div><h3 className="font-semibold text-sm">{patron.lastName}, {patron.firstName}</h3><p className="text-[11px] text-muted-foreground font-mono">{patron.barcode}</p></div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Owed</span><span className="font-semibold text-rose-600">{formatCurrency(allTotalOwed)}</span></div>
                  {view === "outstanding" && <div className="flex justify-between"><span className="text-muted-foreground">Selected</span><span className="font-medium">{formatCurrency(selectedTotal)}</span></div>}
                </div>
                {view === "outstanding" && (
                  <div className="space-y-2">
                    <Button className="w-full" onClick={() => openPaymentDialog("selected")} disabled={selected.length === 0}><DollarSign className="h-4 w-4 mr-1" />Pay {formatCurrency(selectedTotal)}</Button>
                    <Button variant="outline" className="w-full" onClick={() => openPaymentDialog("all")} disabled={outstanding.length === 0}>Pay Full Balance</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageContent>

      <BillsDialogs
        paymentDialogOpen={paymentDialogOpen} setPaymentDialogOpen={setPaymentDialogOpen}
        paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount}
        paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
        paymentNote={paymentNote} setPaymentNote={setPaymentNote}
        selectedCount={selected.length} outstandingCount={outstanding.length}
        onProcessPayment={processPayment}
        refundDialogOpen={refundDialogOpen} setRefundDialogOpen={setRefundDialogOpen}
        refundTarget={refundTarget} refundAmount={refundAmount} setRefundAmount={setRefundAmount}
        refundNote={refundNote} setRefundNote={setRefundNote}
        onProcessRefund={processRefund}
        isLoading={isLoading}
      />
    </PageContainer>
  );
}

export default function BillsPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <BillsContent />
    </Suspense>
  );
}
