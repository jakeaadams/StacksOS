"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  ErrorMessage,
  DeleteConfirmDialog,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, RefreshCw, Settings, Trash2, Pencil, Package } from "lucide-react";

type CopyTemplate = {
  id: number;
  name: string;
  owningLib: number;
  owningLibName: string | null;
  status: number | null;
  statusName: string | null;
  location: number | null;
  locationName: string | null;
  circModifier: string | null;
  holdable: boolean;
  circulate: boolean;
  opacVisible: boolean;
  ref: boolean;
  price: number | null;
};

type StatusRow = { id: number; name: string };
type LocationRow = { id: number; name: string; owningLib: number };
type CircModifierRow = { code: string; name: string; description?: string };

function safeInt(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function safeFloat(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function CopyTemplatesPage() {
  const router = useRouter();
  const { user, orgs } = useAuth();

  const defaultOrgId = user?.activeOrgId ?? user?.homeLibraryId ?? orgs[0]?.id ?? 1;
  const [orgId, setOrgId] = useState<number>(defaultOrgId);

  const [templates, setTemplates] = useState<CopyTemplate[]>([]);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [circModifiers, setCircModifiers] = useState<CircModifierRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CopyTemplate | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CopyTemplate | null>(null);

  const [form, setForm] = useState({
    name: "",
    owningLib: String(defaultOrgId),
    status: "",
    location: "",
    circModifier: "",
    holdable: true,
    circulate: true,
    opacVisible: true,
    ref: false,
    price: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/evergreen/templates?type=copy&org_id=${orgId}&limit=200`);
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || `HTTP ${res.status}`);
      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      setStatuses(Array.isArray(json.statuses) ? json.statuses : []);
      setLocations(Array.isArray(json.locations) ? json.locations : []);
      setCircModifiers(Array.isArray(json.circModifiers) ? json.circModifiers : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load copy templates");
      setTemplates([]);
      setStatuses([]);
      setLocations([]);
      setCircModifiers([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({
      name: "",
      owningLib: String(orgId),
      status: "",
      location: "",
      circModifier: "",
      holdable: true,
      circulate: true,
      opacVisible: true,
      ref: false,
      price: "",
    });
    setDialogOpen(true);
  }, [orgId]);

  const openEdit = useCallback((t: CopyTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      owningLib: String(t.owningLib || orgId),
      status: t.status ? String(t.status) : "",
      location: t.location ? String(t.location) : "",
      circModifier: t.circModifier || "",
      holdable: Boolean(t.holdable),
      circulate: Boolean(t.circulate),
      opacVisible: Boolean(t.opacVisible),
      ref: Boolean(t.ref),
      price: typeof t.price === "number" ? String(t.price) : "",
    });
    setDialogOpen(true);
  }, [orgId]);

  const requestDelete = useCallback((t: CopyTemplate) => {
    setDeleteTarget(t);
    setDeleteOpen(true);
  }, []);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    const owningLib = safeInt(form.owningLib);
    if (!owningLib) return toast.error("Owning library is required");

    const payload = {
      name: form.name.trim(),
      owningLib,
      status: form.status ? safeInt(form.status) : null,
      location: form.location ? safeInt(form.location) : null,
      circModifier: form.circModifier ? form.circModifier : null,
      holdable: form.holdable,
      circulate: form.circulate,
      opacVisible: form.opacVisible,
      ref: form.ref,
      price: safeFloat(form.price),
    };

    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editing ? "update" : "create",
          type: "copy",
          data: editing ? { id: editing.id, ...payload } : payload,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Save failed");
      toast.success(editing ? "Template updated" : "Template created");
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          type: "copy",
          data: { id: deleteTarget.id },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Delete failed");
      toast.success("Template deleted");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const filteredLocations = useMemo(() => {
    const owningLib = safeInt(form.owningLib);
    if (!owningLib) return locations;
    return locations.filter((l) => !l.owningLib || l.owningLib === owningLib);
  }, [locations, form.owningLib]);

  const columns = useMemo<ColumnDef<CopyTemplate>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.owningLibName || `Org #${row.original.owningLib}`}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "statusName",
        header: "Status",
        cell: ({ row }) => row.original.statusName || "—",
      },
      {
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => row.original.locationName || "—",
      },
      {
        accessorKey: "circModifier",
        header: "Circ Mod",
        cell: ({ row }) => row.original.circModifier || "—",
      },
      {
        id: "flags",
        header: "Flags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.circulate ? <Badge variant="secondary">Circulate</Badge> : <Badge variant="outline">No circ</Badge>}
            {row.original.holdable ? <Badge variant="secondary">Holdable</Badge> : <Badge variant="outline">No holds</Badge>}
            {row.original.opacVisible ? <Badge variant="secondary">OPAC</Badge> : <Badge variant="outline">Hidden</Badge>}
            {row.original.ref ? <Badge variant="outline">Ref</Badge> : null}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)} aria-label="Edit template">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => requestDelete(row.original)}
              aria-label="Delete template"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [openEdit, requestDelete]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Copy Templates"
        subtitle="Reusable defaults for item copy creation (status, location, circ modifier, flags)."
        breadcrumbs={[
          { label: "Cataloging", href: "/staff/cataloging" },
          { label: "Templates", href: "/staff/cataloging/templates" },
          { label: "Copy" },
        ]}
        actions={[
          { label: "Back", onClick: () => router.push("/staff/cataloging/templates"), icon: ArrowLeft, variant: "outline" as const },
          { label: "Refresh", onClick: load, icon: RefreshCw, variant: "outline" as const },
          { label: "New Template", onClick: openCreate, icon: Plus },
        ]}
      />

      <PageContent className="space-y-6">
        {error ? <ErrorMessage message={error} onRetry={load} /> : null}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Scope</CardTitle>
            <CardDescription>Templates are stored in Evergreen (asset.copy_template). Select an org to filter.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Select id="organization" value={String(orgId)} onValueChange={(v) => setOrgId(parseInt(v, 10))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select org" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.shortname} — {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="circulation-modifiers">Circulation modifiers</Label>
              <div className="text-sm text-muted-foreground">
                {circModifiers.length > 0
                  ? `${circModifiers.length} available`
                  : "None returned (you can still create templates)."}
              </div>
              {circModifiers.length === 0 ? (
                <Button variant="outline" size="sm" onClick={() => router.push("/staff/help#evergreen-setup")}>
                  <Settings className="h-4 w-4 mr-2" />
                  Evergreen setup checklist
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-tip">Quick tip</Label>
              <div className="text-sm text-muted-foreground">
                Use templates when adding new items to ensure consistent defaults.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> Templates
            </CardTitle>
            <CardDescription>{templates.length} template{templates.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={templates}
              isLoading={loading}
              searchable
              searchPlaceholder="Search templates..."
              emptyState={
                <EmptyState
                  icon={Package}
                  title="No copy templates"
                  description="Create your first copy template to speed up item creation."
                  action={{ label: "Create template", onClick: openCreate, icon: Plus }}
                  secondaryAction={{ label: "Seed demo data", onClick: () => router.push("/staff/help#demo-data") }}
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit copy template" : "New copy template"}</DialogTitle>
            <DialogDescription>
              Templates apply defaults when adding new copies. You can still override per-item.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g., New Book Default" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="owning-library">Owning library</Label>
              <Select id="owning-library" value={form.owningLib} onValueChange={(v) => setForm((p) => ({ ...p, owningLib: v }))}>
                <SelectTrigger><SelectValue placeholder="Select org" /></SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.shortname} — {o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(None)</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Select id="location" value={form.location} onValueChange={(v) => setForm((p) => ({ ...p, location: v }))}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(None)</SelectItem>
                  {filteredLocations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="circ-modifier">Circ modifier</Label>
              <Select id="circ-modifier" value={form.circModifier} onValueChange={(v) => setForm((p) => ({ ...p, circModifier: v }))}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(None)</SelectItem>
                  {circModifiers.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input id="price"
                value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                placeholder="Optional"
                inputMode="decimal"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Circulate</div>
                <div className="text-xs text-muted-foreground">Allow normal circulation.</div>
              </div>
              <Switch checked={form.circulate} onCheckedChange={(v) => setForm((p) => ({ ...p, circulate: Boolean(v) }))} />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Holdable</div>
                <div className="text-xs text-muted-foreground">Allow holds on items.</div>
              </div>
              <Switch checked={form.holdable} onCheckedChange={(v) => setForm((p) => ({ ...p, holdable: Boolean(v) }))} />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">OPAC visible</div>
                <div className="text-xs text-muted-foreground">Show in public catalog.</div>
              </div>
              <Switch checked={form.opacVisible} onCheckedChange={(v) => setForm((p) => ({ ...p, opacVisible: Boolean(v) }))} />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Reference</div>
                <div className="text-xs text-muted-foreground">Mark as reference/non-circulating.</div>
              </div>
              <Switch checked={form.ref} onCheckedChange={(v) => setForm((p) => ({ ...p, ref: Boolean(v) }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={deleteTarget ? `template "${deleteTarget.name}"` : "template"}
        onConfirm={confirmDelete}
        isLoading={deleting}
      />
    </PageContainer>
  );
}
