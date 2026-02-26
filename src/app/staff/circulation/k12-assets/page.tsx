"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageContent, PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Box, Loader2, RefreshCw, RotateCcw, ScanBarcode } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Asset = {
  id: number;
  tenantId: string;
  assetTag: string;
  name: string;
  category: string;
  model: string | null;
  serialNumber: string | null;
  status: string;
  condition: string | null;
  conditionNotes: string | null;
  purchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "available", label: "Available" },
  { value: "assigned", label: "Assigned" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "device", label: "Device" },
  { value: "chromebook", label: "Chromebook" },
  { value: "tablet", label: "Tablet" },
  { value: "calculator", label: "Calculator" },
  { value: "other", label: "Other" },
];

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "available":
      return "default";
    case "assigned":
      return "secondary";
    case "maintenance":
      return "outline";
    case "retired":
      return "destructive";
    default:
      return "outline";
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function K12AssetsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [scanInput, setScanInput] = useState("");

  // Create asset form
  const [createForm, setCreateForm] = useState({
    assetTag: "",
    name: "",
    category: "device",
    model: "",
    serialNumber: "",
    condition: "good",
    purchaseDate: "",
  });

  // Assign form
  const [assignForm, setAssignForm] = useState({
    assetId: "",
    studentId: "",
  });

  // Return form
  const [returnForm, setReturnForm] = useState({
    assignmentId: "",
    conditionOnReturn: "good",
    notes: "",
  });

  async function loadAssets() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await fetchWithAuth(`/api/staff/k12/assets${qs}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      setAssets(Array.isArray(json.assets) ? (json.assets as Asset[]) : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load assets: ${message}`);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  async function runAction(payload: Record<string, any>, successMessage: string) {
    setSaving(true);
    try {
      const response = await fetchWithAuth("/api/staff/k12/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      toast.success(successMessage);
      await loadAssets();
      return json;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function onCreateAsset() {
    if (!createForm.assetTag.trim() || !createForm.name.trim()) return;
    await runAction(
      {
        action: "createAsset",
        assetTag: createForm.assetTag.trim(),
        name: createForm.name.trim(),
        category: createForm.category,
        model: createForm.model.trim() || undefined,
        serialNumber: createForm.serialNumber.trim() || undefined,
        condition: createForm.condition,
        purchaseDate: createForm.purchaseDate || undefined,
      },
      "Asset created"
    );
    setCreateForm({
      assetTag: "",
      name: "",
      category: "device",
      model: "",
      serialNumber: "",
      condition: "good",
      purchaseDate: "",
    });
  }

  async function onAssignAsset() {
    if (!assignForm.assetId || !assignForm.studentId) return;
    await runAction(
      {
        action: "assignAsset",
        assetId: Number(assignForm.assetId),
        studentId: Number(assignForm.studentId),
      },
      "Asset assigned"
    );
    setAssignForm({ assetId: "", studentId: "" });
  }

  async function onReturnAsset() {
    if (!returnForm.assignmentId) return;
    await runAction(
      {
        action: "returnAsset",
        assignmentId: Number(returnForm.assignmentId),
        conditionOnReturn: returnForm.conditionOnReturn || undefined,
        notes: returnForm.notes.trim() || undefined,
      },
      "Asset returned"
    );
    setReturnForm({ assignmentId: "", conditionOnReturn: "good", notes: "" });
  }

  function handleScanSubmit() {
    const tag = scanInput.trim();
    if (!tag) return;
    const found = assets.find((a) => a.assetTag.toLowerCase() === tag.toLowerCase());
    if (found) {
      toast.info(`Found asset: ${found.name} (${found.status})`);
    } else {
      toast.error(`No asset found with tag: ${tag}`);
    }
    setScanInput("");
  }

  return (
    <PageContainer>
      <PageHeader
        title="K-12 Asset Management"
        subtitle="Track and manage school devices, Chromebooks, and equipment assigned to students."
        breadcrumbs={[{ label: "Circulation" }, { label: "K-12 Assets" }]}
        actions={[
          {
            label: loading ? "Refreshing..." : "Refresh",
            onClick: () => void loadAssets(),
            icon: loading ? Loader2 : RefreshCw,
            variant: "outline",
          },
        ]}
      />

      <PageContent className="space-y-6">
        {/* Barcode scan input */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ScanBarcode className="h-4 w-4" />
              Barcode Scan
            </CardTitle>
            <CardDescription>Scan or type an asset tag to look up an asset.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleScanSubmit();
              }}
              className="flex gap-2"
            >
              <Input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Scan or type asset tag..."
                className="max-w-sm"
                autoFocus
              />
              <Button type="submit" variant="outline" disabled={!scanInput.trim()}>
                Look Up
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Asset inventory table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Box className="h-4 w-4" />
              Asset Inventory
            </CardTitle>
            <CardDescription>
              {assets.length} asset{assets.length !== 1 ? "s" : ""} found.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading assets...
              </div>
            ) : assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No assets found. Create your first asset below.
              </p>
            ) : (
              <div className="space-y-2">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between rounded border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {asset.name}{" "}
                        <span className="text-muted-foreground">({asset.assetTag})</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {asset.category}
                        {asset.model ? ` - ${asset.model}` : ""}
                        {asset.serialNumber ? ` | S/N: ${asset.serialNumber}` : ""}
                        {asset.condition ? ` | Condition: ${asset.condition}` : ""}
                      </div>
                    </div>
                    <Badge variant={statusBadgeVariant(asset.status)}>{asset.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create asset form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add Asset</CardTitle>
            <CardDescription>Register a new asset in the inventory.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-tag">Asset Tag</Label>
                <Input
                  id="asset-tag"
                  value={createForm.assetTag}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, assetTag: e.target.value }))}
                  placeholder="CB-2026-0042"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-name">Name</Label>
                <Input
                  id="asset-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Chromebook #42"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-category">Category</Label>
                <Select
                  value={createForm.category}
                  onValueChange={(v) => setCreateForm((prev) => ({ ...prev, category: v }))}
                >
                  <SelectTrigger id="asset-category" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="device">Device</SelectItem>
                    <SelectItem value="chromebook">Chromebook</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="calculator">Calculator</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-model">Model (optional)</Label>
                <Input
                  id="asset-model"
                  value={createForm.model}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="HP Chromebook 14"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-serial">Serial Number (optional)</Label>
                <Input
                  id="asset-serial"
                  value={createForm.serialNumber}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, serialNumber: e.target.value }))
                  }
                  placeholder="SN12345678"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-condition">Condition</Label>
                <Select
                  value={createForm.condition}
                  onValueChange={(v) => setCreateForm((prev) => ({ ...prev, condition: v }))}
                >
                  <SelectTrigger id="asset-condition" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => void onCreateAsset()} disabled={saving || loading}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Asset
            </Button>
          </CardContent>
        </Card>

        {/* Assign asset form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assign Asset</CardTitle>
            <CardDescription>Assign an asset to a student by ID.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="assign-asset-id">Asset ID</Label>
                <Input
                  id="assign-asset-id"
                  type="number"
                  value={assignForm.assetId}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, assetId: e.target.value }))}
                  placeholder="Asset ID"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assign-student-id">Student ID</Label>
                <Input
                  id="assign-student-id"
                  type="number"
                  value={assignForm.studentId}
                  onChange={(e) =>
                    setAssignForm((prev) => ({ ...prev, studentId: e.target.value }))
                  }
                  placeholder="Student ID"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => void onAssignAsset()}
                  disabled={saving || !assignForm.assetId || !assignForm.studentId}
                >
                  Assign
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Return asset form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Return Asset
            </CardTitle>
            <CardDescription>Return an assigned asset with condition notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="return-assignment-id">Assignment ID</Label>
                <Input
                  id="return-assignment-id"
                  type="number"
                  value={returnForm.assignmentId}
                  onChange={(e) =>
                    setReturnForm((prev) => ({ ...prev, assignmentId: e.target.value }))
                  }
                  placeholder="Assignment ID"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="return-condition">Condition</Label>
                <Select
                  value={returnForm.conditionOnReturn}
                  onValueChange={(v) =>
                    setReturnForm((prev) => ({ ...prev, conditionOnReturn: v }))
                  }
                >
                  <SelectTrigger id="return-condition" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="return-notes">Notes (optional)</Label>
                <Input
                  id="return-notes"
                  value={returnForm.notes}
                  onChange={(e) => setReturnForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Condition notes"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => void onReturnAsset()}
                  disabled={saving || !returnForm.assignmentId}
                >
                  Return
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
