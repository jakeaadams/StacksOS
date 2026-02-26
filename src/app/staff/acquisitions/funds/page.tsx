"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DollarSign,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Building2,
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  Eye,
} from "lucide-react";

interface Fund {
  id: number;
  name: string;
  code: string;
  year: number;
  org: number;
  orgName: string | null;
  currency: string;
  active: boolean;
  rollover: boolean;
  allocated: number;
  spent: number;
  encumbered: number;
  balance: number;
}

interface FundFormData {
  name: string;
  code: string;
  year: number;
  org: number | null;
  currency: string;
  rollover: boolean;
  propagate: boolean;
  balanceWarningPercent: number | null;
  balanceStopPercent: number | null;
}

const DEFAULT_FORM_DATA: FundFormData = {
  name: "",
  code: "",
  year: new Date().getFullYear(),
  org: null,
  currency: "USD",
  rollover: false,
  propagate: false,
  balanceWarningPercent: null,
  balanceStopPercent: null,
};

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export default function FundsPage() {
  const router = useRouter();
  const { orgs } = useAuth();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [selectedOrgId, setSelectedOrgId] = useState<number | "all">("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<Fund | null>(null);
  const [formData, setFormData] = useState<FundFormData>(DEFAULT_FORM_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingFund, setDeletingFund] = useState<Fund | null>(null);

  const loadFunds = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear !== "all") params.append("year", String(selectedYear));
      if (selectedOrgId !== "all") params.append("org_id", String(selectedOrgId));
      const response = await fetchWithAuth(
        `/api/evergreen/acquisitions/funds?${params.toString()}`
      );
      const data = await response.json();
      if (data.ok) {
        setFunds(data.funds || []);
      } else {
        toast.error(data.error || "Failed to load funds");
      }
    } catch {
      toast.error("Failed to load funds");
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedOrgId]);

  useEffect(() => {
    loadFunds();
  }, [loadFunds]);

  useEffect(() => {
    if (!formData.org && orgs.length > 0) {
      setFormData((prev) => ({ ...prev, org: orgs[0]!.id }));
    }
  }, [orgs, formData.org]);

  const handleOpenCreate = () => {
    setEditingFund(null);
    setFormData({ ...DEFAULT_FORM_DATA, org: orgs.length > 0 ? orgs[0]!.id : null });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (fund: Fund) => {
    setEditingFund(fund);
    setFormData({
      name: fund.name,
      code: fund.code,
      year: fund.year,
      org: fund.org,
      currency: fund.currency,
      rollover: fund.rollover,
      propagate: false,
      balanceWarningPercent: null,
      balanceStopPercent: null,
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Fund name is required");
      return;
    }
    if (!formData.code.trim()) {
      toast.error("Fund code is required");
      return;
    }
    if (!formData.org) {
      toast.error("Organization is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/acquisitions/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingFund ? "update" : "create",
          id: editingFund?.id,
          ...formData,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        toast.success(editingFund ? "Fund updated" : "Fund created", {
          description: formData.name,
        });
        setIsFormOpen(false);
        await loadFunds();
      } else {
        toast.error(data.error || "Failed to save fund");
      }
    } catch {
      toast.error("Failed to save fund");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingFund) return;
    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/acquisitions/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deletingFund.id }),
      });
      const data = await response.json();
      if (data.ok) {
        toast.success("Fund deleted", { description: deletingFund.name });
        setDeleteConfirmOpen(false);
        setDeletingFund(null);
        await loadFunds();
      } else {
        toast.error(data.error || "Failed to delete fund");
      }
    } catch {
      toast.error("Failed to delete fund");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredFunds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return funds;
    return funds.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q) ||
        (f.orgName || "").toLowerCase().includes(q)
    );
  }, [funds, searchQuery]);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  };

  const getUsagePercent = (fund: Fund) => {
    if (fund.allocated <= 0) return 0;
    return Math.min(100, ((fund.spent + fund.encumbered) / fund.allocated) * 100);
  };

  const columns: ColumnDef<Fund>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Fund",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{row.original.code}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "year",
        header: "Year",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span>{row.original.year}</span>
          </div>
        ),
      },
      {
        accessorKey: "orgName",
        header: "Organization",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span>{row.original.orgName || `Org ${row.original.org}`}</span>
          </div>
        ),
      },
      {
        accessorKey: "allocated",
        header: "Allocated",
        cell: ({ row }) => (
          <span className="font-mono">
            {formatCurrency(row.original.allocated, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "spent",
        header: "Spent",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-red-500" />
            <span className="font-mono text-red-600">
              {formatCurrency(row.original.spent, row.original.currency)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "encumbered",
        header: "Encumbered",
        cell: ({ row }) => (
          <span className="font-mono text-amber-600">
            {formatCurrency(row.original.encumbered, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "balance",
        header: "Balance",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span
              className={`font-mono ${row.original.balance < 0 ? "text-red-600" : "text-green-600"}`}
            >
              {formatCurrency(row.original.balance, row.original.currency)}
            </span>
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
              <Progress
                value={percent}
                className={`h-2 ${percent > 90 ? "[&>div]:bg-red-500" : percent > 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`}
              />
              <div className="text-xs text-muted-foreground mt-1">{percent.toFixed(0)}%</div>
            </div>
          );
        },
      },
      {
        accessorKey: "active",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            className={
              row.original.active ? "bg-green-100 text-green-800" : "bg-muted/50 text-foreground"
            }
          >
            {row.original.active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/staff/acquisitions/funds/${row.original.id}`)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(row.original)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeletingFund(row.original);
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ),
      },
    ],
    [router]
  );

  const stats = useMemo(() => {
    const totalAllocated = funds.reduce((sum, f) => sum + f.allocated, 0);
    const totalSpent = funds.reduce((sum, f) => sum + f.spent, 0);
    const totalEncumbered = funds.reduce((sum, f) => sum + f.encumbered, 0);
    const totalBalance = funds.reduce((sum, f) => sum + f.balance, 0);
    return { totalAllocated, totalSpent, totalEncumbered, totalBalance };
  }, [funds]);

  if (isLoading && funds.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Funds"
          subtitle="Manage acquisition funds and allocations."
          breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Funds" }]}
        />
        <PageContent>
          <LoadingSpinner message="Loading funds..." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Funds"
        subtitle="Manage acquisition funds and allocations."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Funds" }]}
        actions={[
          { label: "Refresh", onClick: loadFunds, icon: RefreshCw, variant: "outline" },
          { label: "Add Fund", onClick: handleOpenCreate, icon: Plus },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Allocated
                  </p>
                  <div className="text-2xl font-semibold mt-1">
                    {formatCurrency(stats.totalAllocated)}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Spent
                  </p>
                  <div className="text-2xl font-semibold mt-1 text-red-600">
                    {formatCurrency(stats.totalSpent)}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-600">
                  <TrendingDown className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Encumbered
                  </p>
                  <div className="text-2xl font-semibold mt-1 text-amber-600">
                    {formatCurrency(stats.totalEncumbered)}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Balance
                  </p>
                  <div
                    className={`text-2xl font-semibold mt-1 ${stats.totalBalance < 0 ? "text-red-600" : "text-green-600"}`}
                  >
                    {formatCurrency(stats.totalBalance)}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-green-500/10 text-green-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Fund List</CardTitle>
                <CardDescription>View and manage all acquisition funds.</CardDescription>
              </div>
              <div className="flex gap-3">
                <Select
                  value={selectedYear === "all" ? "all" : String(selectedYear)}
                  onValueChange={(value) =>
                    setSelectedYear(value === "all" ? "all" : parseInt(value, 10))
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedOrgId === "all" ? "all" : String(selectedOrgId)}
                  onValueChange={(value) =>
                    setSelectedOrgId(value === "all" ? "all" : parseInt(value, 10))
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Organization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {orgs.map((org) => (
                      <SelectItem key={org.id} value={String(org.id)}>
                        {org.shortname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-64">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search funds..."
                    className="!pl-14"
                    aria-label="Search funds"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={filteredFunds}
              isLoading={isLoading}
              searchable={false}
              paginated={filteredFunds.length > 20}
              emptyState={
                <EmptyState
                  title="No funds found"
                  description={
                    searchQuery
                      ? "No funds match your search criteria."
                      : "No funds have been configured."
                  }
                  action={{ label: "Add Fund", onClick: handleOpenCreate }}
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {editingFund ? "Edit Fund" : "New Fund"}
            </DialogTitle>
            <DialogDescription>
              {editingFund ? "Update the fund details." : "Create a new acquisition fund."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Fund Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Adult Fiction"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Fund Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder="e.g., ADFIC"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Fiscal Year *</Label>
                <Select
                  value={String(formData.year)}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, year: parseInt(value, 10) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org">Organization *</Label>
                <Select
                  value={formData.org ? String(formData.org) : ""}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, org: parseInt(value, 10) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((org) => (
                      <SelectItem key={org.id} value={String(org.id)}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, currency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="rollover" className="text-sm">
                  Rollover
                </Label>
                <p className="text-xs text-muted-foreground">Carry unused balance to next year</p>
              </div>
              <Switch
                id="rollover"
                checked={formData.rollover}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, rollover: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="propagate" className="text-sm">
                  Propagate
                </Label>
                <p className="text-xs text-muted-foreground">Apply to descendant org units</p>
              </div>
              <Switch
                id="propagate"
                checked={formData.propagate}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, propagate: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editingFund ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Fund"
        description={`Are you sure you want to delete "${deletingFund?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        isLoading={isSaving}
      />
    </PageContainer>
  );
}
