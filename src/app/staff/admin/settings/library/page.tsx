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
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  Settings,
  Search,
  RefreshCw,
  Edit,
  Building2,
  BookMarked,
  DollarSign,
  Shield,
  Check,
  X,
} from "lucide-react";

interface OrgSetting {
  id: number;
  name: string;
  label: string;
  description: string;
  value: any;
  orgUnit: number;
  datatype: string;
}

interface SettingType {
  name: string;
  label: string;
  description: string;
  datatype: string;
  fmClass?: string;
  update_perm?: number;
}

const CATEGORIES = [
  { id: "all", label: "All Settings", icon: Settings },
  { id: "holds", label: "Holds", icon: BookMarked, filter: "hold" },
  { id: "fines", label: "Fines", icon: DollarSign, filter: "fine" },
  { id: "circ", label: "Circulation", icon: Settings, filter: "circ" },
  { id: "auth", label: "Authentication", icon: Shield, filter: "auth" },
];

export default function LibrarySettingsPage() {
  const _router = useRouter();
  const { orgs } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [settings, setSettings] = useState<OrgSetting[]>([]);
  const [settingTypes, setSettingTypes] = useState<SettingType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [editingSetting, setEditingSetting] = useState<SettingType | null>(null);
  const [editValue, setEditValue] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!selectedOrgId && orgs.length > 0) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [orgs, selectedOrgId]);

  const loadSettings = useCallback(async () => {
    if (!selectedOrgId) return;

    setIsLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/evergreen/admin-settings?type=org_settings&org_id=${selectedOrgId}&search=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();

      if (data.ok) {
        setSettings(data.settings || []);
        setSettingTypes(data.settingTypes || []);
      } else {
        toast.error(data.error || "Failed to load settings");
      }
    } catch (_error) {
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }, [selectedOrgId, searchQuery]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleEditSetting = useCallback((settingType: SettingType) => {
    const existingValue = settings.find((s) => s.name === settingType.name);
    setEditingSetting(settingType);
    setEditValue(existingValue?.value ?? null);
  }, [settings]);

  const handleSaveSetting = async () => {
    if (!editingSetting || !selectedOrgId) return;

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/admin-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "org_setting",
          data: {
            name: editingSetting.name,
            value: editValue,
          },
          orgId: selectedOrgId,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        toast.success("Setting updated", { description: editingSetting.label });
        setEditingSetting(null);
        await loadSettings();
      } else {
        toast.error(data.error || "Failed to update setting");
      }
    } catch (_error) {
      toast.error("Failed to update setting");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSettingTypes = useMemo(() => {
    let filtered = settingTypes;

    // Filter by category
    if (activeCategory !== "all") {
      const category = CATEGORIES.find((c) => c.id === activeCategory);
      if (category?.filter) {
        filtered = filtered.filter(
          (t) =>
            t.name.toLowerCase().includes(category.filter!) ||
            t.label.toLowerCase().includes(category.filter!)
        );
      }
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.label.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [settingTypes, activeCategory, searchQuery]);

  const columns: ColumnDef<SettingType>[] = useMemo(
    () => [
      {
        accessorKey: "label",
        header: "Setting",
        cell: ({ row }) => (
          <div className="max-w-md">
            <div className="font-medium">{row.original.label}</div>
            <div className="text-xs text-muted-foreground truncate">
              {row.original.name}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground max-w-sm truncate">
            {row.original.description || "No description"}
          </div>
        ),
      },
      {
        accessorKey: "datatype",
        header: "Type",
        cell: ({ row }) => (
          <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
            {row.original.datatype}
          </span>
        ),
      },
      {
        id: "value",
        header: "Current Value",
        cell: ({ row }) => {
          const setting = settings.find((s) => s.name === row.original.name);
          if (setting?.value === null || setting?.value === undefined) {
            return <span className="text-muted-foreground text-xs">Not set</span>;
          }
          if (typeof setting.value === "boolean") {
            return setting.value ? (
              <StatusBadge label="Enabled" status="success" />
            ) : (
              <StatusBadge label="Disabled" status="error" />
            );
          }
          return (
            <span className="text-xs font-mono truncate max-w-[150px] inline-block">
              {JSON.stringify(setting.value)}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditSetting(row.original)}
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        ),
      },
    ],
    [settings, handleEditSetting]
  );

  const renderValueEditor = () => {
    if (!editingSetting) return null;

    switch (editingSetting.datatype) {
      case "bool":
        return (
          <div className="flex items-center space-x-2">
            <Switch
              checked={editValue === true || editValue === "t"}
              onCheckedChange={(checked) => setEditValue(checked)}
            />
            <Label>{editValue ? "Enabled" : "Disabled"}</Label>
          </div>
        );
      case "integer":
        return (
          <Input
            type="number"
            value={editValue ?? ""}
            onChange={(e) => setEditValue(parseInt(e.target.value, 10) || null)}
            placeholder="Enter a number"
          />
        );
      case "interval":
        return (
          <Input
            value={editValue ?? ""}
            onChange={(e) => setEditValue(e.target.value || null)}
            placeholder="e.g., 7 days, 2 weeks"
          />
        );
      case "string":
      default:
        return (
          <Textarea
            value={typeof editValue === "string" ? editValue : JSON.stringify(editValue ?? "")}
            onChange={(e) => {
              try {
                setEditValue(JSON.parse(e.target.value));
              } catch {
                setEditValue(e.target.value);
              }
            }}
            placeholder="Enter value"
            rows={3}
          />
        );
    }
  };

  if (isLoading && settings.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Library Settings"
          subtitle="Configure organization unit settings."
          breadcrumbs={[
            { label: "Administration", href: "/staff/admin" },
            { label: "Settings", href: "/staff/admin/settings" },
            { label: "Library" },
          ]}
        />
        <PageContent>
          <LoadingSpinner message="Loading settings..." />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Library Settings"
        subtitle="Configure organization unit settings that control library behavior."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Settings", href: "/staff/admin/settings" },
          { label: "Library" },
        ]}
        actions={[
          { label: "Refresh", onClick: loadSettings, icon: RefreshCw },
        ]}
      />

      <PageContent className="space-y-6">
        {/* Organization Selector */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Organization
            </CardTitle>
            <CardDescription>
              Select the organization to view and edit settings for.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1 max-w-xs">
                <Label className="text-sm mb-2 block">Organization Unit</Label>
                <Select
                  value={selectedOrgId ? String(selectedOrgId) : ""}
                  onValueChange={(value) => setSelectedOrgId(parseInt(value, 10))}
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
              <div className="flex-1 max-w-sm">
                <Label className="text-sm mb-2 block">Search Settings</Label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or description..."
                    className="!pl-14"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Settings Table with Tabs */}
        <Card className="rounded-2xl" id="setting-types">
          <CardHeader className="pb-0">
            <Tabs value={activeCategory} onValueChange={setActiveCategory}>
              <TabsList>
                {CATEGORIES.map((cat) => (
                  <TabsTrigger key={cat.id} value={cat.id} className="gap-2">
                    <cat.icon className="h-4 w-4" />
                    {cat.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-4">
            <DataTable
              columns={columns}
              data={filteredSettingTypes}
              isLoading={isLoading}
              searchable={false}
              paginated={filteredSettingTypes.length > 20}
              emptyState={
                <EmptyState
                  title="No settings found"
                  description={
                    searchQuery
                      ? "No settings match your search criteria."
                      : "No settings available for this category."
                  }
                />
              }
            />
          </CardContent>
        </Card>

        {/* Currently Set Values */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Currently Configured Settings</CardTitle>
            <CardDescription>
              Settings that have been explicitly set for this organization ({settings.length} total).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settings.length === 0 ? (
              <EmptyState
                title="No explicit settings configured"
                description="This organization is inheriting settings from its parent org units."
                action={{
                  label: "Browse setting types",
                  onClick: () => document.getElementById("setting-types")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                }}
                secondaryAction={{
                  label: "Evergreen setup checklist",
                  onClick: () => window.location.assign("/staff/help#evergreen-setup"),
                }}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {settings.slice(0, 12).map((setting) => (
                  <div
                    key={setting.id}
                    className="rounded-lg border p-3 text-sm hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      const type = settingTypes.find((t) => t.name === setting.name);
                      if (type) handleEditSetting(type);
                    }}
                  >
                    <div className="font-medium truncate">{setting.label || setting.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      {typeof setting.value === "boolean" ? (
                        setting.value ? (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <Check className="h-3 w-3" /> Enabled
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600">
                            <X className="h-3 w-3" /> Disabled
                          </span>
                        )
                      ) : (
                        <span className="font-mono truncate">
                          {JSON.stringify(setting.value).slice(0, 30)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>

      {/* Edit Setting Dialog */}
      <Dialog open={!!editingSetting} onOpenChange={() => setEditingSetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Setting</DialogTitle>
            <DialogDescription>
              {editingSetting?.label || editingSetting?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">
              {editingSetting?.description || "No description available."}
            </div>
            <div className="space-y-2">
              <Label>Value ({editingSetting?.datatype})</Label>
              {renderValueEditor()}
            </div>
            <div className="text-xs text-muted-foreground">
              Setting name: <code className="bg-muted px-1 rounded">{editingSetting?.name}</code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSetting(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSetting} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
