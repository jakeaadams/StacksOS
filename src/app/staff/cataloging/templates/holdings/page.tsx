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
import { ArrowLeft, Layers, Plus, RefreshCw, Trash2, Pencil } from "lucide-react";

type HoldingsTemplate = {
  id: number;
  name: string;
  owningLib: number;
  owningLibName: string | null;
  callNumberPrefix: number | null;
  callNumberSuffix: number | null;
  classification: number | null;
  classificationName: string | null;
};

type ClassificationRow = { id: number; name: string };
type PrefixRow = { id: number; label: string; owningLib: number };
type SuffixRow = { id: number; label: string; owningLib: number };

function safeInt(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function HoldingsTemplatesPage() {
  const router = useRouter();
  const { user, orgs } = useAuth();

  const defaultOrgId = user?.activeOrgId ?? user?.homeLibraryId ?? orgs[0]?.id ?? 1;
  const [orgId, setOrgId] = useState<number>(defaultOrgId);

  const [templates, setTemplates] = useState<HoldingsTemplate[]>([]);
  const [classifications, setClassifications] = useState<ClassificationRow[]>([]);
  const [prefixes, setPrefixes] = useState<PrefixRow[]>([]);
  const [suffixes, setSuffixes] = useState<SuffixRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<HoldingsTemplate | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HoldingsTemplate | null>(null);

  const [form, setForm] = useState({
    name: "",
    owningLib: String(defaultOrgId),
    classification: "",
    callNumberPrefix: "",
    callNumberSuffix: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/evergreen/templates?type=holdings&org_id=${orgId}`);
      const json = await res.json();
      if (!res.ok || json?.ok !== true) throw new Error(json?.error || `HTTP ${res.status}`);
      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      setClassifications(Array.isArray(json.classifications) ? json.classifications : []);
      setPrefixes(Array.isArray(json.prefixes) ? json.prefixes : []);
      setSuffixes(Array.isArray(json.suffixes) ? json.suffixes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load holdings templates");
      setTemplates([]);
      setClassifications([]);
      setPrefixes([]);
      setSuffixes([]);
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
      classification: "",
      callNumberPrefix: "",
      callNumberSuffix: "",
    });
    setDialogOpen(true);
  }, [orgId]);

  const openEdit = useCallback(
    (t: HoldingsTemplate) => {
      setEditing(t);
      setForm({
        name: t.name,
        owningLib: String(t.owningLib || orgId),
        classification: t.classification ? String(t.classification) : "",
        callNumberPrefix: t.callNumberPrefix ? String(t.callNumberPrefix) : "",
        callNumberSuffix: t.callNumberSuffix ? String(t.callNumberSuffix) : "",
      });
      setDialogOpen(true);
    },
    [orgId]
  );

  const requestDelete = useCallback((t: HoldingsTemplate) => {
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
      classification: form.classification ? safeInt(form.classification) : null,
      callNumberPrefix: form.callNumberPrefix ? safeInt(form.callNumberPrefix) : null,
      callNumberSuffix: form.callNumberSuffix ? safeInt(form.callNumberSuffix) : null,
    };

    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editing ? "update" : "create",
          type: "holdings",
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
          type: "holdings",
          data: { id: deleteTarget.id, owningLib: orgId },
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

  const prefixLabelById = useMemo(() => {
    const map = new Map<number, string>();
    prefixes.forEach((p) => map.set(p.id, p.label));
    return map;
  }, [prefixes]);

  const suffixLabelById = useMemo(() => {
    const map = new Map<number, string>();
    suffixes.forEach((s) => map.set(s.id, s.label));
    return map;
  }, [suffixes]);

  const classLabelById = useMemo(() => {
    const map = new Map<number, string>();
    classifications.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [classifications]);

  const columns = useMemo<ColumnDef<HoldingsTemplate>[]>(
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
        accessorKey: "classificationName",
        header: "Classification",
        cell: ({ row }) =>
          row.original.classificationName ||
          (row.original.classification ? classLabelById.get(row.original.classification) : null) ||
          "—",
      },
      {
        id: "prefix",
        header: "Prefix",
        cell: ({ row }) =>
          (row.original.callNumberPrefix
            ? prefixLabelById.get(row.original.callNumberPrefix)
            : null) || "—",
      },
      {
        id: "suffix",
        header: "Suffix",
        cell: ({ row }) =>
          (row.original.callNumberSuffix
            ? suffixLabelById.get(row.original.callNumberSuffix)
            : null) || "—",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(row.original)}
              aria-label="Edit template"
            >
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
    [classLabelById, openEdit, prefixLabelById, requestDelete, suffixLabelById]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Holdings Templates"
        subtitle="Reusable defaults for call numbers (prefix/suffix/classification)."
        breadcrumbs={[
          { label: "Cataloging", href: "/staff/cataloging" },
          { label: "Templates", href: "/staff/cataloging/templates" },
          { label: "Holdings" },
        ]}
        actions={[
          {
            label: "Back",
            onClick: () => router.push("/staff/cataloging/templates"),
            icon: ArrowLeft,
            variant: "outline" as const,
          },
          { label: "Refresh", onClick: load, icon: RefreshCw, variant: "outline" as const },
          { label: "New Template", onClick: openCreate, icon: Plus },
        ]}
      />

      <PageContent className="space-y-6">
        {error ? <ErrorMessage message={error} onRetry={load} /> : null}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Scope</CardTitle>
            <CardDescription>
              Holdings templates are stored in org unit settings as JSON.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Select
                id="organization"
                value={String(orgId)}
                onValueChange={(v) => setOrgId(parseInt(v, 10))}
              >
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
              <Label htmlFor="prefixes">Prefixes</Label>
              <div className="text-sm text-muted-foreground">{prefixes.length} configured</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="suffixes">Suffixes</Label>
              <div className="text-sm text-muted-foreground">{suffixes.length} configured</div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" /> Templates
            </CardTitle>
            <CardDescription>
              {templates.length} template{templates.length === 1 ? "" : "s"}
            </CardDescription>
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
                  icon={Layers}
                  title="No holdings templates"
                  description="Create your first holdings template to standardize call number entry."
                  action={{ label: "Create template", onClick: openCreate, icon: Plus }}
                  secondaryAction={{
                    label: "Evergreen setup checklist",
                    onClick: () => router.push("/staff/help#evergreen-setup"),
                  }}
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit holdings template" : "New holdings template"}
            </DialogTitle>
            <DialogDescription>
              These defaults apply when creating new call numbers/holdings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Adult Fiction"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="owning-library">Owning library</Label>
              <Select
                id="owning-library"
                value={form.owningLib}
                onValueChange={(v) => setForm((p) => ({ ...p, owningLib: v }))}
              >
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
              <Label htmlFor="classification">Classification</Label>
              <Select
                id="classification"
                value={form.classification}
                onValueChange={(v) => setForm((p) => ({ ...p, classification: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(None)</SelectItem>
                  {classifications.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prefix">Prefix</Label>
              <Select
                id="prefix"
                value={form.callNumberPrefix}
                onValueChange={(v) => setForm((p) => ({ ...p, callNumberPrefix: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(None)</SelectItem>
                  {prefixes.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="suffix">Suffix</Label>
              <Select
                id="suffix"
                value={form.callNumberSuffix}
                onValueChange={(v) => setForm((p) => ({ ...p, callNumberSuffix: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(None)</SelectItem>
                  {suffixes.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
