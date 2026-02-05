"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  LoadingSpinner,
  ConfirmDialog,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  Wallet,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Building2,
  Search,
  TrendingUp,
  DollarSign,
  CreditCard,
} from "lucide-react";

interface FundingSource {
  id: number;
  name: string;
  code: string;
  owner: number;
  ownerName: string | null;
  currency: string;
  creditTotal: number;
  allocatedTotal: number;
  balance: number;
}

interface FundingSourceFormData {
  name: string;
  code: string;
  owner: number | null;
  currency: string;
}

const DEFAULT_FORM_DATA: FundingSourceFormData = {
  name: "",
  code: "",
  owner: null,
  currency: "USD",
};

export default function FundingSourcesPage() {
  const { orgs } = useAuth();
  const [fundingSources, setFundingSources] = useState<FundingSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<number | "all">("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<FundingSource | null>(null);
  const [formData, setFormData] = useState<FundingSourceFormData>(DEFAULT_FORM_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingSource, setDeletingSource] = useState<FundingSource | null>(null);

  const [isCreditDialogOpen, setIsCreditDialogOpen] = useState(false);
  const [creditSourceId, setCreditSourceId] = useState<number | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");

  const loadFundingSources = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOrgId !== "all") params.append("org_id", String(selectedOrgId));
      const response = await fetchWithAuth(`/api/evergreen/acquisitions/funding-sources?${params.toString()}`);
      const data = await response.json();
      if (data.ok) {
        setFundingSources(data.fundingSources || []);
      } else {
        toast.error(data.error || "Failed to load funding sources");
      }
    } catch {
      toast.error("Failed to load funding sources");
    } finally {
      setIsLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadFundingSources();
  }, [loadFundingSources]);

  useEffect(() => {
    if (!formData.owner && orgs.length > 0) {
      setFormData((prev) => ({ ...prev, owner: orgs[0].id }));
    }
  }, [orgs, formData.owner]);

  const handleOpenCreate = () => {
    setEditingSource(null);
    setFormData({ ...DEFAULT_FORM_DATA, owner: orgs.length > 0 ? orgs[0].id : null });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (source: FundingSource) => {
    setEditingSource(source);
    setFormData({ name: source.name, code: source.code, owner: source.owner, currency: source.currency });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error("Name is required"); return; }
    if (!formData.code.trim()) { toast.error("Code is required"); return; }
    if (!formData.owner) { toast.error("Owner is required"); return; }

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/acquisitions/funding-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: editingSource ? "update" : "create", id: editingSource?.id, ...formData }),
      });
      const data = await response.json();
      if (data.ok) {
        toast.success(editingSource ? "Funding source updated" : "Funding source created", { description: formData.name });
        setIsFormOpen(false);
        await loadFundingSources();
      } else {
        toast.error(data.error || "Failed to save funding source");
      }
    } catch {
      toast.error("Failed to save funding source");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSource) return;
    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/acquisitions/funding-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deletingSource.id }),
      });
      const data = await response.json();
      if (data.ok) {
        toast.success("Funding source deleted", { description: deletingSource.name });
        setDeleteConfirmOpen(false);
        setDeletingSource(null);
        await loadFundingSources();
      } else {
        toast.error(data.error || "Failed to delete funding source");
      }
    } catch {
      toast.error("Failed to delete funding source");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCredit = async () => {
    if (!creditSourceId || !creditAmount) { toast.error("Amount is required"); return; }
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Please enter a valid amount"); return; }

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/acquisitions/funding-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_credit", fundingSourceId: creditSourceId, amount, note: creditNote || null }),
      });
      const data = await response.json();
      if (data.ok) {
        toast.success("Credit added successfully");
        setIsCreditDialogOpen(false);
        setCreditSourceId(null);
        setCreditAmount("");
        setCreditNote("");
        await loadFundingSources();
      } else {
        toast.error(data.error || "Failed to add credit");
      }
    } catch {
      toast.error("Failed to add credit");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return fundingSources;
    return fundingSources.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.ownerName || "").toLowerCase().includes(q));
  }, [fundingSources, searchQuery]);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  };

  const getUsagePercent = (source: FundingSource) => {
    if (source.creditTotal <= 0) return 0;
    return Math.min(100, (source.allocatedTotal / source.creditTotal) * 100);
  };

  const columns: ColumnDef<FundingSource>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Funding Source",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{row.original.code}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "ownerName",
        header: "Owner",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span>{row.original.ownerName || `Org ${row.original.owner}`}</span>
          </div>
        ),
      },
      {
        accessorKey: "creditTotal",
        header: "Total Credit",
        cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.creditTotal, row.original.currency)}</span>,
      },
      {
        accessorKey: "allocatedTotal",
        header: "Allocated",
        cell: ({ row }) => <span className="font-mono text-amber-600">{formatCurrency(row.original.allocatedTotal, row.original.currency)}</span>,
      },
      {
        accessorKey: "balance",
        header: "Available",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span className={`font-mono ${row.original.balance < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(row.original.balance, row.original.currency)}</span>
          </div>
        ),
      },
      {
        id: "usage",
        header: "Usage",
        cell: ({ row }) => {
          const percent = getUsagePercent(row.original);
          return (
            <div className="w-24">
              <Progress value={percent} className={`h-2 ${percent > 90 ? "[&>div]:bg-red-500" : percent > 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`} />
              <div className="text-xs text-muted-foreground mt-1">{percent.toFixed(0)}%</div>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => { setCreditSourceId(row.original.id); setIsCreditDialogOpen(true); }}><CreditCard className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(row.original)}><Edit className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => { setDeletingSource(row.original); setDeleteConfirmOpen(true); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
          </div>
        ),
      },
    ],
    []
  );

  const stats = useMemo(() => {
    const totalCredit = fundingSources.reduce((sum, s) => sum + s.creditTotal, 0);
    const totalAllocated = fundingSources.reduce((sum, s) => sum + s.allocatedTotal, 0);
    const totalAvailable = fundingSources.reduce((sum, s) => sum + s.balance, 0);
    return { totalCredit, totalAllocated, totalAvailable };
  }, [fundingSources]);

  if (isLoading && fundingSources.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Funding Sources" subtitle="Manage funding sources for acquisitions." breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Funding Sources" }]} />
        <PageContent><LoadingSpinner message="Loading funding sources..." /></PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Funding Sources"
        subtitle="Manage funding sources for acquisitions."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Funding Sources" }]}
        actions={[
          { label: "Refresh", onClick: loadFundingSources, icon: RefreshCw, variant: "outline" },
          { label: "Add Funding Source", onClick: handleOpenCreate, icon: Plus },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Credit</p>
                  <div className="text-2xl font-semibold mt-1">{formatCurrency(stats.totalCredit)}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600"><Wallet className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Allocated</p>
                  <div className="text-2xl font-semibold mt-1 text-amber-600">{formatCurrency(stats.totalAllocated)}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600"><DollarSign className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Available</p>
                  <div className={`text-2xl font-semibold mt-1 ${stats.totalAvailable < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(stats.totalAvailable)}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-green-500/10 text-green-600"><TrendingUp className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Funding Source List</CardTitle>
                <CardDescription>View and manage all funding sources.</CardDescription>
              </div>
              <div className="flex gap-3">
                <Select value={selectedOrgId === "all" ? "all" : String(selectedOrgId)} onValueChange={(value) => setSelectedOrgId(value === "all" ? "all" : parseInt(value, 10))}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Organization" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {orgs.map((org) => <SelectItem key={org.id} value={String(org.id)}>{org.shortname}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="relative w-64">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search funding sources..." className="!pl-14" />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={filteredSources}
              isLoading={isLoading}
              searchable={false}
              paginated={filteredSources.length > 20}
              emptyState={<EmptyState title="No funding sources found" description={searchQuery ? "No funding sources match your search criteria." : "No funding sources have been configured."} action={{ label: "Add Funding Source", onClick: handleOpenCreate }} />}
            />
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />{editingSource ? "Edit Funding Source" : "New Funding Source"}</DialogTitle>
            <DialogDescription>{editingSource ? "Update the funding source details." : "Create a new funding source."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g., State Grant 2024" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input id="code" value={formData.code} onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))} placeholder="e.g., STGRANT24" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">Owner Organization *</Label>
              <Select value={formData.owner ? String(formData.owner) : ""} onValueChange={(value) => setFormData((prev) => ({ ...prev, owner: parseInt(value, 10) }))}>
                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>{orgs.map((org) => <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={formData.currency} onValueChange={(value) => setFormData((prev) => ({ ...prev, currency: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving..." : editingSource ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreditDialogOpen} onOpenChange={setIsCreditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Add Credit</DialogTitle>
            <DialogDescription>Add credit to this funding source.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="creditAmount">Amount *</Label>
              <Input id="creditAmount" type="number" step="0.01" min="0" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditNote">Note (optional)</Label>
              <Input id="creditNote" value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="e.g., Annual budget allocation" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCredit} disabled={isSaving}>{isSaving ? "Adding..." : "Add Credit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Funding Source"
        description={`Are you sure you want to delete "${deletingSource?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        isLoading={isSaving}
      />
    </PageContainer>
  );
}
