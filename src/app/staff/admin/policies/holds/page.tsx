"use client";

import { useCallback, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, BookMarked, Plus, Edit3, Trash2 } from "lucide-react";

import { useApi, useMutation } from "@/hooks";
import { featureFlags } from "@/lib/feature-flags";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  ConfirmDialog,
  TableRowActions,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type HoldMatchpoint = {
  id: number;
  active: boolean;
  strictOuMatch?: boolean;
  requestorGrp?: number | null;
  requestorGrpName?: string | null;
  usrGrp?: number | null;
  usrGrpName?: string | null;
  pickupOu?: number | null;
  pickupOuName?: string | null;
  requestOu?: number | null;
  requestOuName?: string | null;
  itemOwningOu?: number | null;
  itemOwningOuName?: string | null;
  itemCircOu?: number | null;
  itemCircOuName?: string | null;
  circModifier?: string | null;
  refFlag?: unknown;
  itemAge?: unknown;
  holdable?: boolean;
  transitRange?: unknown;
  maxHolds?: unknown;
  includeLocallyFrozen?: boolean;
  stopBlockedUser?: boolean;
  ageProtection?: unknown;
  description?: string | null;
};

type HoldMatchpointDraft = {
  active: boolean;
  strictOuMatch: boolean;
  requestorGrp: number | null;
  usrGrp: number | null;
  pickupOu: number | null;
  requestOu: number | null;
  itemOwningOu: number | null;
  itemCircOu: number | null;
  circModifier: string | null;
  refFlag: boolean | null;
  itemAge: string;
  holdable: boolean;
  transitRange: string;
  maxHolds: string;
  includeLocallyFrozen: boolean;
  stopBlockedUser: boolean;
  ageProtection: string;
  description: string;
};

type OrgTreeNode = {
  id: number;
  name?: string | null;
  shortname?: string | null;
  children?: OrgTreeNode[];
};
type OrgOption = { id: number; label: string; depth: number };
type PermGroup = { id: number; name: string };

const DEFAULT_HOLD_DRAFT: HoldMatchpointDraft = {
  active: true,
  strictOuMatch: false,
  requestorGrp: null,
  usrGrp: null,
  pickupOu: null,
  requestOu: null,
  itemOwningOu: null,
  itemCircOu: null,
  circModifier: null,
  refFlag: null,
  itemAge: "",
  holdable: true,
  transitRange: "",
  maxHolds: "",
  includeLocallyFrozen: false,
  stopBlockedUser: false,
  ageProtection: "",
  description: "",
};

export default function HoldPolicyEditorPage() {
  const policyEditorsEnabled = featureFlags.policyEditors;
  const holdUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=hold&limit=500" : null;
  const orgTreeUrl = policyEditorsEnabled ? "/api/evergreen/org-tree" : null;
  const groupsUrl = policyEditorsEnabled
    ? "/api/evergreen/permissions?type=groups&limit=2000"
    : null;
  const modifiersUrl = policyEditorsEnabled ? "/api/evergreen/circ-modifiers" : null;

  const {
    data: holdData,
    isLoading,
    error,
    refetch,
  } = useApi<any>(holdUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false });

  const matchpoints: HoldMatchpoint[] = Array.isArray(holdData?.policies) ? holdData.policies : [];

  const { data: orgTreeData, isLoading: orgTreeLoading } = useApi<any>(orgTreeUrl, {
    immediate: policyEditorsEnabled,
    revalidateOnFocus: false,
    revalidateInterval: 30 * 60_000,
  });
  const orgTree: OrgTreeNode | null = (orgTreeData?.tree as OrgTreeNode | null) ?? null;

  const { data: groupsData, isLoading: groupsLoading } = useApi<any>(groupsUrl, {
    immediate: policyEditorsEnabled,
    revalidateOnFocus: false,
    revalidateInterval: 30 * 60_000,
  });
  const groups: PermGroup[] = Array.isArray(groupsData?.groups) ? groupsData.groups : [];

  const { data: modifiersData, isLoading: modifiersLoading } = useApi<any>(modifiersUrl, {
    immediate: policyEditorsEnabled,
    revalidateOnFocus: false,
    revalidateInterval: 30 * 60_000,
  });
  const circModifiers: { code: string; name: string }[] = Array.isArray(modifiersData?.modifiers)
    ? modifiersData.modifiers
    : [];

  const orgOptions = useMemo<OrgOption[]>(() => {
    const out: OrgOption[] = [];
    const walk = (node: OrgTreeNode, depth: number) => {
      const short = (node.shortname ?? "").toString().trim();
      const name = (node.name ?? "").toString().trim();
      const label = short ? `${short} — ${name || short}` : name || `Org #${node.id}`;
      out.push({ id: node.id, label, depth });
      (node.children || []).forEach((child) => walk(child, depth + 1));
    };
    if (orgTree) walk(orgTree, 0);
    return out;
  }, [orgTree]);

  const formatOrgOptionLabel = useCallback((option: OrgOption) => {
    const indent = "\u00A0".repeat(Math.max(0, option.depth) * 2);
    return `${indent}${option.label}`;
  }, []);

  const toNumberOrNull = useCallback((value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  const toTriBool = useCallback((value: unknown): boolean | null => {
    if (value === null || value === undefined) return null;
    if (value === true || value === "t" || value === 1) return true;
    if (value === false || value === "f" || value === 0) return false;
    return null;
  }, []);

  const buildDraftFromMatchpoint = useCallback(
    (mp: HoldMatchpoint): HoldMatchpointDraft => ({
      active: Boolean(mp.active),
      strictOuMatch: Boolean(mp.strictOuMatch),
      requestorGrp: toNumberOrNull(mp.requestorGrp),
      usrGrp: toNumberOrNull(mp.usrGrp),
      pickupOu: toNumberOrNull(mp.pickupOu),
      requestOu: toNumberOrNull(mp.requestOu),
      itemOwningOu: toNumberOrNull(mp.itemOwningOu),
      itemCircOu: toNumberOrNull(mp.itemCircOu),
      circModifier: mp.circModifier ? String(mp.circModifier) : null,
      refFlag: toTriBool(mp.refFlag),
      itemAge: mp.itemAge ? String(mp.itemAge) : "",
      holdable: mp.holdable !== false,
      transitRange: mp.transitRange ? String(mp.transitRange) : "",
      maxHolds: mp.maxHolds ? String(mp.maxHolds) : "",
      includeLocallyFrozen: Boolean(mp.includeLocallyFrozen),
      stopBlockedUser: Boolean(mp.stopBlockedUser),
      ageProtection: mp.ageProtection ? String(mp.ageProtection) : "",
      description: typeof mp.description === "string" ? mp.description : "",
    }),
    [toNumberOrNull, toTriBool]
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<HoldMatchpoint | null>(null);
  const [draft, setDraft] = useState<HoldMatchpointDraft>(() => ({ ...DEFAULT_HOLD_DRAFT }));

  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HoldMatchpoint | null>(null);

  const { mutateAsync: mutatePolicies, isLoading: isMutating } = useMutation<any>();

  const openCreate = useCallback(() => {
    setEditorMode("create");
    setEditing(null);
    setDraft({ ...DEFAULT_HOLD_DRAFT });
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback(
    (mp: HoldMatchpoint) => {
      setEditorMode("edit");
      setEditing(mp);
      setDraft(buildDraftFromMatchpoint(mp));
      setEditorOpen(true);
    },
    [buildDraftFromMatchpoint]
  );

  const requestDelete = useCallback((mp: HoldMatchpoint) => {
    setDeleteTarget(mp);
    setDeleteConfirmOpen(true);
  }, []);

  const previewRows = useMemo(() => {
    const base = editing ? buildDraftFromMatchpoint(editing) : DEFAULT_HOLD_DRAFT;
    const rows: Array<{ label: string; from: string; to: string; changed: boolean }> = [];
    const add = (label: string, from: string, to: string) =>
      rows.push({ label, from, to, changed: from !== to });
    const tri = (v: boolean | null) => (v === null ? "Any" : v ? "Yes" : "No");
    const yn = (v: boolean) => (v ? "Yes" : "No");
    const id = (v: number | null) => (v === null ? "Any" : `#${v}`);

    add("Active", yn(base.active), yn(draft.active));
    add("Strict OU match", yn(base.strictOuMatch), yn(draft.strictOuMatch));
    add("Requestor group", id(base.requestorGrp), id(draft.requestorGrp));
    add("User group", id(base.usrGrp), id(draft.usrGrp));
    add("Pickup OU", id(base.pickupOu), id(draft.pickupOu));
    add("Owning OU", id(base.itemOwningOu), id(draft.itemOwningOu));
    add("Circ modifier", base.circModifier || "Any", draft.circModifier || "Any");
    add("Holdable", yn(base.holdable), yn(draft.holdable));
    add("Reference", tri(base.refFlag), tri(draft.refFlag));
    add("Transit range", base.transitRange || "—", draft.transitRange || "—");
    add("Max holds", base.maxHolds || "—", draft.maxHolds || "—");
    add("Description", base.description || "—", draft.description.trim() || "—");

    return rows.filter((r) => r.changed);
  }, [buildDraftFromMatchpoint, draft, editing]);

  const confirmSave = useCallback(async () => {
    const action = editorMode === "create" ? "create" : "update";
    const data: Record<string, any> = {
      active: draft.active,
      strictOuMatch: draft.strictOuMatch,
      requestorGrp: draft.requestorGrp,
      usrGrp: draft.usrGrp,
      pickupOu: draft.pickupOu,
      requestOu: draft.requestOu,
      itemOwningOu: draft.itemOwningOu,
      itemCircOu: draft.itemCircOu,
      circModifier: draft.circModifier,
      refFlag: draft.refFlag,
      itemAge: draft.itemAge.trim() ? draft.itemAge.trim() : null,
      holdable: draft.holdable,
      transitRange: draft.transitRange.trim() ? draft.transitRange.trim() : null,
      maxHolds: draft.maxHolds.trim() ? draft.maxHolds.trim() : null,
      includeLocallyFrozen: draft.includeLocallyFrozen,
      stopBlockedUser: draft.stopBlockedUser,
      ageProtection: draft.ageProtection.trim() ? draft.ageProtection.trim() : null,
      description: draft.description.trim() ? draft.description.trim() : null,
    };
    if (editorMode === "edit" && editing?.id) data.id = editing.id;

    try {
      await mutatePolicies("/api/evergreen/policies", { action, type: "hold", data });
      await refetch();
      toast.success(editorMode === "create" ? "Matchpoint created." : "Matchpoint updated.");
      setSaveConfirmOpen(false);
      setEditorOpen(false);
      setEditing(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save matchpoint";
      toast.error(message);
    }
  }, [draft, editorMode, editing, mutatePolicies, refetch]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    try {
      await mutatePolicies("/api/evergreen/policies", {
        action: "delete",
        type: "hold",
        data: { id: deleteTarget.id },
      });
      await refetch();
      toast.success(`Matchpoint #${deleteTarget.id} deleted.`);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete matchpoint";
      toast.error(message);
    }
  }, [deleteTarget, mutatePolicies, refetch]);

  const columns: ColumnDef<HoldMatchpoint>[] = useMemo(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => <span className="font-mono text-xs">#{row.original.id}</span>,
      },
      {
        accessorKey: "active",
        header: "Status",
        cell: ({ row }) =>
          row.original.active ? (
            <Badge className="rounded-full">Active</Badge>
          ) : (
            <Badge variant="secondary" className="rounded-full">
              Inactive
            </Badge>
          ),
      },
      {
        accessorKey: "requestorGrpName",
        header: "Requestor",
        cell: ({ row }) => (
          <span className="truncate">{row.original.requestorGrpName || "Any"}</span>
        ),
      },
      {
        accessorKey: "usrGrpName",
        header: "User Group",
        cell: ({ row }) => <span className="truncate">{row.original.usrGrpName || "Any"}</span>,
      },
      {
        accessorKey: "pickupOuName",
        header: "Pickup OU",
        cell: ({ row }) => <span className="truncate">{row.original.pickupOuName || "Any"}</span>,
      },
      {
        accessorKey: "itemOwningOuName",
        header: "Owning OU",
        cell: ({ row }) => (
          <span className="truncate">{row.original.itemOwningOuName || "Any"}</span>
        ),
      },
      {
        accessorKey: "circModifier",
        header: "Circ Modifier",
        cell: ({ row }) =>
          row.original.circModifier ? (
            <Badge variant="outline" className="rounded-full">
              {row.original.circModifier}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">Any</span>
          ),
      },
      {
        accessorKey: "holdable",
        header: "Holdable",
        cell: ({ row }) =>
          row.original.holdable === false ? (
            <Badge variant="destructive" className="rounded-full">
              No
            </Badge>
          ) : (
            <Badge variant="secondary" className="rounded-full">
              Yes
            </Badge>
          ),
      },
      {
        accessorKey: "transitRange",
        header: "Transit",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{String(row.original.transitRange ?? "—")}</span>
        ),
      },
      {
        accessorKey: "maxHolds",
        header: "Max Holds",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{String(row.original.maxHolds ?? "—")}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <TableRowActions
              quickActions={["edit"]}
              actions={[
                {
                  id: "edit",
                  label: "Edit matchpoint",
                  icon: Edit3,
                  onClick: () => openEdit(row.original),
                },
                {
                  id: "delete",
                  label: "Delete matchpoint",
                  icon: Trash2,
                  variant: "destructive",
                  onClick: () => requestDelete(row.original),
                },
              ]}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 80,
      },
    ],
    [openEdit, requestDelete]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Hold Policies (Advanced)"
        subtitle="Evergreen-backed hold matchpoints. Writes are feature-flagged and audited."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Policy Editors" },
          { label: "Holds" },
        ]}
        actions={
          policyEditorsEnabled
            ? [
                {
                  label: "Refresh",
                  onClick: () => void refetch(),
                  icon: RefreshCw,
                  variant: "outline",
                },
              ]
            : undefined
        }
      />
      <PageContent className="space-y-6">
        {!policyEditorsEnabled ? (
          <EmptyState
            title="Policy editors are disabled"
            description="Set NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1 to enable advanced policy editors."
          />
        ) : (
          <>
            <Dialog
              open={editorOpen}
              onOpenChange={(open) => {
                setEditorOpen(open);
                if (!open) setEditing(null);
              }}
            >
              <DialogContent className="sm:max-w-[980px]">
                <DialogHeader>
                  <DialogTitle>
                    {editorMode === "create"
                      ? "New hold matchpoint"
                      : `Edit matchpoint #${editing?.id ?? "—"}`}
                  </DialogTitle>
                  <DialogDescription>
                    Writes apply immediately in Evergreen and are recorded in the StacksOS audit
                    log.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4">
                      <div className="min-w-0">
                        <Label htmlFor="active" className="text-sm">
                          Active
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Inactive matchpoints are ignored by Evergreen.
                        </p>
                      </div>
                      <Switch
                        id="active"
                        checked={draft.active}
                        onCheckedChange={(checked) =>
                          setDraft((prev) => ({ ...prev, active: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4">
                      <div className="min-w-0">
                        <Label htmlFor="strict-ou-match" className="text-sm">
                          Strict OU match
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          If enabled, OU matching must be exact.
                        </p>
                      </div>
                      <Switch
                        id="strict-ou-match"
                        checked={draft.strictOuMatch}
                        onCheckedChange={(checked) =>
                          setDraft((prev) => ({ ...prev, strictOuMatch: checked }))
                        }
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="requestor-group">Requestor group</Label>
                        <Select
                          id="requestor-group"
                          value={draft.requestorGrp ? String(draft.requestorGrp) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              requestorGrp: v === "__any__" ? null : parseInt(v, 10),
                            }))
                          }
                          disabled={groupsLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={groupsLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {groups
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((g) => (
                                <SelectItem key={g.id} value={String(g.id)}>
                                  {g.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="user-group">User group</Label>
                        <Select
                          id="user-group"
                          value={draft.usrGrp ? String(draft.usrGrp) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              usrGrp: v === "__any__" ? null : parseInt(v, 10),
                            }))
                          }
                          disabled={groupsLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={groupsLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {groups
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((g) => (
                                <SelectItem key={g.id} value={String(g.id)}>
                                  {g.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pickup-ou">Pickup OU</Label>
                        <Select
                          id="pickup-ou"
                          value={draft.pickupOu ? String(draft.pickupOu) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              pickupOu: v === "__any__" ? null : parseInt(v, 10),
                            }))
                          }
                          disabled={orgTreeLoading || orgOptions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={orgTreeLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {orgOptions.map((o) => (
                              <SelectItem key={o.id} value={String(o.id)}>
                                {formatOrgOptionLabel(o)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="owning-ou">Owning OU</Label>
                        <Select
                          id="owning-ou"
                          value={draft.itemOwningOu ? String(draft.itemOwningOu) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              itemOwningOu: v === "__any__" ? null : parseInt(v, 10),
                            }))
                          }
                          disabled={orgTreeLoading || orgOptions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={orgTreeLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {orgOptions.map((o) => (
                              <SelectItem key={o.id} value={String(o.id)}>
                                {formatOrgOptionLabel(o)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="request-ou">Request OU</Label>
                        <Select
                          id="request-ou"
                          value={draft.requestOu ? String(draft.requestOu) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              requestOu: v === "__any__" ? null : parseInt(v, 10),
                            }))
                          }
                          disabled={orgTreeLoading || orgOptions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={orgTreeLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {orgOptions.map((o) => (
                              <SelectItem key={o.id} value={String(o.id)}>
                                {formatOrgOptionLabel(o)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="item-circ-ou">Item circ OU</Label>
                        <Select
                          id="item-circ-ou"
                          value={draft.itemCircOu ? String(draft.itemCircOu) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              itemCircOu: v === "__any__" ? null : parseInt(v, 10),
                            }))
                          }
                          disabled={orgTreeLoading || orgOptions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={orgTreeLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {orgOptions.map((o) => (
                              <SelectItem key={o.id} value={String(o.id)}>
                                {formatOrgOptionLabel(o)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="circ-modifier">Circ modifier</Label>
                        <Select
                          id="circ-modifier"
                          value={draft.circModifier ?? "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              circModifier: v === "__any__" ? null : v,
                            }))
                          }
                          disabled={modifiersLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={modifiersLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {circModifiers
                              .slice()
                              .sort((a, b) => a.code.localeCompare(b.code))
                              .map((m) => (
                                <SelectItem key={m.code} value={m.code}>
                                  <span className="font-mono text-xs mr-2">{m.code}</span>
                                  {m.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reference">Reference</Label>
                        <Select
                          id="reference"
                          value={draft.refFlag === null ? "any" : draft.refFlag ? "yes" : "no"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              refFlag: v === "any" ? null : v === "yes",
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="transit-range">Transit range</Label>
                        <Input
                          id="transit-range"
                          value={draft.transitRange}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, transitRange: e.target.value }))
                          }
                          placeholder="e.g., 50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max-holds">Max holds</Label>
                        <Input
                          id="max-holds"
                          value={draft.maxHolds}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, maxHolds: e.target.value }))
                          }
                          placeholder="e.g., 25"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:col-span-3">
                        <div className="min-w-0">
                          <Label htmlFor="holdable" className="text-sm">
                            Holdable
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            If disabled, Evergreen blocks holds.
                          </p>
                        </div>
                        <Switch
                          id="holdable"
                          checked={draft.holdable}
                          onCheckedChange={(checked) =>
                            setDraft((prev) => ({ ...prev, holdable: checked }))
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="item-age">Item age</Label>
                        <Input
                          id="item-age"
                          value={draft.itemAge}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, itemAge: e.target.value }))
                          }
                          placeholder="Optional"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="age-protection-rule">Age protection rule</Label>
                        <Input
                          id="age-protection-rule"
                          value={draft.ageProtection}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, ageProtection: e.target.value }))
                          }
                          placeholder="Optional"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4">
                        <div className="min-w-0">
                          <Label htmlFor="include-locally-frozen" className="text-sm">
                            Include locally frozen
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Counts frozen holds in local calculations.
                          </p>
                        </div>
                        <Switch
                          id="include-locally-frozen"
                          checked={draft.includeLocallyFrozen}
                          onCheckedChange={(checked) =>
                            setDraft((prev) => ({ ...prev, includeLocallyFrozen: checked }))
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4">
                        <div className="min-w-0">
                          <Label htmlFor="stop-blocked-user" className="text-sm">
                            Stop blocked user
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Block hold placement for blocked patrons.
                          </p>
                        </div>
                        <Switch
                          id="stop-blocked-user"
                          checked={draft.stopBlockedUser}
                          onCheckedChange={(checked) =>
                            setDraft((prev) => ({ ...prev, stopBlockedUser: checked }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={draft.description}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="Optional notes"
                        className="min-h-[90px]"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold">Preview changes</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review before saving. Permission required:{" "}
                      <span className="font-mono">ADMIN_CIRC_MATRIX_MATCHPOINT</span>.
                    </p>
                    <div className="mt-4 space-y-2">
                      {previewRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No changes.</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {previewRows.map((r) => (
                            <li
                              key={r.label}
                              className="rounded-xl border border-border/70 bg-card p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span className="font-medium">{r.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {editorMode === "create" ? "new" : "changed"}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {editorMode === "create" ? (
                                  <span>{r.to}</span>
                                ) : (
                                  <span>
                                    <span className="line-through">{r.from}</span> →{" "}
                                    <span className="text-foreground">{r.to}</span>
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setEditorOpen(false)}
                    disabled={isMutating}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => setSaveConfirmOpen(true)}
                    disabled={isMutating || (editorMode === "edit" && previewRows.length === 0)}
                  >
                    Review &amp; Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <ConfirmDialog
              open={saveConfirmOpen}
              onOpenChange={setSaveConfirmOpen}
              title={
                editorMode === "create"
                  ? "Create matchpoint?"
                  : `Save changes to matchpoint #${editing?.id ?? "—"}?`
              }
              description="This writes directly to Evergreen policy tables. Changes are audited."
              confirmText={editorMode === "create" ? "Create" : "Save"}
              variant="warning"
              onConfirm={confirmSave}
              isLoading={isMutating}
              confirmDisabled={editorMode === "edit" && previewRows.length === 0}
            >
              {previewRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {previewRows.map((r) => (
                    <li key={r.label} className="flex items-start justify-between gap-3">
                      <span className="font-medium">{r.label}</span>
                      <span className="text-muted-foreground">
                        {editorMode === "create" ? r.to : `${r.from} → ${r.to}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ConfirmDialog>

            <ConfirmDialog
              open={deleteConfirmOpen}
              onOpenChange={setDeleteConfirmOpen}
              title={
                deleteTarget?.id ? `Delete matchpoint #${deleteTarget.id}?` : "Delete matchpoint?"
              }
              description="This permanently deletes the matchpoint from Evergreen. This action cannot be undone."
              confirmText="Delete"
              variant="danger"
              onConfirm={confirmDelete}
              isLoading={isMutating}
            >
              {deleteTarget ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pickup OU</span>
                    <span>{deleteTarget.pickupOuName || "Any"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Group</span>
                    <span>{deleteTarget.usrGrpName || "Any"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Modifier</span>
                    <span className="font-mono text-xs">{deleteTarget.circModifier || "Any"}</span>
                  </div>
                </div>
              ) : null}
            </ConfirmDialog>

            {error ? (
              <EmptyState
                title="Could not load hold policies"
                description={String(error)}
                action={{ label: "Try again", onClick: () => void refetch(), icon: RefreshCw }}
              />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="rounded-2xl sm:col-span-2">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Matchpoints
                      </p>
                      <div className="text-2xl font-semibold mt-1">{matchpoints.length}</div>
                    </div>
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                      <BookMarked className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Strict OU match</CardTitle>
                  <CardDescription>Counts matchpoints requiring OU strictness.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Strict</span>
                    <span className="font-medium">
                      {matchpoints.filter((m) => m.strictOuMatch === true).length}
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Non-holdable</CardTitle>
                  <CardDescription>Policies that explicitly block holds.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Blocked</span>
                    <span className="font-medium">
                      {matchpoints.filter((m) => m.holdable === false).length}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Hold Matrix Matchpoints</CardTitle>
                <CardDescription>Evergreen: config.hold_matrix_matchpoint</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={columns}
                  data={matchpoints}
                  isLoading={isLoading}
                  searchPlaceholder="Search hold matchpoints..."
                  toolbar={
                    <Button size="sm" onClick={openCreate} disabled={isMutating}>
                      <Plus className="h-4 w-4 mr-2" />
                      New matchpoint
                    </Button>
                  }
                  emptyState={
                    <EmptyState
                      title="No matchpoints found"
                      description="Evergreen returned zero hold matchpoints."
                    />
                  }
                />
              </CardContent>
            </Card>
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
