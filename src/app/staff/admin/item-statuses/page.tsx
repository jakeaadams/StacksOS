"use client";

/**
 * Item Statuses
 * Configure Evergreen config.copy_status through StacksOS.
 */

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  ConfirmDialog,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  CircleDot,
  Check,
  X,
  Lock,
  Eye,
  EyeOff,
  Calendar,
  AlertTriangle,
  RefreshCcw,
  Plus,
  Edit,
  Trash2,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

interface ItemStatus {
  id: number;
  name: string;
  holdable: boolean;
  opacVisible: boolean;
  copyActive: boolean;
  isAvailable: boolean;
  restrictCopyDelete: boolean;
  hopelessProne: boolean;
}

interface Permissions {
  CREATE_COPY_STATUS?: boolean;
  UPDATE_COPY_STATUS?: boolean;
  DELETE_COPY_STATUS?: boolean;
}

const dotPalette = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-violet-500",
  "bg-slate-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-sky-500",
  "bg-stone-500",
  "bg-rose-500",
  "bg-lime-500",
];

function dotColorForId(id: number): string {
  const index = Math.abs(id || 0) % dotPalette.length;
  return dotPalette[index]!;
}

export default function ItemStatusPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ItemStatus[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({});

  const [editStatus, setEditStatus] = useState<ItemStatus | null>(null);
  const [newStatusOpen, setNewStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusToDelete, setStatusToDelete] = useState<ItemStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/evergreen/copy-statuses", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setPermissions((json.permissions || {}) as Permissions);
      const rows = Array.isArray(json.statuses) ? json.statuses : [];
      setStatuses(
        rows.map((s: any) => ({
          id: Number(s?.id) || 0,
          name: String(s?.name || ""),
          holdable: Boolean(s?.holdable),
          opacVisible: Boolean(s?.opacVisible),
          copyActive: Boolean(s?.copyActive),
          isAvailable: Boolean(s?.isAvailable),
          restrictCopyDelete: Boolean(s?.restrictCopyDelete),
          hopelessProne: Boolean(s?.hopelessProne),
        }))
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function createStatus(data: Partial<ItemStatus>) {
    setBusy(true);
    try {
      const res = await fetch("/api/evergreen/copy-statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      toast.success("Status created");
      setNewStatusOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(data: Partial<ItemStatus> & { id: number; force?: boolean }) {
    setBusy(true);
    try {
      const res = await fetch("/api/evergreen/copy-statuses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      toast.success("Status updated");
      setEditStatus(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteStatus(id: number, force?: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/evergreen/copy-statuses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, force: force === true }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      toast.success("Status deleted");
      setDeleteOpen(false);
      setStatusToDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredStatuses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return statuses;
    return statuses.filter((s) => s.name.toLowerCase().includes(q));
  }, [searchQuery, statuses]);

  const stats = useMemo(() => {
    const availableCount = statuses.filter((s) => s.isAvailable).length;
    const holdableCount = statuses.filter((s) => s.holdable).length;
    const opacVisibleCount = statuses.filter((s) => s.opacVisible).length;
    return { availableCount, holdableCount, opacVisibleCount, total: statuses.length };
  }, [statuses]);

  const canCreate = permissions.CREATE_COPY_STATUS === true;
  const canUpdate = permissions.UPDATE_COPY_STATUS === true;
  const canDelete = permissions.DELETE_COPY_STATUS === true;

  const BoolIcon = ({ value }: { value: boolean }) =>
    value ? (
      <Check className="h-4 w-4 text-emerald-600" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground/50" />
    );

  const columns: ColumnDef<ItemStatus>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">{row.original.id}</span>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${dotColorForId(row.original.id)}`} />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "holdable",
      header: "Holdable",
      cell: ({ row }) => <BoolIcon value={row.original.holdable} />,
    },
    {
      accessorKey: "opacVisible",
      header: "OPAC",
      cell: ({ row }) =>
        row.original.opacVisible ? (
          <Eye className="h-4 w-4 text-emerald-600" />
        ) : (
          <EyeOff className="h-4 w-4 text-muted-foreground/50" />
        ),
    },
    {
      accessorKey: "copyActive",
      header: "Active",
      cell: ({ row }) => <BoolIcon value={row.original.copyActive} />,
    },
    {
      accessorKey: "isAvailable",
      header: "Available",
      cell: ({ row }) => (
        <Badge
          variant={row.original.isAvailable ? "default" : "secondary"}
          className={row.original.isAvailable ? "bg-emerald-100 text-emerald-700" : ""}
        >
          {row.original.isAvailable ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      accessorKey: "restrictCopyDelete",
      header: "Protect",
      cell: ({ row }) =>
        row.original.restrictCopyDelete ? (
          <Lock className="h-4 w-4 text-amber-600" />
        ) : (
          <span className="text-muted-foreground/50">-</span>
        ),
    },
    {
      accessorKey: "hopelessProne",
      header: "Hopeless",
      cell: ({ row }) =>
        row.original.hopelessProne ? (
          <AlertTriangle className="h-4 w-4 text-red-600" />
        ) : (
          <span className="text-muted-foreground/50">-</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!canUpdate}
            onClick={() => setEditStatus(row.original)}
            title={canUpdate ? "Edit" : "Missing permission: UPDATE_COPY_STATUS"}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            disabled={!canDelete}
            onClick={() => {
              setStatusToDelete(row.original);
              setDeleteOpen(true);
            }}
            title={canDelete ? "Delete" : "Missing permission: DELETE_COPY_STATUS"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const editIsCore = (editStatus?.id || 0) > 0 && (editStatus?.id || 0) < 100;
  const deleteIsCore = (statusToDelete?.id || 0) > 0 && (statusToDelete?.id || 0) < 100;

  const [newDraft, setNewDraft] = useState<Partial<ItemStatus>>({
    name: "",
    holdable: true,
    opacVisible: true,
    copyActive: true,
    isAvailable: false,
    restrictCopyDelete: false,
    hopelessProne: false,
  });

  return (
    <PageContainer>
      <PageHeader
        title="Item Statuses"
        subtitle="Edits are applied to Evergreen immediately"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Item Statuses" }]}
        actions={[
          {
            label: loading ? "Refreshing…" : "Refresh",
            onClick: () => void load(),
            icon: RefreshCcw,
          },
          {
            label: "New Status",
            onClick: () => setNewStatusOpen(true),
            icon: Plus,
            disabled: !canCreate,
          },
        ]}
      />
      <PageContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/20 border-emerald-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-600">Available</p>
                  <p className="text-3xl font-bold text-emerald-700">{stats.availableCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Check className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/20 border-blue-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Holdable</p>
                  <p className="text-3xl font-bold text-blue-700">{stats.holdableCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/20 border-purple-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">OPAC Visible</p>
                  <p className="text-3xl font-bold text-purple-700">{stats.opacVisibleCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Eye className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/20 border-amber-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-600">Total Statuses</p>
                  <p className="text-3xl font-bold text-amber-700">{stats.total}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <CircleDot className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>All Statuses</CardTitle>
                <CardDescription>
                  Source of truth is Evergreen (Config → Item Statuses)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search statuses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-[250px]"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <EmptyState
                title="Couldn’t load item statuses"
                description={error}
                action={{ label: "Retry", onClick: () => void load() }}
              />
            ) : loading ? (
              <EmptyState title="Loading…" description="Fetching copy statuses from Evergreen." />
            ) : filteredStatuses.length === 0 ? (
              <EmptyState
                title={
                  searchQuery.trim() ? "No statuses match your search" : "No statuses returned"
                }
                description={
                  searchQuery.trim()
                    ? "Try a different search term."
                    : "Evergreen returned zero copy statuses. In a sandbox, seed demo data; otherwise verify Evergreen configuration and permissions."
                }
                action={{ label: "Retry", onClick: () => void load() }}
                secondaryAction={{
                  label: "Seed demo data",
                  onClick: () => window.location.assign("/staff/help#demo-data"),
                }}
              />
            ) : (
              <DataTable columns={columns} data={filteredStatuses} />
            )}
          </CardContent>
        </Card>

        <Dialog open={newStatusOpen} onOpenChange={setNewStatusOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Create Copy Status</DialogTitle>
              <DialogDescription>
                This creates a new Evergreen copy status (config.copy_status).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-status-name">Name</Label>
                <Input
                  id="new-status-name"
                  value={String(newDraft.name || "")}
                  onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Repair"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Holdable</Label>
                  <Switch
                    checked={Boolean(newDraft.holdable)}
                    onCheckedChange={(v) => setNewDraft((d) => ({ ...d, holdable: v }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label>OPAC Visible</Label>
                  <Switch
                    checked={Boolean(newDraft.opacVisible)}
                    onCheckedChange={(v) => setNewDraft((d) => ({ ...d, opacVisible: v }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label>Sets Copy Active</Label>
                  <Switch
                    checked={Boolean(newDraft.copyActive)}
                    onCheckedChange={(v) => setNewDraft((d) => ({ ...d, copyActive: v }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label>Available</Label>
                  <Switch
                    checked={Boolean(newDraft.isAvailable)}
                    onCheckedChange={(v) => setNewDraft((d) => ({ ...d, isAvailable: v }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label>Restrict Deletion</Label>
                  <Switch
                    checked={Boolean(newDraft.restrictCopyDelete)}
                    onCheckedChange={(v) => setNewDraft((d) => ({ ...d, restrictCopyDelete: v }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label>Hopeless-Prone</Label>
                  <Switch
                    checked={Boolean(newDraft.hopelessProne)}
                    onCheckedChange={(v) => setNewDraft((d) => ({ ...d, hopelessProne: v }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewStatusOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={() => createStatus(newDraft)}
                disabled={busy || !canCreate || !String(newDraft.name || "").trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editStatus} onOpenChange={(open) => !open && setEditStatus(null)}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Edit Copy Status</DialogTitle>
              <DialogDescription>
                {editIsCore
                  ? "This is a core Evergreen status. Editing it can affect workflows system-wide."
                  : "Changes apply immediately in Evergreen."}
              </DialogDescription>
            </DialogHeader>
            {editStatus && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Status Name</Label>
                  <Input
                    value={editStatus.name}
                    onChange={(e) => setEditStatus({ ...editStatus, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Holdable</Label>
                    <Switch
                      checked={editStatus.holdable}
                      onCheckedChange={(v) => setEditStatus({ ...editStatus, holdable: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label>OPAC Visible</Label>
                    <Switch
                      checked={editStatus.opacVisible}
                      onCheckedChange={(v) => setEditStatus({ ...editStatus, opacVisible: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label>Sets Copy Active</Label>
                    <Switch
                      checked={editStatus.copyActive}
                      onCheckedChange={(v) => setEditStatus({ ...editStatus, copyActive: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label>Available</Label>
                    <Switch
                      checked={editStatus.isAvailable}
                      onCheckedChange={(v) => setEditStatus({ ...editStatus, isAvailable: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label>Restrict Deletion</Label>
                    <Switch
                      checked={editStatus.restrictCopyDelete}
                      onCheckedChange={(v) =>
                        setEditStatus({ ...editStatus, restrictCopyDelete: v })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label>Hopeless-Prone</Label>
                    <Switch
                      checked={editStatus.hopelessProne}
                      onCheckedChange={(v) => setEditStatus({ ...editStatus, hopelessProne: v })}
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditStatus(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!editStatus) return;
                  if (editStatus.id < 100) {
                    setConfirmOpen(true);
                    return;
                  }
                  void updateStatus({ ...editStatus, force: false });
                }}
                disabled={busy || !canUpdate || !editStatus || !editStatus.name.trim()}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete status?"
          description={
            deleteIsCore
              ? `This is a core Evergreen status (ID ${statusToDelete?.id}). Deleting it can break workflows.`
              : `Delete "${statusToDelete?.name}"? This change is applied to Evergreen immediately.`
          }
          confirmText={deleteIsCore ? "Delete (Force)" : "Delete"}
          cancelText="Cancel"
          variant="danger"
          onConfirm={() => {
            const id = statusToDelete?.id;
            if (!id) return;
            void deleteStatus(id, deleteIsCore);
          }}
        />

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Confirm core status change"
          description="This is a core Evergreen status (ID < 100). Are you sure you want to change it?"
          confirmText="Yes, update"
          cancelText="Cancel"
          variant="danger"
          onConfirm={() => {
            if (!editStatus) return;
            void updateStatus({ ...editStatus, force: true });
          }}
        />
      </PageContent>
    </PageContainer>
  );
}
