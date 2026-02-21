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
  MapPin,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Building2,
  Eye,
  EyeOff,
  Hand,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
} from "lucide-react";

interface CopyLocation {
  id: number;
  name: string;
  owningLib: number;
  owningLibName: string | null;
  holdable: boolean;
  holdVerify: boolean;
  opacVisible: boolean;
  circulate: boolean;
  label: string | null;
  labelPrefix: string | null;
  labelSuffix: string | null;
  checkInAlert: boolean;
  deleted: boolean;
  url: string | null;
}

interface LocationFormData {
  name: string;
  owningLib: number | null;
  holdable: boolean;
  holdVerify: boolean;
  opacVisible: boolean;
  circulate: boolean;
  label: string;
  labelPrefix: string;
  labelSuffix: string;
  checkInAlert: boolean;
  url: string;
}

const DEFAULT_FORM_DATA: LocationFormData = {
  name: "",
  owningLib: null,
  holdable: true,
  holdVerify: false,
  opacVisible: true,
  circulate: true,
  label: "",
  labelPrefix: "",
  labelSuffix: "",
  checkInAlert: false,
  url: "",
};

export default function CopyLocationsPage() {
  const _router = useRouter();
  const { orgs } = useAuth();
  const [locations, setLocations] = useState<CopyLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<number | "all">("all");
  
  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<CopyLocation | null>(null);
  const [formData, setFormData] = useState<LocationFormData>(DEFAULT_FORM_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState<CopyLocation | null>(null);

  const loadLocations = useCallback(async () => {
    setIsLoading(true);
    try {
      const orgParam = selectedOrgId !== "all" ? `&org_id=${selectedOrgId}` : "";
      const response = await fetchWithAuth(
        `/api/evergreen/admin-settings?type=copy_locations&search=${encodeURIComponent(searchQuery)}${orgParam}&limit=500`
      );
      const data = await response.json();

      if (data.ok) {
        setLocations(data.locations || []);
      } else {
        toast.error(data.error || "Failed to load locations");
      }
    } catch (_error) {
      toast.error("Failed to load locations");
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedOrgId]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    if (!formData.owningLib && orgs.length > 0) {
      setFormData((prev) => ({ ...prev, owningLib: orgs[0]!.id }));
    }
  }, [orgs, formData.owningLib]);

  const handleOpenCreate = () => {
    setEditingLocation(null);
    setFormData({
      ...DEFAULT_FORM_DATA,
      owningLib: orgs.length > 0 ? orgs[0]!.id : null,
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (location: CopyLocation) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      owningLib: location.owningLib,
      holdable: location.holdable,
      holdVerify: location.holdVerify,
      opacVisible: location.opacVisible,
      circulate: location.circulate,
      label: location.label || "",
      labelPrefix: location.labelPrefix || "",
      labelSuffix: location.labelSuffix || "",
      checkInAlert: location.checkInAlert,
      url: location.url || "",
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Location name is required");
      return;
    }
    if (!formData.owningLib) {
      toast.error("Owning library is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/admin-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingLocation ? "update" : "create",
          type: "copy_location",
          data: {
            id: editingLocation?.id,
            name: formData.name.trim(),
            owningLib: formData.owningLib,
            holdable: formData.holdable,
            holdVerify: formData.holdVerify,
            opacVisible: formData.opacVisible,
            circulate: formData.circulate,
            label: formData.label || null,
            labelPrefix: formData.labelPrefix || null,
            labelSuffix: formData.labelSuffix || null,
            checkInAlert: formData.checkInAlert,
            url: formData.url || null,
          },
        }),
      });

      const data = await response.json();

      if (data.ok) {
        toast.success(
          editingLocation ? "Location updated" : "Location created",
          { description: formData.name }
        );
        setIsFormOpen(false);
        await loadLocations();
      } else {
        toast.error(data.error || "Failed to save location");
      }
    } catch (_error) {
      toast.error("Failed to save location");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingLocation) return;

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/admin-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          type: "copy_location",
          data: { id: deletingLocation.id },
        }),
      });

      const data = await response.json();

      if (data.ok) {
        toast.success("Location deleted", { description: deletingLocation.name });
        setDeleteConfirmOpen(false);
        setDeletingLocation(null);
        await loadLocations();
      } else {
        toast.error(data.error || "Failed to delete location");
      }
    } catch (_error) {
      toast.error("Failed to delete location");
    } finally {
      setIsSaving(false);
    }
  };

  const columns: ColumnDef<CopyLocation>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Location Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.name}</div>
              {row.original.label && (
                <div className="text-xs text-muted-foreground">{row.original.label}</div>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "owningLibName",
        header: "Library",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span>{row.original.owningLibName || `Org ${row.original.owningLib}`}</span>
          </div>
        ),
      },
      {
        accessorKey: "opacVisible",
        header: "OPAC Visible",
        cell: ({ row }) => (
          row.original.opacVisible ? (
            <div className="flex items-center gap-1 text-emerald-600">
              <Eye className="h-4 w-4" />
              <span className="text-xs">Visible</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground">
              <EyeOff className="h-4 w-4" />
              <span className="text-xs">Hidden</span>
            </div>
          )
        ),
      },
      {
        accessorKey: "holdable",
        header: "Holdable",
        cell: ({ row }) => (
          row.original.holdable ? (
            <div className="flex items-center gap-1 text-emerald-600">
              <Hand className="h-4 w-4" />
              <span className="text-xs">Yes</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground">
              <XCircle className="h-4 w-4" />
              <span className="text-xs">No</span>
            </div>
          )
        ),
      },
      {
        accessorKey: "circulate",
        header: "Circulates",
        cell: ({ row }) => (
          row.original.circulate ? (
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600" />
          )
        ),
      },
      {
        accessorKey: "checkInAlert",
        header: "Alert",
        cell: ({ row }) => (
          row.original.checkInAlert ? (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )
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
              onClick={() => handleOpenEdit(row.original)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeletingLocation(row.original);
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const stats = useMemo(() => {
    const visible = locations.filter((l) => l.opacVisible).length;
    const holdable = locations.filter((l) => l.holdable).length;
    const circulating = locations.filter((l) => l.circulate).length;
    const withAlerts = locations.filter((l) => l.checkInAlert).length;
    return { visible, holdable, circulating, withAlerts };
  }, [locations]);

  if (isLoading && locations.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Copy Locations"
          subtitle="Manage shelving locations for library items."
          breadcrumbs={[
            { label: "Administration", href: "/staff/admin" },
            { label: "Settings", href: "/staff/admin/settings" },
            { label: "Locations" },
          ]}
        />
        <PageContent>
          <LoadingSpinner message="Loading copy locations..." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Copy Locations"
        subtitle="Manage shelving locations for library items."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Settings", href: "/staff/admin/settings" },
          { label: "Locations" },
        ]}
        actions={[
          { label: "Refresh", onClick: loadLocations, icon: RefreshCw, variant: "outline" },
          { label: "Add Location", onClick: handleOpenCreate, icon: Plus },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Locations</p>
                  <div className="text-2xl font-semibold mt-1">{locations.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <MapPin className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">OPAC Visible</p>
                  <div className="text-2xl font-semibold mt-1">{stats.visible}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                  <Eye className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Holdable</p>
                  <div className="text-2xl font-semibold mt-1">{stats.holdable}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-600">
                  <Hand className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">With Alerts</p>
                  <div className="text-2xl font-semibold mt-1">{stats.withAlerts}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Shelving Locations</CardTitle>
                <CardDescription>
                  Configure where items can be shelved and their properties.
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <div className="w-48">
                  <Select
                    value={selectedOrgId === "all" ? "all" : String(selectedOrgId)}
                    onValueChange={(value) =>
                      setSelectedOrgId(value === "all" ? "all" : parseInt(value, 10))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by library" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Libraries</SelectItem>
                      {orgs.map((org) => (
                        <SelectItem key={org.id} value={String(org.id)}>
                          {org.shortname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search locations..."
                    className="!pl-14"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={locations}
              isLoading={isLoading}
              searchable={false}
              paginated={locations.length > 20}
              emptyState={
                <EmptyState
                  title="No locations found"
                  description={
                    searchQuery
                      ? "No locations match your search criteria."
                      : "No copy locations have been configured."
                  }
                  action={{
                    label: "Add Location",
                    onClick: handleOpenCreate,
                  }}
                />
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">About Copy Locations</CardTitle>
            <CardDescription>Understanding shelving locations in Evergreen</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-4">
            <p>
              Copy locations represent physical or logical shelving areas where items can be placed.
              Each location has properties that control how items in that location behave.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  OPAC Visibility
                </h4>
                <p className="text-xs">
                  Controls whether items in this location appear in public catalog searches.
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <Hand className="h-4 w-4" />
                  Holdability
                </h4>
                <p className="text-xs">
                  Determines if patrons can place holds on items shelved at this location.
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Check-in Alerts
                </h4>
                <p className="text-xs">
                  When enabled, staff receive an alert when checking in items from this location.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {editingLocation ? "Edit Location" : "New Location"}
            </DialogTitle>
            <DialogDescription>
              {editingLocation
                ? "Update the shelving location properties."
                : "Create a new shelving location for library items."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Location Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Adult Fiction, Children Room"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="owningLib">Owning Library *</Label>
              <Select
                value={formData.owningLib ? String(formData.owningLib) : ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, owningLib: parseInt(value, 10) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select library" />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="opac-visible" className="text-sm">OPAC Visible</Label>
                  <p className="text-xs text-muted-foreground">Show in public catalog</p>
                </div>
                <Switch id="opac-visible"
                  checked={formData.opacVisible}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, opacVisible: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="holdable" className="text-sm">Holdable</Label>
                  <p className="text-xs text-muted-foreground">Allow holds on items</p>
                </div>
                <Switch id="holdable"
                  checked={formData.holdable}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, holdable: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="circulates" className="text-sm">Circulates</Label>
                  <p className="text-xs text-muted-foreground">Items can be checked out</p>
                </div>
                <Switch id="circulates"
                  checked={formData.circulate}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, circulate: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="check-in-alert" className="text-sm">Check-in Alert</Label>
                  <p className="text-xs text-muted-foreground">Alert on check-in</p>
                </div>
                <Switch id="check-in-alert"
                  checked={formData.checkInAlert}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, checkInAlert: checked }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="hold-verify" className="text-sm">Hold Verify</Label>
                <p className="text-xs text-muted-foreground">Require verification for holds</p>
              </div>
              <Switch id="hold-verify"
                checked={formData.holdVerify}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, holdVerify: checked }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Display label override"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="labelPrefix">Label Prefix</Label>
                <Input
                  id="labelPrefix"
                  value={formData.labelPrefix}
                  onChange={(e) => setFormData((prev) => ({ ...prev, labelPrefix: e.target.value }))}
                  placeholder="e.g., REF"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="labelSuffix">Label Suffix</Label>
                <Input
                  id="labelSuffix"
                  value={formData.labelSuffix}
                  onChange={(e) => setFormData((prev) => ({ ...prev, labelSuffix: e.target.value }))}
                  placeholder="e.g., c.1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL (optional)</Label>
              <Input
                id="url"
                value={formData.url}
                onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editingLocation ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Location"
        description={`Are you sure you want to delete "${deletingLocation?.name}"? This action cannot be undone. Items currently at this location may be affected.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        isLoading={isSaving}
      />
    </PageContainer>
  );
}
