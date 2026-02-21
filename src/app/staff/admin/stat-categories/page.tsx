"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";

import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  DeleteConfirmDialog,
  SetupRequired,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, ClipboardList, Eye, EyeOff, Plus, RefreshCw, Trash2, Pencil } from "lucide-react";

type StatKind = "copy" | "patron";

type CopyCategory = {
  id: number;
  name: string;
  ownerId: number | null;
  ownerName: string | null;
  opacVisible: boolean;
  required: boolean;
  checkoutArchive: boolean;
  entryCount: number;
};

type PatronCategory = CopyCategory & {
  allowFreetext: boolean;
  usrSummary: boolean;
};

type StatEntry = {
  id: number;
  statCatId: number | null;
  value: string;
  ownerId: number | null;
  ownerName: string | null;
};

type PermissionMap = Record<string, boolean>;

function safeInt(value: string): number | null {
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

export default function StatCategoriesPage() {
  const { orgs, user, getOrgName } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<StatKind>("copy");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copyCategories, setCopyCategories] = useState<CopyCategory[]>([]);
  const [patronCategories, setPatronCategories] = useState<PatronCategory[]>([]);
  const [permissions, setPermissions] = useState<PermissionMap>({});

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CopyCategory | PatronCategory | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    ownerId: "",
    opacVisible: false,
    required: false,
    checkoutArchive: false,
    allowFreetext: false,
    usrSummary: false,
  });

  const [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<{ kind: StatKind; id: number; name: string } | null>(null);
  const [deletingCategory, setDeletingCategory] = useState(false);

  const [entriesOpen, setEntriesOpen] = useState(false);
  const [entriesKind, setEntriesKind] = useState<StatKind>("copy");
  const [entriesCategory, setEntriesCategory] = useState<CopyCategory | PatronCategory | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [entries, setEntries] = useState<StatEntry[]>([]);

  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<StatEntry | null>(null);
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryForm, setEntryForm] = useState({
    value: "",
    ownerId: "",
  });

  const [deleteEntryOpen, setDeleteEntryOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<StatEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);

  async function loadCategories() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/evergreen/stat-categories", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || `HTTP ${res.status}`);
      setCopyCategories(Array.isArray(json.copyCategories) ? json.copyCategories : []);
      setPatronCategories(Array.isArray(json.patronCategories) ? json.patronCategories : []);
      setPermissions((json.permissions || {}) as PermissionMap);
    } catch (e: any) {
      setError(e instanceof Error ? (e as Error).message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  const stats = useMemo(() => {
    return {
      copy: copyCategories.length,
      patron: patronCategories.length,
    };
  }, [copyCategories, patronCategories]);

  const perm = (code: string) => permissions[code] === true;

  const canCreateCategory = (kind: StatKind) =>
    perm(kind === "copy" ? "CREATE_COPY_STAT_CAT" : "CREATE_PATRON_STAT_CAT");
  const canUpdateCategory = (kind: StatKind) =>
    perm(kind === "copy" ? "UPDATE_COPY_STAT_CAT" : "UPDATE_PATRON_STAT_CAT");
  const canDeleteCategory = (kind: StatKind) =>
    perm(kind === "copy" ? "DELETE_COPY_STAT_CAT" : "DELETE_PATRON_STAT_CAT");
  const canCreateEntry = (kind: StatKind) =>
    perm(kind === "copy" ? "CREATE_COPY_STAT_CAT_ENTRY" : "CREATE_PATRON_STAT_CAT_ENTRY");
  const canUpdateEntry = (kind: StatKind) =>
    perm(kind === "copy" ? "UPDATE_COPY_STAT_CAT_ENTRY" : "UPDATE_PATRON_STAT_CAT_ENTRY");
  const canDeleteEntry = (kind: StatKind) =>
    perm(kind === "copy" ? "DELETE_COPY_STAT_CAT_ENTRY" : "DELETE_PATRON_STAT_CAT_ENTRY");

  function openCreateCategory(kind: StatKind) {
    setActiveTab(kind);
    setEditingCategory(null);
    setCategoryForm({
      name: "",
      ownerId: String(user?.activeOrgId || orgs[0]?.id || ""),
      opacVisible: false,
      required: false,
      checkoutArchive: false,
      allowFreetext: false,
      usrSummary: false,
    });
    setCategoryDialogOpen(true);
  }

  function openEditCategory(kind: StatKind, cat: CopyCategory | PatronCategory) {
    setActiveTab(kind);
    setEditingCategory(cat);
    setCategoryForm({
      name: cat.name,
      ownerId: String(cat.ownerId ?? user?.activeOrgId ?? orgs[0]?.id ?? ""),
      opacVisible: cat.opacVisible,
      required: cat.required,
      checkoutArchive: cat.checkoutArchive,
      allowFreetext: (cat as PatronCategory).allowFreetext ?? false,
      usrSummary: (cat as PatronCategory).usrSummary ?? false,
    });
    setCategoryDialogOpen(true);
  }

  async function saveCategory() {
    const kind = activeTab;
    if (!categoryForm.name.trim()) return toast.error("Name is required");
    const ownerId = safeInt(categoryForm.ownerId);
    if (!ownerId) return toast.error("Owner is required");

    setCategorySaving(true);
    try {
      const res = await fetch("/api/evergreen/stat-categories", {
        method: editingCategory ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          ...(editingCategory ? { id: editingCategory.id } : {}),
          name: categoryForm.name.trim(),
          ownerId,
          opacVisible: categoryForm.opacVisible,
          required: categoryForm.required,
          checkoutArchive: categoryForm.checkoutArchive,
          ...(kind === "patron"
            ? { allowFreetext: categoryForm.allowFreetext, usrSummary: categoryForm.usrSummary }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Save failed");
      toast.success(editingCategory ? "Category updated" : "Category created");
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      await loadCategories();
    } catch (e: any) {
      toast.error(e instanceof Error ? (e as Error).message : "Save failed");
    } finally {
      setCategorySaving(false);
    }
  }

  function requestDeleteCategory(kind: StatKind, cat: CopyCategory | PatronCategory) {
    setCategoryToDelete({ kind, id: cat.id, name: cat.name });
    setDeleteCategoryOpen(true);
  }

  async function confirmDeleteCategory() {
    if (!categoryToDelete) return;
    setDeletingCategory(true);
    try {
      const res = await fetch("/api/evergreen/stat-categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: categoryToDelete.kind, id: categoryToDelete.id }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Delete failed");
      toast.success("Category deleted");
      setDeleteCategoryOpen(false);
      setCategoryToDelete(null);
      await loadCategories();
    } catch (e: any) {
      toast.error(e instanceof Error ? (e as Error).message : "Delete failed");
    } finally {
      setDeletingCategory(false);
    }
  }

  async function loadEntries(kind: StatKind, statCatId: number) {
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const res = await fetch(
        `/api/evergreen/stat-categories/entries?kind=${encodeURIComponent(kind)}&statCatId=${encodeURIComponent(
          String(statCatId)
        )}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || `HTTP ${res.status}`);
      setEntries(Array.isArray(json.entries) ? json.entries : []);
    } catch (e: any) {
      setEntriesError(e instanceof Error ? (e as Error).message : String(e));
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }

  function openEntries(kind: StatKind, cat: CopyCategory | PatronCategory) {
    setEntriesKind(kind);
    setEntriesCategory(cat);
    setEntriesOpen(true);
    void loadEntries(kind, cat.id);
  }

  function openCreateEntry() {
    if (!entriesCategory) return;
    setEditingEntry(null);
    setEntryForm({
      value: "",
      ownerId: String(entriesCategory.ownerId ?? user?.activeOrgId ?? orgs[0]?.id ?? ""),
    });
    setEntryDialogOpen(true);
  }

  function openEditEntry(e: StatEntry) {
    setEditingEntry(e);
    setEntryForm({
      value: e.value,
      ownerId: String(e.ownerId ?? entriesCategory?.ownerId ?? user?.activeOrgId ?? orgs[0]?.id ?? ""),
    });
    setEntryDialogOpen(true);
  }

  async function saveEntry() {
    if (!entriesCategory) return;
    if (!entryForm.value.trim()) return toast.error("Value is required");
    const ownerId = safeInt(entryForm.ownerId);
    if (!ownerId) return toast.error("Owner is required");

    setEntrySaving(true);
    try {
      const res = await fetch("/api/evergreen/stat-categories/entries", {
        method: editingEntry ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: entriesKind,
          ...(editingEntry ? { id: editingEntry.id } : { statCatId: entriesCategory.id }),
          value: entryForm.value.trim(),
          ownerId,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Save failed");
      toast.success(editingEntry ? "Entry updated" : "Entry created");
      setEntryDialogOpen(false);
      setEditingEntry(null);
      await loadEntries(entriesKind, entriesCategory.id);
      await loadCategories();
    } catch (e: any) {
      toast.error(e instanceof Error ? (e as Error).message : "Save failed");
    } finally {
      setEntrySaving(false);
    }
  }

  function requestDeleteEntry(e: StatEntry) {
    setEntryToDelete(e);
    setDeleteEntryOpen(true);
  }

  async function confirmDeleteEntry() {
    if (!entryToDelete) return;
    setDeletingEntry(true);
    try {
      const res = await fetch("/api/evergreen/stat-categories/entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: entriesKind, id: entryToDelete.id }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Delete failed");
      toast.success("Entry deleted");
      setDeleteEntryOpen(false);
      setEntryToDelete(null);
      if (entriesCategory) {
        await loadEntries(entriesKind, entriesCategory.id);
        await loadCategories();
      }
    } catch (e: any) {
      toast.error(e instanceof Error ? (e as Error).message : "Delete failed");
    } finally {
      setDeletingEntry(false);
    }
  }

  const copyColumns: ColumnDef<CopyCategory>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.entryCount} entries</div>
        </div>
      ),
    },
    {
      accessorKey: "ownerName",
      header: "Owner",
      cell: ({ row }) => {
        const ownerId = row.original.ownerId;
        const label = row.original.ownerName || (typeof ownerId === "number" ? getOrgName(ownerId) : "—");
        return (
          <Badge variant="secondary" className="rounded-full">
            {label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "opacVisible",
      header: "OPAC",
      cell: ({ row }) =>
        row.original.opacVisible ? (
          <Badge variant="secondary" className="rounded-full gap-1">
            <Eye className="h-3 w-3" />
            Visible
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-full gap-1 text-muted-foreground">
            <EyeOff className="h-3 w-3" />
            Hidden
          </Badge>
        ),
    },
    {
      accessorKey: "required",
      header: "Required",
      cell: ({ row }) =>
        row.original.required ? (
          <Badge variant="secondary" className="rounded-full">
            Yes
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const cat = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openEntries("copy", cat)} aria-label="Manage entries">
              <ClipboardList className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canUpdateCategory("copy")}
              onClick={() => openEditCategory("copy", cat)}
              aria-label="Edit category"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canDeleteCategory("copy")}
              onClick={() => requestDeleteCategory("copy", cat)}
              aria-label="Delete category"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const patronColumns: ColumnDef<PatronCategory>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.entryCount} entries</div>
        </div>
      ),
    },
    {
      accessorKey: "ownerName",
      header: "Owner",
      cell: ({ row }) => {
        const ownerId = row.original.ownerId;
        const label = row.original.ownerName || (typeof ownerId === "number" ? getOrgName(ownerId) : "—");
        return (
          <Badge variant="secondary" className="rounded-full">
            {label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "allowFreetext",
      header: "Free text",
      cell: ({ row }) =>
        row.original.allowFreetext ? (
          <Badge variant="secondary" className="rounded-full">
            Allowed
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "usrSummary",
      header: "Summary",
      cell: ({ row }) =>
        row.original.usrSummary ? (
          <Badge variant="secondary" className="rounded-full">
            Yes
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const cat = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openEntries("patron", cat)} aria-label="Manage entries">
              <ClipboardList className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canUpdateCategory("patron")}
              onClick={() => openEditCategory("patron", cat)}
              aria-label="Edit category"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canDeleteCategory("patron")}
              onClick={() => requestDeleteCategory("patron", cat)}
              aria-label="Delete category"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const entryColumns: ColumnDef<StatEntry>[] = [
    {
      accessorKey: "value",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Entry" />,
      cell: ({ row }) => <span className="font-medium">{row.original.value}</span>,
    },
    {
      accessorKey: "ownerName",
      header: "Owner",
      cell: ({ row }) => {
        const ownerId = row.original.ownerId;
        const label = row.original.ownerName || (typeof ownerId === "number" ? getOrgName(ownerId) : "—");
        return (
          <Badge variant="secondary" className="rounded-full">
            {label}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canUpdateEntry(entriesKind)}
              onClick={() => openEditEntry(e)}
              aria-label="Edit entry"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canDeleteEntry(entriesKind)}
              onClick={() => requestDeleteEntry(e)}
              aria-label="Delete entry"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Statistical Categories"
        subtitle="Copy + patron stat cats (Evergreen-backed)"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Statistical Categories" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadCategories()} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Badge variant="secondary" className="rounded-full">
            {stats.copy} copy cats
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {stats.patron} patron cats
          </Badge>
        </div>
      </PageHeader>

      <PageContent className="space-y-4">
        {error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base">Statistical Categories failed to load</CardTitle>
              <CardDescription className="text-destructive">{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => void loadCategories()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">About stat cats</CardTitle>
              <CardDescription>Structured categories for copy and patron metadata.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Stat cats are used for reporting and workflows where you need controlled values (like “Program” or
                “Collection type”).
              </p>
              <p className="text-xs text-muted-foreground">
                Copy perms: <span className="font-mono">CREATE_COPY_STAT_CAT</span> +{" "}
                <span className="font-mono">CREATE_COPY_STAT_CAT_ENTRY</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Patron perms: <span className="font-mono">CREATE_PATRON_STAT_CAT</span> +{" "}
                <span className="font-mono">CREATE_PATRON_STAT_CAT_ENTRY</span>
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Manage</CardTitle>
              <CardDescription>Create categories, then add entries for each category.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="copy" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Copy stat cats
                  </TabsTrigger>
                  <TabsTrigger value="patron" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Patron stat cats
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="copy" className="mt-4">
                  <DataTable
                    columns={copyColumns}
                    data={copyCategories}
                    isLoading={loading}
                    searchPlaceholder="Search copy stat cats..."
                    toolbar={
                      <Button onClick={() => openCreateCategory("copy")} disabled={!canCreateCategory("copy")}>
                        <Plus className="h-4 w-4 mr-2" />
                        New copy category
                      </Button>
                    }
                    emptyState={
                      <EmptyState
                        icon={BarChart3}
                        title="No copy stat categories"
                        description="Create a copy stat category and add entry values."
                        action={
                          canCreateCategory("copy")
                            ? { label: "Create copy category", onClick: () => openCreateCategory("copy"), icon: Plus }
                            : undefined
                        }
                      >
                        <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
                          Seed demo data
                        </Button>
                      </EmptyState>
                    }
                  />
                </TabsContent>

                <TabsContent value="patron" className="mt-4">
                  <DataTable
                    columns={patronColumns}
                    data={patronCategories}
                    isLoading={loading}
                    searchPlaceholder="Search patron stat cats..."
                    toolbar={
                      <Button onClick={() => openCreateCategory("patron")} disabled={!canCreateCategory("patron")}>
                        <Plus className="h-4 w-4 mr-2" />
                        New patron category
                      </Button>
                    }
                    emptyState={
                      <EmptyState
                        icon={BarChart3}
                        title="No patron stat categories"
                        description="Create a patron stat category and add entry values."
                        action={
                          canCreateCategory("patron")
                            ? {
                                label: "Create patron category",
                                onClick: () => openCreateCategory("patron"),
                                icon: Plus,
                              }
                            : undefined
                        }
                      >
                        <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
                          Seed demo data
                        </Button>
                      </EmptyState>
                    }
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "Edit stat category" : `New ${activeTab === "copy" ? "copy" : "patron"} stat category`}
              </DialogTitle>
              <DialogDescription>Categories define a controlled value list used in reporting and workflows.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Program"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="owner">Owner</Label>
                <Select id="owner"
                  value={categoryForm.ownerId}
                  onValueChange={(v) => setCategoryForm((p) => ({ ...p, ownerId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a library" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={`cat-owner-${o.id}`} value={String(o.id)}>
                        {o.shortname} — {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">OPAC visible</div>
                    <div className="text-xs text-muted-foreground">Show to patrons.</div>
                  </div>
                  <Switch
                    checked={categoryForm.opacVisible}
                    onCheckedChange={(v) => setCategoryForm((p) => ({ ...p, opacVisible: v }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">Required</div>
                    <div className="text-xs text-muted-foreground">Enforce value.</div>
                  </div>
                  <Switch
                    checked={categoryForm.required}
                    onCheckedChange={(v) => setCategoryForm((p) => ({ ...p, required: v }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">Archive</div>
                    <div className="text-xs text-muted-foreground">Checkout archive.</div>
                  </div>
                  <Switch
                    checked={categoryForm.checkoutArchive}
                    onCheckedChange={(v) => setCategoryForm((p) => ({ ...p, checkoutArchive: v }))}
                  />
                </div>
              </div>

              {activeTab === "patron" ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium">Allow free text</div>
                      <div className="text-xs text-muted-foreground">Permit non-listed values.</div>
                    </div>
                    <Switch
                      checked={categoryForm.allowFreetext}
                      onCheckedChange={(v) => setCategoryForm((p) => ({ ...p, allowFreetext: v }))}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium">User summary</div>
                      <div className="text-xs text-muted-foreground">Show in patron summary.</div>
                    </div>
                    <Switch
                      checked={categoryForm.usrSummary}
                      onCheckedChange={(v) => setCategoryForm((p) => ({ ...p, usrSummary: v }))}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCategoryDialogOpen(false)} disabled={categorySaving}>
                Cancel
              </Button>
              <Button
                onClick={() => void saveCategory()}
                disabled={
                  categorySaving ||
                  !(editingCategory ? canUpdateCategory(activeTab) : canCreateCategory(activeTab))
                }
              >
                {categorySaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={entriesOpen} onOpenChange={setEntriesOpen}>
          <DialogContent className="sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle>{entriesCategory ? `Entries: ${entriesCategory.name}` : "Entries"}</DialogTitle>
              <DialogDescription>
                {entriesKind === "copy" ? "Copy stat cat entries" : "Patron stat cat entries"}
              </DialogDescription>
            </DialogHeader>

            {entriesCategory ? (
              <div className="space-y-3">
                {entriesError ? (
                  <SetupRequired
                    module="Stat cat entries"
                    description={entriesError}
                    setupSteps={["Verify Evergreen permissions and that the stat cat exists.", "Try refresh."]}
                    adminUrl="/staff/admin/stat-categories"
                  />
                ) : null}

                <DataTable
                  columns={entryColumns}
                  data={entries}
                  isLoading={entriesLoading}
                  searchPlaceholder="Search entries..."
                  toolbar={
                    <Button onClick={openCreateEntry} disabled={!canCreateEntry(entriesKind)}>
                      <Plus className="h-4 w-4 mr-2" />
                      New entry
                    </Button>
                  }
                  emptyState={
                    <EmptyState
                      icon={ClipboardList}
                      title="No entries"
                      description="Create an entry value for this category."
                      action={
                        canCreateEntry(entriesKind) ? { label: "Create entry", onClick: openCreateEntry, icon: Plus } : undefined
                      }
                    />
                  }
                />
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEntriesOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{editingEntry ? "Edit entry" : "New entry"}</DialogTitle>
              <DialogDescription>Entry values are the controlled options for this category.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="entry-value">Value</Label>
                <Input
                  id="entry-value"
                  value={entryForm.value}
                  onChange={(e) => setEntryForm((p) => ({ ...p, value: e.target.value }))}
                  placeholder="Adult"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="owner-2">Owner</Label>
                <Select id="owner-2" value={entryForm.ownerId} onValueChange={(v) => setEntryForm((p) => ({ ...p, ownerId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a library" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={`entry-owner-${o.id}`} value={String(o.id)}>
                        {o.shortname} — {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEntryDialogOpen(false)} disabled={entrySaving}>
                Cancel
              </Button>
              <Button
                onClick={() => void saveEntry()}
                disabled={
                  entrySaving ||
                  !(editingEntry ? canUpdateEntry(entriesKind) : canCreateEntry(entriesKind))
                }
              >
                {entrySaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DeleteConfirmDialog
          open={deleteCategoryOpen}
          onOpenChange={setDeleteCategoryOpen}
          itemName={categoryToDelete ? `category ${categoryToDelete.name}` : "category"}
          onConfirm={confirmDeleteCategory}
          isLoading={deletingCategory}
        />

        <DeleteConfirmDialog
          open={deleteEntryOpen}
          onOpenChange={setDeleteEntryOpen}
          itemName={entryToDelete ? `entry ${entryToDelete.value}` : "entry"}
          onConfirm={confirmDeleteEntry}
          isLoading={deletingEntry}
        />
      </PageContent>
    </PageContainer>
  );
}
