"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  LoadingSpinner,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowRightLeft,
  RefreshCw,
  Plus,
  Wallet,
  DollarSign,
  Calendar,
  FileText,
} from "lucide-react";

interface Fund {
  id: number;
  name: string;
  code: string;
  year: number;
  balance: number;
  currency: string;
}

interface FundingSource {
  id: number;
  name: string;
  code: string;
  balance: number;
  currency: string;
}

interface Allocation {
  id: number;
  amount: number;
  note: string | null;
  createTime: string;
  fundId: number;
  fundName: string;
  fundCode: string;
  fundingSourceId: number;
  fundingSourceName: string;
  allocator: number;
}

export default function AllocationsPage() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [fundingSources, setFundingSources] = useState<FundingSource[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isAllocateOpen, setIsAllocateOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [allocFundingSourceId, setAllocFundingSourceId] = useState<string>("");
  const [allocFundId, setAllocFundId] = useState<string>("");
  const [allocAmount, setAllocAmount] = useState("");
  const [allocNote, setAllocNote] = useState("");

  const [transferSourceFundId, setTransferSourceFundId] = useState<string>("");
  const [transferDestFundId, setTransferDestFundId] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fundsRes, sourcesRes, allocRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/acquisitions/funds"),
        fetchWithAuth("/api/evergreen/acquisitions/funding-sources"),
        fetchWithAuth("/api/evergreen/acquisitions/allocations"),
      ]);
      const fundsData = await fundsRes.json();
      const sourcesData = await sourcesRes.json();
      const allocData = await allocRes.json();
      if (fundsData.ok) setFunds(fundsData.funds || []);
      if (sourcesData.ok) setFundingSources(sourcesData.fundingSources || []);
      if (allocData.ok) setAllocations(allocData.allocations || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAllocate = async () => {
    if (!allocFundingSourceId || !allocFundId || !allocAmount) {
      toast.error("Funding source, fund, and amount are required");
      return;
    }
    const amount = parseFloat(allocAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/acquisitions/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "allocate",
          fundingSourceId: parseInt(allocFundingSourceId, 10),
          fundId: parseInt(allocFundId, 10),
          amount,
          note: allocNote || null,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        toast.success("Allocation created successfully");
        setIsAllocateOpen(false);
        setAllocFundingSourceId("");
        setAllocFundId("");
        setAllocAmount("");
        setAllocNote("");
        await loadData();
      } else {
        toast.error(data.error || "Failed to create allocation");
      }
    } catch {
      toast.error("Failed to create allocation");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferSourceFundId || !transferDestFundId || !transferAmount) {
      toast.error("Source fund, destination fund, and amount are required");
      return;
    }
    if (transferSourceFundId === transferDestFundId) {
      toast.error("Source and destination funds must be different");
      return;
    }
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/acquisitions/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer",
          sourceFundId: parseInt(transferSourceFundId, 10),
          destFundId: parseInt(transferDestFundId, 10),
          amount,
          note: transferNote || null,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        toast.success("Transfer created successfully");
        setIsTransferOpen(false);
        setTransferSourceFundId("");
        setTransferDestFundId("");
        setTransferAmount("");
        setTransferNote("");
        await loadData();
      } else {
        toast.error(data.error || "Failed to create transfer");
      }
    } catch {
      toast.error("Failed to create transfer");
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const columns: ColumnDef<Allocation>[] = useMemo(
    () => [
      {
        accessorKey: "createTime",
        header: "Date",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span>{formatDate(row.original.createTime)}</span>
          </div>
        ),
      },
      {
        accessorKey: "fundingSourceName",
        header: "Funding Source",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span>{row.original.fundingSourceName || `Source ${row.original.fundingSourceId}`}</span>
          </div>
        ),
      },
      {
        accessorKey: "fundName",
        header: "Fund",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.fundName || `Fund ${row.original.fundId}`}</div>
              {row.original.fundCode && <div className="text-xs text-muted-foreground font-mono">{row.original.fundCode}</div>}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <span className="font-mono text-green-600">+{formatCurrency(row.original.amount)}</span>,
      },
      {
        accessorKey: "note",
        header: "Note",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-muted-foreground">
            {row.original.note ? (
              <>
                <FileText className="h-3 w-3" />
                <span className="truncate max-w-48">{row.original.note}</span>
              </>
            ) : (
              <span>-</span>
            )}
          </div>
        ),
      },
    ],
    []
  );

  const selectedFundingSource = fundingSources.find((s) => String(s.id) === allocFundingSourceId);
  const selectedSourceFund = funds.find((f) => String(f.id) === transferSourceFundId);

  if (isLoading && allocations.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Allocations & Transfers" subtitle="Manage fund allocations and transfers." breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Allocations" }]} />
        <PageContent><LoadingSpinner message="Loading allocation data..." /></PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Allocations & Transfers"
        subtitle="Manage fund allocations and transfers."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Allocations" }]}
        actions={[
          { label: "Refresh", onClick: loadData, icon: RefreshCw, variant: "outline" },
          { label: "Transfer", onClick: () => setIsTransferOpen(true), icon: ArrowRightLeft, variant: "outline" },
          { label: "Allocate", onClick: () => setIsAllocateOpen(true), icon: Plus },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Funding Sources</p>
                  <div className="text-2xl font-semibold mt-1">{fundingSources.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600"><Wallet className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Funds</p>
                  <div className="text-2xl font-semibold mt-1">{funds.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-green-500/10 text-green-600"><DollarSign className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Allocations</p>
                  <div className="text-2xl font-semibold mt-1">{allocations.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-600"><ArrowRightLeft className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Allocation History</CardTitle>
            <CardDescription>View all fund allocations from funding sources.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={allocations}
              isLoading={isLoading}
              searchable={true}
              paginated={allocations.length > 20}
              emptyState={<EmptyState title="No allocations found" description="No fund allocations have been made yet." action={{ label: "Create Allocation", onClick: () => setIsAllocateOpen(true) }} />}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Quick Reference</CardTitle>
            <CardDescription>Available balances for allocations and transfers.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="sources">
              <TabsList>
                <TabsTrigger value="sources">Funding Sources</TabsTrigger>
                <TabsTrigger value="funds">Funds</TabsTrigger>
              </TabsList>
              <TabsContent value="sources" className="mt-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {fundingSources.map((source) => (
                    <div key={source.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{source.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{source.code}</div>
                      </div>
                      <div className={`font-mono text-sm ${source.balance < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(source.balance, source.currency)}</div>
                    </div>
                  ))}
                  {fundingSources.length === 0 && <p className="text-muted-foreground col-span-full text-center py-4">No funding sources available.</p>}
                </div>
              </TabsContent>
              <TabsContent value="funds" className="mt-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {funds.map((fund) => (
                    <div key={fund.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{fund.name}</div>
                        <div className="text-xs text-muted-foreground">{fund.year} - <span className="font-mono">{fund.code}</span></div>
                      </div>
                      <div className={`font-mono text-sm ${fund.balance < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(fund.balance, fund.currency)}</div>
                    </div>
                  ))}
                  {funds.length === 0 && <p className="text-muted-foreground col-span-full text-center py-4">No funds available.</p>}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={isAllocateOpen} onOpenChange={setIsAllocateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Allocate Funds</DialogTitle>
            <DialogDescription>Allocate money from a funding source to a fund.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="funding-source">Funding Source *</Label>
              <Select id="funding-source" value={allocFundingSourceId} onValueChange={setAllocFundingSourceId}>
                <SelectTrigger><SelectValue placeholder="Select funding source" /></SelectTrigger>
                <SelectContent>
                  {fundingSources.map((source) => (
                    <SelectItem key={source.id} value={String(source.id)}>
                      {source.name} ({formatCurrency(source.balance, source.currency)} available)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFundingSource && (
                <p className="text-xs text-muted-foreground">Available: {formatCurrency(selectedFundingSource.balance, selectedFundingSource.currency)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund">Fund *</Label>
              <Select id="fund" value={allocFundId} onValueChange={setAllocFundId}>
                <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
                <SelectContent>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={String(fund.id)}>
                      {fund.name} ({fund.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input id="amount" type="number" step="0.01" min="0" value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" value={allocNote} onChange={(e) => setAllocNote(e.target.value)} placeholder="e.g., FY2024 initial allocation" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAllocateOpen(false)}>Cancel</Button>
            <Button onClick={handleAllocate} disabled={isSaving}>{isSaving ? "Allocating..." : "Allocate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" />Transfer Between Funds</DialogTitle>
            <DialogDescription>Transfer money from one fund to another.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source-fund">Source Fund *</Label>
              <Select id="source-fund" value={transferSourceFundId} onValueChange={setTransferSourceFundId}>
                <SelectTrigger><SelectValue placeholder="Select source fund" /></SelectTrigger>
                <SelectContent>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={String(fund.id)}>
                      {fund.name} ({fund.year}) - {formatCurrency(fund.balance, fund.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSourceFund && (
                <p className="text-xs text-muted-foreground">Available: {formatCurrency(selectedSourceFund.balance, selectedSourceFund.currency)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="destination-fund">Destination Fund *</Label>
              <Select id="destination-fund" value={transferDestFundId} onValueChange={setTransferDestFundId}>
                <SelectTrigger><SelectValue placeholder="Select destination fund" /></SelectTrigger>
                <SelectContent>
                  {funds.filter((f) => String(f.id) !== transferSourceFundId).map((fund) => (
                    <SelectItem key={fund.id} value={String(fund.id)}>
                      {fund.name} ({fund.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount-2">Amount *</Label>
              <Input id="amount-2" type="number" step="0.01" min="0" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-2">Note (optional)</Label>
              <Textarea id="note-2" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="e.g., Budget reallocation" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={isSaving}>{isSaving ? "Transferring..." : "Transfer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
