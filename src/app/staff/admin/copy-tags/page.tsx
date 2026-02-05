"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { featureFlags } from "@/lib/feature-flags";

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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Eye, EyeOff, Link2, Plus, RefreshCw, Tag, Tags, Trash2, Pencil } from "lucide-react";

type TagType = {
  code: string;
  label: string;
  ownerId: number | null;
  ownerName: string | null;
};

type CopyTag = {
  id: number;
  tagType: string;
  tagTypeLabel: string | null;
  label: string;
  value: string;
  staffNote: string | null;
  pub: boolean;
  ownerId: number | null;
  ownerName: string | null;
  url: string | null;
};

type TypePermissions = {
  ADMIN_COPY_TAG_TYPES?: boolean;
};

type TagPermissions = {
  ADMIN_COPY_TAG?: boolean;
};

function safeInt(value: string): number | null {
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : null;
}

export default function CopyTagsPage() {
  const router = useRouter();
  const { orgs, user, getOrgName } = useAuth();

  const [activeTab, setActiveTab] = useState<"tags" | "types">("tags");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tagTypes, setTagTypes] = useState<TagType[]>([]);
  const [tags, setTags] = useState<CopyTag[]>([]);
  const [typePermissions, setTypePermissions] = useState<TypePermissions>({});
  const [tagPermissions, setTagPermissions] = useState<TagPermissions>({});

  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<TagType | null>(null);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeForm, setTypeForm] = useState({
    code: "",
    label: "",
    ownerId: "",
  });

  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<CopyTag | null>(null);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagForm, setTagForm] = useState({
    id: 0,
    tagType: "",
    label: "",
    value: "",
    pub: false,
    ownerId: "",
    staffNote: "",
    url: "",
  });

  const [deleteTypeOpen, setDeleteTypeOpen] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<TagType | null>(null);
  const [deletingType, setDeletingType] = useState(false);

  const [deleteTagOpen, setDeleteTagOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<CopyTag | null>(null);
  const [deletingTag, setDeletingTag] = useState(false);

  const canManageTypes = typePermissions.ADMIN_COPY_TAG_TYPES === true;
  const canManageTags = tagPermissions.ADMIN_COPY_TAG === true;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [typesRes, tagsRes] = await Promise.all([
        fetch("/api/evergreen/copy-tags/types", { cache: "no-store" }),
        fetch("/api/evergreen/copy-tags", { cache: "no-store" }),
      ]);
      const [typesJson, tagsJson] = await Promise.all([typesRes.json(), tagsRes.json()]);

      if (!typesRes.ok || typesJson?.ok !== true) {
        throw new Error(typesJson?.error || `HTTP ${typesRes.status}`);
      }
      if (!tagsRes.ok || tagsJson?.ok !== true) {
        throw new Error(tagsJson?.error || `HTTP ${tagsRes.status}`);
      }

      setTagTypes(Array.isArray(typesJson.tagTypes) ? typesJson.tagTypes : []);
      setTags(Array.isArray(tagsJson.tags) ? tagsJson.tags : []);
      setTypePermissions((typesJson.permissions || {}) as TypePermissions);
      setTagPermissions((tagsJson.permissions || {}) as TagPermissions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const publicCount = tags.filter((t) => t.pub).length;
    return {
      tagTypes: tagTypes.length,
      tags: tags.length,
      publicTags: publicCount,
    };
  }, [tagTypes, tags]);

  const typeColumns: ColumnDef<TagType>[] = [
    {
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      accessorKey: "label",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Label" />,
      cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
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
        const t = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canManageTypes}
              onClick={() => openEditType(t)}
              aria-label={`Edit tag type ${t.code}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canManageTypes}
              onClick={() => requestDeleteType(t)}
              aria-label={`Delete tag type ${t.code}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const tagColumns: ColumnDef<CopyTag>[] = [
    {
      accessorKey: "label",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tag" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.label}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.original.value}</div>
        </div>
      ),
    },
    {
      accessorKey: "tagType",
      header: "Type",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="text-sm">{row.original.tagTypeLabel || row.original.tagType}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.original.tagType}</div>
        </div>
      ),
    },
    {
      accessorKey: "pub",
      header: "OPAC",
      cell: ({ row }) =>
        row.original.pub ? (
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
      accessorKey: "url",
      header: "Link",
      cell: ({ row }) =>
        row.original.url ? (
          <a
            href={row.original.url}
            className="inline-flex items-center gap-1 text-sm underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            <Link2 className="h-4 w-4" />
            Open
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canManageTags}
              onClick={() => openEditTag(t)}
              aria-label={`Edit tag ${t.label}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canManageTags}
              onClick={() => requestDeleteTag(t)}
              aria-label={`Delete tag ${t.label}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  function openCreateType() {
    setEditingType(null);
    setTypeForm({
      code: "",
      label: "",
      ownerId: String(user?.activeOrgId || orgs[0]?.id || ""),
    });
    setTypeDialogOpen(true);
  }

  function openEditType(t: TagType) {
    setEditingType(t);
    setTypeForm({
      code: t.code,
      label: t.label,
      ownerId: String(t.ownerId ?? user?.activeOrgId ?? orgs[0]?.id ?? ""),
    });
    setTypeDialogOpen(true);
  }

  async function saveType() {
    if (!typeForm.code.trim()) return toast.error("Code is required");
    if (!typeForm.label.trim()) return toast.error("Label is required");
    const ownerId = safeInt(typeForm.ownerId);
    if (!ownerId) return toast.error("Owner is required");

    setTypeSaving(true);
    try {
      const res = await fetch("/api/evergreen/copy-tags/types", {
        method: editingType ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: typeForm.code.trim(),
          label: typeForm.label.trim(),
          ownerId,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Save failed");
      toast.success(editingType ? "Tag type updated" : "Tag type created");
      setTypeDialogOpen(false);
      setEditingType(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setTypeSaving(false);
    }
  }

  function requestDeleteType(t: TagType) {
    setTypeToDelete(t);
    setDeleteTypeOpen(true);
  }

  async function confirmDeleteType() {
    if (!typeToDelete) return;
    setDeletingType(true);
    try {
      const res = await fetch("/api/evergreen/copy-tags/types", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: typeToDelete.code }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Delete failed");
      toast.success("Tag type deleted");
      setDeleteTypeOpen(false);
      setTypeToDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingType(false);
    }
  }

  function openCreateTag() {
    setEditingTag(null);
    const defaultType = tagTypes[0]?.code || "";
    setTagForm({
      id: 0,
      tagType: defaultType,
      label: "",
      value: "",
      pub: false,
      ownerId: String(user?.activeOrgId || orgs[0]?.id || ""),
      staffNote: "",
      url: "",
    });
    setTagDialogOpen(true);
  }

  function openEditTag(t: CopyTag) {
    setEditingTag(t);
    setTagForm({
      id: t.id,
      tagType: t.tagType,
      label: t.label,
      value: t.value,
      pub: t.pub,
      ownerId: String(t.ownerId ?? user?.activeOrgId ?? orgs[0]?.id ?? ""),
      staffNote: t.staffNote || "",
      url: t.url || "",
    });
    setTagDialogOpen(true);
  }

  async function saveTag() {
    if (!tagForm.tagType.trim()) return toast.error("Tag type is required");
    if (!tagForm.label.trim()) return toast.error("Label is required");
    if (!tagForm.value.trim()) return toast.error("Value is required");
    const ownerId = safeInt(tagForm.ownerId);
    if (!ownerId) return toast.error("Owner is required");

    setTagSaving(true);
    try {
      const res = await fetch("/api/evergreen/copy-tags", {
        method: editingTag ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingTag ? { id: tagForm.id } : {}),
          tagType: tagForm.tagType.trim(),
          label: tagForm.label.trim(),
          value: tagForm.value.trim(),
          pub: tagForm.pub,
          ownerId,
          staffNote: tagForm.staffNote.trim() || undefined,
          url: tagForm.url.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Save failed");
      toast.success(editingTag ? "Tag updated" : "Tag created");
      setTagDialogOpen(false);
      setEditingTag(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setTagSaving(false);
    }
  }

  function requestDeleteTag(t: CopyTag) {
    setTagToDelete(t);
    setDeleteTagOpen(true);
  }

  async function confirmDeleteTag() {
    if (!tagToDelete) return;
    setDeletingTag(true);
    try {
      const res = await fetch("/api/evergreen/copy-tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tagToDelete.id }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Delete failed");
      toast.success("Tag deleted");
      setDeleteTagOpen(false);
      setTagToDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingTag(false);
    }
  }

  if (!featureFlags.copyTags) {
    return (
      <PageContainer>
        <PageHeader
          title="Copy Tags"
          subtitle="Digital bookplates and item labels"
          breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Copy Tags" }]}
        />
        <PageContent>
          <Card>
            <CardContent className="pt-10 pb-10">
              <EmptyState
                icon={Tag}
                title="Feature not enabled"
                description="Copy Tags is disabled by default. Enable experimental modules on this install to use Copy Tags."
                action={{ label: "Open setup guide", onClick: () => router.push("/staff/help#evergreen-setup") }}
                secondaryAction={{ label: "Open Admin hub", onClick: () => router.push("/staff/admin") }}
              />
            </CardContent>
          </Card>
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Copy Tags"
        subtitle="Digital bookplates and item labels (Evergreen-backed)"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Copy Tags" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Badge variant="secondary" className="rounded-full">
            {stats.tagTypes} types
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {stats.tags} tags
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {stats.publicTags} public
          </Badge>
        </div>
      </PageHeader>

      <PageContent className="space-y-4">
        {error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base">Copy Tags failed to load</CardTitle>
              <CardDescription className="text-destructive">{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What are Copy Tags?</CardTitle>
              <CardDescription>Reusable labels attached to items (Evergreen asset.copy_tag).</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Use Copy Tags for digital bookplates, local labels, or short descriptors that travel with the copy.</p>
              <p className="text-xs text-muted-foreground">
                Permissions: <span className="font-mono">ADMIN_COPY_TAG</span> and{" "}
                <span className="font-mono">ADMIN_COPY_TAG_TYPES</span>.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Manage</CardTitle>
              <CardDescription>Create tag types first, then create tags.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="tags" className="gap-2">
                    <Tags className="h-4 w-4" />
                    Tags
                  </TabsTrigger>
                  <TabsTrigger value="types" className="gap-2">
                    <Tag className="h-4 w-4" />
                    Tag Types
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tags" className="mt-4">
                  {tagTypes.length === 0 ? (
                    <SetupRequired
                      module="Copy Tags"
                      description="No tag types exist yet. Create a tag type first (for example: BOOKPLATE, LOCAL, DONOR)."
                      setupSteps={[
                        "Create a tag type (code + label + owning org)",
                        "Create tags within that type",
                        "Optionally mark tags as OPAC-visible",
                      ]}
                      adminUrl="/staff/admin/copy-tags"
                    />
                  ) : (
                    <DataTable
                      columns={tagColumns}
                      data={tags}
                      isLoading={loading}
                      searchPlaceholder="Search tags..."
                      toolbar={
                        <Button onClick={openCreateTag} disabled={!canManageTags}>
                          <Plus className="h-4 w-4 mr-2" />
                          New Tag
                        </Button>
                      }
                      emptyState={
                        <EmptyState
                          icon={Tags}
                          title="No tags yet"
                          description="Create your first tag and start attaching it to items."
                          action={
                            canManageTags ? { label: "Create tag", onClick: openCreateTag, icon: Plus } : undefined
                          }
                          secondaryAction={{ label: "Create tag type", onClick: openCreateType }}
                        >
                          <Button variant="ghost" size="sm" onClick={() => router.push("/staff/help#demo-data")}>
                            Seed demo data
                          </Button>
                        </EmptyState>
                      }
                    />
                  )}
                </TabsContent>

                <TabsContent value="types" className="mt-4">
                  <DataTable
                    columns={typeColumns}
                    data={tagTypes}
                    isLoading={loading}
                    searchPlaceholder="Search tag types..."
                    toolbar={
                      <Button onClick={openCreateType} disabled={!canManageTypes}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Type
                      </Button>
                    }
                    emptyState={
                      <EmptyState
                        icon={Tag}
                        title="No tag types"
                        description="Tag types categorize your tags (e.g. BOOKPLATE, DONOR, LOCAL)."
                        action={
                          canManageTypes
                            ? { label: "Create tag type", onClick: openCreateType, icon: Plus }
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

        <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{editingType ? "Edit tag type" : "New tag type"}</DialogTitle>
              <DialogDescription>Tag types define a namespace for tags.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="type-code">Code</Label>
                <Input
                  id="type-code"
                  value={typeForm.code}
                  onChange={(e) => setTypeForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  disabled={!!editingType}
                  placeholder="BOOKPLATE"
                />
                <p className="text-xs text-muted-foreground">Uppercase short code used as the primary key.</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="type-label">Label</Label>
                <Input
                  id="type-label"
                  value={typeForm.label}
                  onChange={(e) => setTypeForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Bookplates"
                />
              </div>

              <div className="grid gap-2">
                <Label>Owner</Label>
                <Select value={typeForm.ownerId} onValueChange={(v) => setTypeForm((p) => ({ ...p, ownerId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a library" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={`type-owner-${o.id}`} value={String(o.id)}>
                        {o.shortname} — {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTypeDialogOpen(false)} disabled={typeSaving}>
                Cancel
              </Button>
              <Button onClick={() => void saveType()} disabled={typeSaving || !canManageTypes}>
                {typeSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>{editingTag ? "Edit tag" : "New tag"}</DialogTitle>
              <DialogDescription>Create reusable tags you can attach to item records.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Tag type</Label>
                <Select value={tagForm.tagType} onValueChange={(v) => setTagForm((p) => ({ ...p, tagType: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tag type" />
                  </SelectTrigger>
                  <SelectContent>
                    {tagTypes.map((t) => (
                      <SelectItem key={`tag-type-${t.code}`} value={t.code}>
                        {t.label} ({t.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="tag-label">Label</Label>
                  <Input
                    id="tag-label"
                    value={tagForm.label}
                    onChange={(e) => setTagForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder="Donor: Friends of the Library"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tag-value">Value</Label>
                  <Input
                    id="tag-value"
                    value={tagForm.value}
                    onChange={(e) => setTagForm((p) => ({ ...p, value: e.target.value }))}
                    placeholder="FOL-2026"
                  />
                  <p className="text-xs text-muted-foreground">Value is what Evergreen stores and reports on.</p>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Owner</Label>
                <Select value={tagForm.ownerId} onValueChange={(v) => setTagForm((p) => ({ ...p, ownerId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a library" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={`tag-owner-${o.id}`} value={String(o.id)}>
                        {o.shortname} — {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">Visible in OPAC</div>
                  <div className="text-xs text-muted-foreground">Allow patrons to see this tag.</div>
                </div>
                <Switch checked={tagForm.pub} onCheckedChange={(v) => setTagForm((p) => ({ ...p, pub: v }))} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tag-url">Link (optional)</Label>
                <Input
                  id="tag-url"
                  value={tagForm.url}
                  onChange={(e) => setTagForm((p) => ({ ...p, url: e.target.value }))}
                  placeholder="https://example.org/donor"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tag-note">Staff note (optional)</Label>
                <Textarea
                  id="tag-note"
                  value={tagForm.staffNote}
                  onChange={(e) => setTagForm((p) => ({ ...p, staffNote: e.target.value }))}
                  placeholder="Internal note about usage or provenance"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTagDialogOpen(false)} disabled={tagSaving}>
                Cancel
              </Button>
              <Button onClick={() => void saveTag()} disabled={tagSaving || !canManageTags}>
                {tagSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DeleteConfirmDialog
          open={deleteTypeOpen}
          onOpenChange={setDeleteTypeOpen}
          itemName={typeToDelete ? `tag type ${typeToDelete.code}` : "tag type"}
          onConfirm={confirmDeleteType}
          isLoading={deletingType}
        />

        <DeleteConfirmDialog
          open={deleteTagOpen}
          onOpenChange={setDeleteTagOpen}
          itemName={tagToDelete ? `tag ${tagToDelete.label}` : "tag"}
          onConfirm={confirmDeleteTag}
          isLoading={deletingTag}
        />
      </PageContent>
    </PageContainer>
  );
}
