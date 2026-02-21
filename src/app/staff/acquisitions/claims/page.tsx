"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { fetchWithAuth } from "@/lib/client-fetch";
import {
  PageContainer,
  PageHeader,
  PageContent,
  EmptyState,
  ErrorMessage,
  ConfirmDialog,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, RefreshCw, Send, PackageCheck, Ban, StickyNote, Loader2 } from "lucide-react";

type ClaimableItem = {
  lineitemId: number;
  lineitemDetailId: number;
  title: string;
  author?: string;
  isbn?: string;
  barcode?: string;
  orderDate: string;
  expectedReceiveDate?: string | null;
  vendorId: number;
  vendorName: string;
  purchaseOrderId: number;
  purchaseOrderName: string;
  claimCount: number;
  lastClaimDate?: string | null;
  daysOverdue: number;
};

type ClaimEvent = {
  id: number;
  lineitemId: number;
  lineitemDetailId?: number;
  claimType: string;
  claimDate: string;
  claimCount: number;
  vendorId?: number;
  vendorName?: string;
  notes?: string;
  creator?: number;
  createTime: string;
};

type ClaimTypeOption = { id: number; code: string; description: string };

export default function ClaimsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [claimable, setClaimable] = useState<ClaimableItem[]>([]);
  const [history, setHistory] = useState<ClaimEvent[]>([]);
  const [claimTypes, setClaimTypes] = useState<ClaimTypeOption[]>([]);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [claimTypeId, setClaimTypeId] = useState<string>("1");
  const [notes, setNotes] = useState("");
  const [sendNotification, setSendNotification] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, hRes, tRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/acquisitions/claims?action=claimable&limit=200"),
        fetchWithAuth("/api/evergreen/acquisitions/claims?action=history&limit=200"),
        fetchWithAuth("/api/evergreen/acquisitions/claims?action=claim_reasons"),
      ]);
      const [cJson, hJson, tJson] = await Promise.all([cRes.json(), hRes.json(), tRes.json()]);

      if (!cRes.ok || cJson.ok === false) throw new Error(cJson.error || "Failed to load claimable items");
      if (!hRes.ok || hJson.ok === false) throw new Error(hJson.error || "Failed to load claim history");

      setClaimable(Array.isArray(cJson.items) ? cJson.items : []);
      setHistory(Array.isArray(hJson.history) ? hJson.history : []);
      setClaimTypes(Array.isArray(tJson?.reasons) ? tJson.reasons : Array.isArray(tJson?.claimTypes) ? tJson.claimTypes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filteredClaimable = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return claimable;
    return claimable.filter((i) => {
      return (
        String(i.lineitemDetailId).includes(q) ||
        String(i.lineitemId).includes(q) ||
        (i.title || "").toLowerCase().includes(q) ||
        (i.vendorName || "").toLowerCase().includes(q) ||
        (i.purchaseOrderName || "").toLowerCase().includes(q) ||
        (i.barcode || "").toLowerCase().includes(q) ||
        (i.isbn || "").toLowerCase().includes(q)
      );
    });
  }, [claimable, search]);

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((e) => {
      return (
        String(e.id).includes(q) ||
        String(e.lineitemId).includes(q) ||
        String(e.lineitemDetailId || "").includes(q) ||
        (e.vendorName || "").toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q)
      );
    });
  }, [history, search]);

  const toggleSelected = (detailId: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(detailId);
      else next.delete(detailId);
      return next;
    });
  };

  const runAction = async (body: any, successMsg: string) => {
    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Request failed");
      toast.success(successMsg);
      await refresh();
      return json;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const claimSelected = async () => {
    if (selected.size === 0) return toast.error("Select at least one lineitem detail to claim");
    const selectedItems = claimable.filter((i) => selected.has(i.lineitemDetailId));
    if (selectedItems.length === 0) return toast.error("No selected items found in list");

    const claimType = parseInt(claimTypeId, 10) || 1;
    const payload = {
      action: "batch_claim",
      claimTypeId: claimType,
      notes: notes.trim() || undefined,
      sendNotification,
      items: selectedItems.map((i) => ({ lineitemId: i.lineitemId, lineitemDetailId: i.lineitemDetailId })),
    };

    const out = await runAction(payload, "Claims created");
    if (out) {
      setSelected(new Set());
      setNotes("");
      setSendNotification(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Acquisitions Claims"
        subtitle="Follow up on unreceived items (Evergreen-backed)."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Claims" }]}
        actions={[{ label: "Refresh", icon: RefreshCw, onClick: () => void refresh(), variant: "outline" }]}
      />
      <PageContent className="space-y-4">
        {error ? <ErrorMessage message={error} onRetry={() => void refresh()} /> : null}

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Claims are vendor follow-ups for items that have not been received. These actions are permissioned and audited. Use “Send vendor email” only if vendor email addresses are configured in Evergreen.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, vendor, PO, barcode, ISBN..." />
          </div>
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            Selected: {selected.size}
          </div>
        </div>

        <Tabs defaultValue="claimable">
          <TabsList>
            <TabsTrigger value="claimable">Claimable ({filteredClaimable.length})</TabsTrigger>
            <TabsTrigger value="history">History ({filteredHistory.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="claimable" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Create claims
                </CardTitle>
                <CardDescription>Batch-claim the selected lineitem details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label htmlFor="claim-type">Claim type</Label>
                    <Select id="claim-type" value={claimTypeId} onValueChange={setClaimTypeId}>
                      <SelectTrigger><SelectValue placeholder="Select claim type" /></SelectTrigger>
                      <SelectContent>
                        {(claimTypes.length > 0 ? claimTypes : [{ id: 1, code: "NOT_RECEIVED", description: "Item not received from vendor" }]).map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.code} {t.description ? `— ${t.description}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note to store with the claim and (optionally) email to vendor." className="min-h-[80px]" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox checked={sendNotification} onCheckedChange={(v) => setSendNotification(Boolean(v))} />
                  <span className="text-sm">Send vendor email (best-effort)</span>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => void claimSelected()} disabled={submitting || selected.size === 0}>
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Claim selected
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Claimable items</CardTitle>
                <CardDescription>Overdue, unreceived lineitem details (heuristic; Evergreen-backed claims).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredClaimable.length === 0 ? (
                  <EmptyState title="No claimable items" description="No overdue unreceived items were found." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]" />
                        <TableHead>Title</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead>Days overdue</TableHead>
                        <TableHead>Claims</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClaimable.map((i) => (
                        <TableRow key={i.lineitemDetailId}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(i.lineitemDetailId)}
                              onCheckedChange={(v) => toggleSelected(i.lineitemDetailId, Boolean(v))}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{i.title}</div>
                            <div className="text-xs text-muted-foreground">
                              Detail #{i.lineitemDetailId} • LI #{i.lineitemId}
                              {i.barcode ? ` • ${i.barcode}` : ""}
                              {i.isbn ? ` • ${i.isbn}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>{i.vendorName}</TableCell>
                          <TableCell>
                            <div className="font-mono text-xs">{i.purchaseOrderName}</div>
                            <div className="text-xs text-muted-foreground">#{i.purchaseOrderId}</div>
                          </TableCell>
                          <TableCell className="font-mono">{i.daysOverdue}</TableCell>
                          <TableCell className="font-mono">
                            {i.claimCount}
                            {i.lastClaimDate ? <span className="text-xs text-muted-foreground"> • {String(i.lastClaimDate).split("T")[0]}</span> : null}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void runAction(
                                  { action: "receive", lineitemDetailId: i.lineitemDetailId, notes: notes.trim() || undefined },
                                  "Item received"
                                )
                              }
                              disabled={submitting}
                            >
                              <PackageCheck className="h-4 w-4 mr-2" />
                              Receive
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const note = window.prompt("Add note to this claim (stored in Evergreen):", "");
                                if (!note) return;
                                void runAction({ action: "add_note", lineitemDetailId: i.lineitemDetailId, note }, "Note added");
                              }}
                              disabled={submitting}
                            >
                              <StickyNote className="h-4 w-4 mr-2" />
                              Note
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setConfirmDialog({
                                  open: true,
                                  title: "Cancel Claim",
                                  description: "Cancel the claim for this lineitem detail?",
                                  onConfirm: () => void runAction({ action: "cancel_claim", lineitemDetailId: i.lineitemDetailId }, "Claim cancelled"),
                                });
                              }}
                              disabled={submitting}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Cancel
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  Claim history
                </CardTitle>
                <CardDescription>Recent claim events returned by Evergreen.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredHistory.length === 0 ? (
                  <EmptyState title="No claim history" description="No claim events were returned." icon={StickyNote} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Lineitem</TableHead>
                        <TableHead>Detail</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono text-xs">{e.id}</TableCell>
                          <TableCell className="font-mono text-xs">{e.lineitemId}</TableCell>
                          <TableCell className="font-mono text-xs">{e.lineitemDetailId ?? "—"}</TableCell>
                          <TableCell className="text-sm">{e.vendorName || "—"}</TableCell>
                          <TableCell className="text-sm">{e.claimType}</TableCell>
                          <TableCell className="text-xs">{String(e.createTime || e.claimDate || "").split("T")[0] || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
