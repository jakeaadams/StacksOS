"use client";

import { useCallback, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  ConfirmDialog,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColumnDef } from "@tanstack/react-table";
import { useApi } from "@/hooks";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";
import { Plus, Eye, Loader2, Receipt, CheckCircle2, Split, Pencil } from "lucide-react";

interface InvoiceRow {
  id: number;
  vendor_invoice_id?: string;
  provider?: number;
  recv_date?: string;
  close_date?: string;
  closed_by?: number;
}

interface FundRow {
  id: number;
  name: string;
  code?: string;
  currency?: string;
}

interface FundDebitRow {
  id: number;
  invoice_entry: number;
  fund: number;
  fund_name: string;
  fund_code: string;
  currency_type: string;
  amount: string;
  debit_type: string;
  encumbrance: boolean;
  create_time: string;
}

export default function InvoicesPage() {
  const { data, isLoading } = useApi<any>(
    "/api/evergreen/acquisitions/invoices",
    { immediate: true }
  );
  const { data: vendorsData } = useApi<any>("/api/evergreen/acquisitions/vendors", { immediate: true });
  const { data: methodsData } = useApi<any>("/api/evergreen/acquisitions/invoice-methods", { immediate: true });
  const { data: fundsData } = useApi<any>("/api/evergreen/acquisitions/funds", { immediate: true });

  const invoices: InvoiceRow[] = data?.invoices || [];
  const vendors = Array.isArray(vendorsData?.vendors) ? vendorsData.vendors : [];
  const methods = Array.isArray(methodsData?.methods) ? methodsData.methods : [];
  const funds: FundRow[] = Array.isArray(fundsData?.funds) ? fundsData.funds : [];

  const [createOpen, setCreateOpen] = useState(false);
  const [providerId, setProviderId] = useState<string>("");
  const [recvMethod, setRecvMethod] = useState<string>("");
  const [invIdent, setInvIdent] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [entryPoId, setEntryPoId] = useState("");
  const [entryCount, setEntryCount] = useState("1");
  const [entryCost, setEntryCost] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [entrySplits, setEntrySplits] = useState<Array<{ fundId: string; amount: string }>>([]);
  const [savingEntry, setSavingEntry] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const [splitEditorOpen, setSplitEditorOpen] = useState(false);
  const [splitEditorEntryId, setSplitEditorEntryId] = useState<number | null>(null);
  const [splitEditorSplits, setSplitEditorSplits] = useState<Array<{ fundId: string; amount: string }>>([]);
  const [splitEditorSaving, setSplitEditorSaving] = useState(false);

  const loadInvoice = useCallback(async (id: number) => {
    setSelectedInvoiceId(id);
    setDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const res = await fetchWithAuth(`/api/evergreen/acquisitions/invoices?id=${id}`);
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load invoice");
      setInvoiceDetails(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load invoice");
      setInvoiceDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      { accessorKey: "vendor_invoice_id", header: "Invoice" },
      {
        accessorKey: "provider",
        header: "Provider",
        cell: ({ row }) => row.original.provider ?? "—",
      },
      {
        accessorKey: "recv_date",
        header: "Received",
        cell: ({ row }) =>
          row.original.recv_date ? new Date(row.original.recv_date).toLocaleDateString() : "—",
      },
      {
        accessorKey: "close_date",
        header: "Closed",
        cell: ({ row }) =>
          row.original.close_date ? new Date(row.original.close_date).toLocaleDateString() : "—",
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => void loadInvoice(row.original.id)}>
            <Eye className="h-4 w-4 mr-2" />
            View
          </Button>
        ),
      },
    ],
    [loadInvoice]
  );

  const fundDebitsByEntry = useMemo(() => {
    const map = new Map<number, FundDebitRow[]>();
    const list: FundDebitRow[] = Array.isArray(invoiceDetails?.fundDebits) ? invoiceDetails.fundDebits : [];
    for (const fd of list) {
      const entryId = typeof fd.invoice_entry === "number" ? fd.invoice_entry : parseInt(String((fd as any).invoice_entry ?? ""), 10);
      if (!Number.isFinite(entryId)) continue;
      if (!map.has(entryId)) map.set(entryId, []);
      map.get(entryId)!.push(fd);
    }
    return map;
  }, [invoiceDetails]);

  const normalizeSplitsForApi = (splits: Array<{ fundId: string; amount: string }>) => {
    return splits
      .map((s) => ({ fundId: parseInt(s.fundId, 10), amount: parseFloat(s.amount) }))
      .filter((s) => Number.isFinite(s.fundId) && s.fundId > 0 && Number.isFinite(s.amount) && s.amount > 0);
  };

  const entrySplitSum = useMemo(() => {
    const xs = normalizeSplitsForApi(entrySplits);
    const sum = xs.reduce((a, s) => a + s.amount, 0);
    return Math.round(sum * 100) / 100;
  }, [entrySplits]);

  const createInvoice = async () => {
    if (!providerId) return toast.error("Select a provider");
    if (!recvMethod) return toast.error("Select a receive method");
    if (!invIdent.trim()) return toast.error("Invoice identifier required");
    setCreating(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: parseInt(providerId, 10),
          recvMethod,
          invIdent: invIdent.trim(),
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Create failed");
      toast.success("Invoice created");
      setCreateOpen(false);
      setProviderId("");
      setRecvMethod("");
      setInvIdent("");
      setNote("");
      // Reload by forcing navigation reload is heavy; rely on user refresh or add refetch hook in future.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const addEntry = async () => {
    if (!selectedInvoiceId) return;
    const poId = entryPoId.trim() ? parseInt(entryPoId.trim(), 10) : NaN;
    if (!Number.isFinite(poId)) return toast.error("Purchase order ID required");
    const count = parseInt(entryCount || "1", 10);
    if (!Number.isFinite(count) || count <= 0) return toast.error("Item count must be > 0");
    setSavingEntry(true);
    try {
      const splits = normalizeSplitsForApi(entrySplits);
      if (splits.length > 0) {
        const fundIds = new Set<number>();
        for (const s of splits) {
          if (fundIds.has(s.fundId)) {
            toast.error("Duplicate funds in split list");
            setSavingEntry(false);
            return;
          }
          fundIds.add(s.fundId);
        }
      }

      const res = await fetchWithAuth("/api/evergreen/acquisitions/invoices/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: selectedInvoiceId,
          purchaseOrderId: poId,
          invItemCount: count,
          costBilled: entryCost.trim() || undefined,
          note: entryNote.trim() || undefined,
          splits: splits.length > 0 ? splits : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Add entry failed");
      toast.success("Invoice entry added");
      setEntryPoId("");
      setEntryCount("1");
      setEntryCost("");
      setEntryNote("");
      setEntrySplits([]);
      await loadInvoice(selectedInvoiceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add entry failed");
    } finally {
      setSavingEntry(false);
    }
  };

  const openSplitEditor = (entryId: number) => {
    setSplitEditorEntryId(entryId);
    const existing = fundDebitsByEntry.get(entryId) || [];
    if (existing.length === 0) {
      setSplitEditorSplits([{ fundId: "", amount: "" }]);
    } else {
      setSplitEditorSplits(
        existing.map((fd) => ({ fundId: String(fd.fund), amount: String(fd.amount || "").trim() }))
      );
    }
    setSplitEditorOpen(true);
  };

  const saveSplitEdits = async () => {
    if (!splitEditorEntryId) return;
    const splits = normalizeSplitsForApi(splitEditorSplits);
    if (splits.length === 0) return toast.error("Add at least one fund split");
    const fundIds = new Set<number>();
    for (const s of splits) {
      if (fundIds.has(s.fundId)) return toast.error("Duplicate funds in split list");
      fundIds.add(s.fundId);
    }

    setSplitEditorSaving(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/invoices/entries/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceEntryId: splitEditorEntryId, splits }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Save failed");
      toast.success("Fund splits saved");
      setSplitEditorOpen(false);
      if (selectedInvoiceId) await loadInvoice(selectedInvoiceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSplitEditorSaving(false);
    }
  };

  const closeInvoice = async () => {
    if (!selectedInvoiceId) return;
    setConfirmDialog({
      open: true,
      title: "Close Invoice",
      description: "Close this invoice? This sets close_date in Evergreen.",
      onConfirm: () => doCloseInvoice(),
    });
  };

  const doCloseInvoice = async () => {
    if (!selectedInvoiceId) return;
    setClosing(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/invoices/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: selectedInvoiceId }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Close failed");
      toast.success("Invoice closed");
      await loadInvoice(selectedInvoiceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Close failed");
    } finally {
      setClosing(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Invoices"
        subtitle="Create and manage Evergreen acquisition invoices."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Invoices" }]}
        actions={[{ label: "Create invoice", onClick: () => setCreateOpen(true), icon: Plus }]}
      />
      <PageContent>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create invoice</DialogTitle>
              <DialogDescription>Creates an Evergreen `acq.invoice` record.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div>
                <Label htmlFor="provider">Provider</Label>
                <Select id="provider" value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="receive-method">Receive method</Label>
                <Select id="receive-method" value={recvMethod} onValueChange={setRecvMethod}>
                  <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    {methods.map((m: any) => (
                      <SelectItem key={m.code} value={String(m.code)}>{m.name || m.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="vendor-invoice-id">Vendor invoice ID</Label>
                <Input id="vendor-invoice-id" value={invIdent} onChange={(e) => setInvIdent(e.target.value)} placeholder="e.g. INV-12345" />
              </div>

              <div>
                <Label htmlFor="note">Note (optional)</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
              <Button onClick={() => void createInvoice()} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Invoice details</DialogTitle>
              <DialogDescription>View entries and close the invoice when ready.</DialogDescription>
            </DialogHeader>
            {detailsLoading ? (
              <div className="p-10 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !invoiceDetails ? (
              <EmptyState title="No invoice selected" description="Select an invoice from the list." />
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Add invoice entry</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="purchase-order-id">Purchase order ID</Label>
                      <Input id="purchase-order-id" value={entryPoId} onChange={(e) => setEntryPoId(e.target.value)} placeholder="PO id" />
                    </div>
                    <div>
                      <Label htmlFor="item-count">Item count</Label>
                      <Input id="item-count" value={entryCount} onChange={(e) => setEntryCount(e.target.value)} placeholder="1" />
                    </div>
                    <div>
                      <Label htmlFor="cost-billed">Cost billed (optional)</Label>
                      <Input id="cost-billed" value={entryCost} onChange={(e) => setEntryCost(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="md:col-span-4">
                      <Label htmlFor="note-2">Note (optional)</Label>
                      <Input id="note-2" value={entryNote} onChange={(e) => setEntryNote(e.target.value)} placeholder="Optional" />
                    </div>

                    <div className="md:col-span-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="fund-splits" className="flex items-center gap-2">
                          <Split className="h-4 w-4 text-muted-foreground" />
                          Fund splits (optional)
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEntrySplits((prev) => [...prev, { fundId: "", amount: "" }])}
                          disabled={funds.length === 0}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add split
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Use splits to allocate this invoice entry across multiple funds. Splits must sum to the billed amount (if provided).
                      </div>

                      {entrySplits.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {entrySplits.map((s, idx) => (
                            <div key={idx} className="grid gap-2 grid-cols-12 items-end">
                              <div className="col-span-7">
                                <Label htmlFor="fund" className="text-xs">Fund</Label>
                                <Select id="fund"
                                  value={s.fundId}
                                  onValueChange={(v) =>
                                    setEntrySplits((prev) =>
                                      prev.map((row, i) => (i === idx ? { ...row, fundId: v } : row))
                                    )
                                  }
                                >
                                  <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
                                  <SelectContent>
                                    {funds.map((f) => (
                                      <SelectItem key={f.id} value={String(f.id)}>
                                        {f.name} {f.code ? `(${f.code})` : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-4">
                                <Label htmlFor="amount" className="text-xs">Amount</Label>
                                <Input id="amount"
                                  value={s.amount}
                                  onChange={(e) =>
                                    setEntrySplits((prev) =>
                                      prev.map((row, i) => (i === idx ? { ...row, amount: e.target.value } : row))
                                    )
                                  }
                                  placeholder="0.00"
                                />
                              </div>
                              <div className="col-span-1 flex justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEntrySplits((prev) => prev.filter((_, i) => i !== idx))}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}

                          <div className="text-xs text-muted-foreground">
                            Split total: <span className="font-mono">{entrySplitSum.toFixed(2)}</span>
                            {entryCost.trim() ? (
                              <>
                                {" "}• Cost billed: <span className="font-mono">{entryCost.trim()}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-4 flex justify-end gap-2">
                      <Button variant="outline" onClick={() => void closeInvoice()} disabled={closing}>
                        {closing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Close invoice
                      </Button>
                      <Button onClick={() => void addEntry()} disabled={savingEntry}>
                        {savingEntry ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                        Add entry
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Entries</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>PO</TableHead>
                          <TableHead>Count</TableHead>
                          <TableHead>Cost</TableHead>
                          <TableHead>Fund splits</TableHead>
                          <TableHead>Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(invoiceDetails.entries || []).map((e: any) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-mono">{e.id}</TableCell>
                            <TableCell className="font-mono">{e.purchase_order ?? "—"}</TableCell>
                            <TableCell>{e.inv_item_count ?? "—"}</TableCell>
                            <TableCell>{e.cost_billed ?? "—"}</TableCell>
                            <TableCell>
                              {(() => {
                                const fds = fundDebitsByEntry.get(e.id) || [];
                                if (fds.length === 0) {
                                  return (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openSplitEditor(e.id)}
                                      className="text-muted-foreground"
                                    >
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Add splits
                                    </Button>
                                  );
                                }
                                return (
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs">
                                      {fds.map((fd) => (
                                        <div key={fd.id} className="truncate">
                                          <span className="font-medium">{fd.fund_name}</span>{" "}
                                          <span className="font-mono text-muted-foreground">{fd.amount}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={() => openSplitEditor(e.id)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit
                                    </Button>
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{e.note || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailsOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={splitEditorOpen} onOpenChange={setSplitEditorOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Fund splits</DialogTitle>
              <DialogDescription>
                Allocate an invoice entry across funds. Changes are saved to Evergreen as `acq.fund_debit` rows tied to the invoice entry.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {splitEditorSplits.map((s, idx) => (
                <div key={idx} className="grid gap-2 grid-cols-12 items-end">
                  <div className="col-span-7">
                    <Label htmlFor="fund-2" className="text-xs">Fund</Label>
                    <Select id="fund-2"
                      value={s.fundId}
                      onValueChange={(v) =>
                        setSplitEditorSplits((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, fundId: v } : row))
                        )
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
                      <SelectContent>
                        {funds.map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>
                            {f.name} {f.code ? `(${f.code})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="amount-2" className="text-xs">Amount</Label>
                    <Input id="amount-2"
                      value={s.amount}
                      onChange={(e) =>
                        setSplitEditorSplits((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, amount: e.target.value } : row))
                        )
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSplitEditorSplits((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setSplitEditorSplits((p) => [...p, { fundId: "", amount: "" }])}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add split
                </Button>
                <div className="text-xs text-muted-foreground">
                  Total:{" "}
                  <span className="font-mono">
                    {(() => {
                      const sum = normalizeSplitsForApi(splitEditorSplits).reduce((a, s) => a + s.amount, 0);
                      return (Math.round(sum * 100) / 100).toFixed(2);
                    })()}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSplitEditorOpen(false)} disabled={splitEditorSaving}>
                Cancel
              </Button>
              <Button onClick={() => void saveSplitEdits()} disabled={splitEditorSaving}>
                {splitEditorSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Split className="h-4 w-4 mr-2" />}
                Save splits
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Invoices returned from Evergreen acquisitions.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={invoices}
              isLoading={isLoading}
              searchable
              searchPlaceholder="Search invoices..."
              paginated={true}
              emptyState={
                <EmptyState
                  title="No invoices"
                  description={data?.message || "No invoices returned."}
                  action={{
                    label: "Evergreen setup checklist",
                    onClick: () => window.location.assign("/staff/help#evergreen-setup"),
                  }}
                  secondaryAction={{
                    label: "Seed demo data",
                    onClick: () => window.location.assign("/staff/help#demo-data"),
                  }}
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((s) => ({ ...s, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
      />
    </PageContainer>
  );
}
