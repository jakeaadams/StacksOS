"use client";
import { useCallback, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, BookOpen, Clock, DollarSign, Tag, Plus, Edit3, Trash2 } from "lucide-react";

import { useApi, useMutation } from "@/hooks";
import { featureFlags } from "@/lib/feature-flags";
import { PageContainer, PageHeader, PageContent, DataTable, EmptyState, ConfirmDialog, TableRowActions } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type CircMatchpoint = {
  id: number;
  active: boolean;
  orgUnit?: number | null;
  orgUnitName?: string | null;
  grp?: number | null;
  grpName?: string | null;
  circModifier?: string | null;
  copyLocation?: number | null;
  copyLocationName?: string | null;
  isRenewal?: unknown;
  refFlag?: unknown;
  circulate?: boolean;
  durationRule?: number | null;
  durationRuleName?: string | null;
  recurringFineRule?: number | null;
  recurringFineRuleName?: string | null;
  maxFineRule?: number | null;
  maxFineRuleName?: string | null;
  description?: string | null;
};

type CircMatchpointDraft = {
  active: boolean;
  orgUnit: number | null;
  grp: number | null;
  circModifier: string | null;
  copyLocation: number | null;
  isRenewal: boolean | null;
  refFlag: boolean | null;
  circulate: boolean;
  durationRule: number | null;
  recurringFineRule: number | null;
  maxFineRule: number | null;
  description: string;
};

const DEFAULT_MATCHPOINT_DRAFT: CircMatchpointDraft = {
  active: true,
  orgUnit: null,
  grp: null,
  circModifier: null,
  copyLocation: null,
  isRenewal: null,
  refFlag: null,
  circulate: true,
  durationRule: null,
  recurringFineRule: null,
  maxFineRule: null,
  description: "",
};

type DurationRule = {
  id: number;
  name: string;
  normal?: unknown;
  shrt?: unknown;
  extended?: unknown;
  maxRenewals?: unknown;
  maxAutoRenewals?: unknown;
};

type FineRule = {
  id: number;
  name: string;
  normal?: unknown;
  high?: unknown;
  low?: unknown;
  recurrenceInterval?: unknown;
  gracePeriod?: unknown;
};

type MaxFineRule = {
  id: number;
  name: string;
  amount?: unknown;
  isByPercent?: boolean;
};

type CircModifier = {
  code: string;
  name: string;
  description?: string;
  sip2MediaType?: string;
  magneticMedia?: boolean;
};

type OrgTreeNode = {
  id: number;
  name?: string | null;
  shortname?: string | null;
  children?: OrgTreeNode[];
};

type OrgOption = { id: number; label: string; depth: number };

type PermGroup = {
  id: number;
  name: string;
  parent?: number | null;
  parentName?: string | null;
  description?: string | null;
};

type CopyLocation = {
  id: number;
  name: string;
  owningLib?: number | null;
  owningLibShortname?: string | null;
  opacVisible?: boolean;
};

export default function CirculationPolicyEditorPage() {
  const policyEditorsEnabled = featureFlags.policyEditors;

  const circUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=circ&limit=500" : null;
  const durationUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=duration_rules" : null;
  const fineUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=fine_rules" : null;
  const maxFineUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=max_fine_rules" : null;
  const modifiersUrl = policyEditorsEnabled ? "/api/evergreen/circ-modifiers" : null;
  const orgTreeUrl = policyEditorsEnabled ? "/api/evergreen/org-tree" : null;
  const groupsUrl = policyEditorsEnabled ? "/api/evergreen/permissions?type=groups&limit=2000" : null;
  const copyLocationsUrl = policyEditorsEnabled ? "/api/evergreen/copy-locations?limit=5000" : null;

  const {
    data: circData,
    isLoading: circLoading,
    error: circError,
    refetch: refetchCirc,
  } = useApi<any>(circUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false });

  const {
    data: durationData,
    isLoading: durationLoading,
    error: durationError,
    refetch: refetchDuration,
  } = useApi<any>(durationUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false });

  const {
    data: fineData,
    isLoading: fineLoading,
    error: fineError,
    refetch: refetchFine,
  } = useApi<any>(fineUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false });

  const {
    data: maxFineData,
    isLoading: maxFineLoading,
    error: maxFineError,
    refetch: refetchMaxFine,
  } = useApi<any>(maxFineUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false });

  const {
    data: modifiersData,
    isLoading: modifiersLoading,
    error: modifiersError,
    refetch: refetchModifiers,
  } = useApi<any>(modifiersUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false });

  const {
    data: orgTreeData,
    isLoading: orgTreeLoading,
    error: orgTreeError,
    refetch: refetchOrgTree,
  } = useApi<any>(orgTreeUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false, revalidateInterval: 30 * 60_000 });

  const {
    data: groupsData,
    isLoading: groupsLoading,
    error: groupsError,
    refetch: refetchGroups,
  } = useApi<any>(groupsUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false, revalidateInterval: 30 * 60_000 });

  const {
    data: copyLocationsData,
    isLoading: copyLocationsLoading,
    error: copyLocationsError,
    refetch: refetchCopyLocations,
  } = useApi<any>(copyLocationsUrl, { immediate: policyEditorsEnabled, revalidateOnFocus: false, revalidateInterval: 30 * 60_000 });

  const matchpoints = useMemo<CircMatchpoint[]>(
    () => (Array.isArray(circData?.policies) ? (circData.policies as CircMatchpoint[]) : []),
    [circData?.policies]
  );
  const durationRules = useMemo<DurationRule[]>(
    () => (Array.isArray(durationData?.rules) ? (durationData.rules as DurationRule[]) : []),
    [durationData?.rules]
  );
  const fineRules = useMemo<FineRule[]>(
    () => (Array.isArray(fineData?.rules) ? (fineData.rules as FineRule[]) : []),
    [fineData?.rules]
  );
  const maxFineRules = useMemo<MaxFineRule[]>(
    () => (Array.isArray(maxFineData?.rules) ? (maxFineData.rules as MaxFineRule[]) : []),
    [maxFineData?.rules]
  );
  const circModifiers = useMemo<CircModifier[]>(
    () => (Array.isArray(modifiersData?.modifiers) ? (modifiersData.modifiers as CircModifier[]) : []),
    [modifiersData?.modifiers]
  );
  const orgTree: OrgTreeNode | null = (orgTreeData?.tree as OrgTreeNode | null) ?? null;
  const groups = useMemo<PermGroup[]>(
    () => (Array.isArray(groupsData?.groups) ? (groupsData.groups as PermGroup[]) : []),
    [groupsData?.groups]
  );
  const copyLocations = useMemo<CopyLocation[]>(
    () =>
      Array.isArray(copyLocationsData?.locations)
        ? (copyLocationsData.locations as CopyLocation[])
        : [],
    [copyLocationsData?.locations]
  );

  const handleRefresh = async () => {
    if (!policyEditorsEnabled) return;
    await Promise.allSettled([
      refetchCirc(),
      refetchDuration(),
      refetchFine(),
      refetchMaxFine(),
      refetchModifiers(),
      refetchOrgTree(),
      refetchGroups(),
      refetchCopyLocations(),
    ]);
  };

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

  const orgLabelById = useMemo(() => new Map(orgOptions.map((o) => [o.id, o.label])), [orgOptions]);
  const groupLabelById = useMemo(() => {
    const entries: Array<[number, string]> = [];
    for (const g of groups) {
      const id = toNumberOrNull(g.id);
      if (!id) continue;
      const label = (g.name || "").toString().trim();
      if (!label) continue;
      entries.push([id, label]);
    }
    return new Map(entries);
  }, [groups, toNumberOrNull]);
  const copyLocationLabelById = useMemo(() => {
    const entries: Array<[number, string]> = [];
    for (const loc of copyLocations) {
      const id = toNumberOrNull(loc.id);
      if (!id) continue;
      const label = (loc.name || "").toString().trim();
      if (!label) continue;
      entries.push([id, label]);
    }
    return new Map(entries);
  }, [copyLocations, toNumberOrNull]);
  const durationRuleById = useMemo(() => new Map(durationRules.map((r) => [r.id, r.name])), [durationRules]);
  const fineRuleById = useMemo(() => new Map(fineRules.map((r) => [r.id, r.name])), [fineRules]);
  const maxFineRuleById = useMemo(() => new Map(maxFineRules.map((r) => [r.id, r.name])), [maxFineRules]);
  const modifierByCode = useMemo(() => new Map(circModifiers.map((m) => [m.code, m.name])), [circModifiers]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<CircMatchpoint | null>(null);
  const [draft, setDraft] = useState<CircMatchpointDraft>(() => ({ ...DEFAULT_MATCHPOINT_DRAFT }));

  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CircMatchpoint | null>(null);

  const { mutateAsync: mutatePolicies, isLoading: isMutating } = useMutation<any>();

  const buildDraftFromMatchpoint = useCallback(
    (mp: CircMatchpoint): CircMatchpointDraft => ({
      active: Boolean(mp.active),
      orgUnit: toNumberOrNull(mp.orgUnit),
      grp: toNumberOrNull(mp.grp),
      circModifier: mp.circModifier ? String(mp.circModifier) : null,
      copyLocation: toNumberOrNull(mp.copyLocation),
      isRenewal: toTriBool(mp.isRenewal),
      refFlag: toTriBool(mp.refFlag),
      circulate: mp.circulate !== false,
      durationRule: toNumberOrNull(mp.durationRule),
      recurringFineRule: toNumberOrNull(mp.recurringFineRule),
      maxFineRule: toNumberOrNull(mp.maxFineRule),
      description: typeof mp.description === "string" ? mp.description : "",
    }),
    [toNumberOrNull, toTriBool]
  );

  const openCreate = useCallback(() => {
    setEditorMode("create");
    setEditing(null);
    setDraft({ ...DEFAULT_MATCHPOINT_DRAFT });
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback(
    (mp: CircMatchpoint) => {
      setEditorMode("edit");
      setEditing(mp);
      setDraft(buildDraftFromMatchpoint(mp));
      setEditorOpen(true);
    },
    [buildDraftFromMatchpoint]
  );

  const requestDelete = useCallback((mp: CircMatchpoint) => {
    setDeleteTarget(mp);
    setDeleteConfirmOpen(true);
  }, []);

  const formatTri = (value: boolean | null) => (value === null ? "Any" : value ? "Yes" : "No");
  const formatBool = (value: boolean) => (value ? "Yes" : "No");

  const previewRows = useMemo(() => {
    const base = editing ? buildDraftFromMatchpoint(editing) : DEFAULT_MATCHPOINT_DRAFT;

    const fmtId = (id: number | null, map: Map<number, string>, fallback: string) => {
      if (id === null) return "Any";
      const label = map.get(id);
      return label ? `${label} (#${id})` : fallback.replace("{id}", String(id));
    };

    const rows: Array<{ label: string; from: string; to: string; changed: boolean }> = [];
    const add = (label: string, from: string, to: string) => {
      rows.push({ label, from, to, changed: from !== to });
    };

    add("Active", formatBool(base.active), formatBool(draft.active));
    add("Org unit", fmtId(base.orgUnit, orgLabelById, "Org #{id}"), fmtId(draft.orgUnit, orgLabelById, "Org #{id}"));
    add("Patron group", fmtId(base.grp, groupLabelById, "Group #{id}"), fmtId(draft.grp, groupLabelById, "Group #{id}"));
    add(
      "Circ modifier",
      base.circModifier ? `${base.circModifier} — ${modifierByCode.get(base.circModifier) || "Unknown"}` : "Any",
      draft.circModifier ? `${draft.circModifier} — ${modifierByCode.get(draft.circModifier) || "Unknown"}` : "Any"
    );
    add("Copy location", fmtId(base.copyLocation, copyLocationLabelById, "Location #{id}"), fmtId(draft.copyLocation, copyLocationLabelById, "Location #{id}"));
    add("Circulate", formatBool(base.circulate), formatBool(draft.circulate));
    add("Is renewal", formatTri(base.isRenewal), formatTri(draft.isRenewal));
    add("Reference", formatTri(base.refFlag), formatTri(draft.refFlag));
    add("Duration rule", fmtId(base.durationRule, durationRuleById, "Rule #{id}"), fmtId(draft.durationRule, durationRuleById, "Rule #{id}"));
    add("Fine rule", fmtId(base.recurringFineRule, fineRuleById, "Rule #{id}"), fmtId(draft.recurringFineRule, fineRuleById, "Rule #{id}"));
    add("Max fine rule", fmtId(base.maxFineRule, maxFineRuleById, "Rule #{id}"), fmtId(draft.maxFineRule, maxFineRuleById, "Rule #{id}"));
    add("Description", base.description || "—", draft.description.trim() || "—");

    return rows.filter((r) => r.changed);
  }, [
    buildDraftFromMatchpoint,
    copyLocationLabelById,
    draft,
    durationRuleById,
    editing,
    fineRuleById,
    groupLabelById,
    maxFineRuleById,
    modifierByCode,
    orgLabelById,
  ]);

  const confirmSave = useCallback(async () => {
    if (editorMode === "create" && !draft.orgUnit) {
      toast.error("Organization unit is required.");
      return;
    }

    const action = editorMode === "create" ? "create" : "update";
    const data: Record<string, unknown> = {
      active: draft.active,
      orgUnit: draft.orgUnit,
      grp: draft.grp,
      circModifier: draft.circModifier,
      copyLocation: draft.copyLocation,
      isRenewal: draft.isRenewal,
      refFlag: draft.refFlag,
      circulate: draft.circulate,
      durationRule: draft.durationRule,
      recurringFineRule: draft.recurringFineRule,
      maxFineRule: draft.maxFineRule,
      description: draft.description.trim() ? draft.description.trim() : null,
    };
    if (editorMode === "edit" && editing?.id) {
      data.id = editing.id;
    }

    try {
      await mutatePolicies("/api/evergreen/policies", { action, type: "circ", data });
      await refetchCirc();
      toast.success(editorMode === "create" ? "Matchpoint created." : "Matchpoint updated.");
      setSaveConfirmOpen(false);
      setEditorOpen(false);
      setEditing(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save matchpoint";
      toast.error(message);
    }
  }, [draft, editorMode, editing, mutatePolicies, refetchCirc]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    try {
      await mutatePolicies("/api/evergreen/policies", { action: "delete", type: "circ", data: { id: deleteTarget.id } });
      await refetchCirc();
      toast.success(`Matchpoint #${deleteTarget.id} deleted.`);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete matchpoint";
      toast.error(message);
    }
  }, [deleteTarget, mutatePolicies, refetchCirc]);

  const matchpointColumns: ColumnDef<CircMatchpoint>[] = useMemo(
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
            <Badge variant="secondary" className="rounded-full">Inactive</Badge>
          ),
      },
      {
        accessorKey: "orgUnitName",
        header: "Org",
        cell: ({ row }) => <span className="truncate">{row.original.orgUnitName || "—"}</span>,
      },
      {
        accessorKey: "grpName",
        header: "Patron Group",
        cell: ({ row }) => <span className="truncate">{row.original.grpName || "Any"}</span>,
      },
      {
        accessorKey: "circModifier",
        header: "Circ Modifier",
        cell: ({ row }) =>
          row.original.circModifier ? (
            <Badge variant="outline" className="rounded-full">{row.original.circModifier}</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">Any</span>
          ),
      },
      {
        accessorKey: "copyLocationName",
        header: "Copy Location",
        cell: ({ row }) => <span className="truncate">{row.original.copyLocationName || "Any"}</span>,
      },
      {
        accessorKey: "durationRuleName",
        header: "Duration",
        cell: ({ row }) => <span className="truncate">{row.original.durationRuleName || "—"}</span>,
      },
      {
        accessorKey: "recurringFineRuleName",
        header: "Fine",
        cell: ({ row }) => <span className="truncate">{row.original.recurringFineRuleName || "—"}</span>,
      },
      {
        accessorKey: "maxFineRuleName",
        header: "Max Fine",
        cell: ({ row }) => <span className="truncate">{row.original.maxFineRuleName || "—"}</span>,
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

  const durationColumns: ColumnDef<DurationRule>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Rule",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name || `Rule ${row.original.id}`}</div>
            <div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div>
          </div>
        ),
      },
      {
        accessorKey: "normal",
        header: "Normal",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.normal ?? "—")}</span>,
      },
      {
        accessorKey: "shrt",
        header: "Short",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.shrt ?? "—")}</span>,
      },
      {
        accessorKey: "extended",
        header: "Extended",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.extended ?? "—")}</span>,
      },
      {
        accessorKey: "maxRenewals",
        header: "Renewals",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.maxRenewals ?? "—")}</span>,
      },
      {
        accessorKey: "maxAutoRenewals",
        header: "Auto-renew",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.maxAutoRenewals ?? "—")}</span>,
      },
    ],
    []
  );

  const fineColumns: ColumnDef<FineRule>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Rule",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name || `Rule ${row.original.id}`}</div>
            <div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div>
          </div>
        ),
      },
      {
        accessorKey: "normal",
        header: "Normal",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.normal ?? "—")}</span>,
      },
      {
        accessorKey: "high",
        header: "High",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.high ?? "—")}</span>,
      },
      {
        accessorKey: "low",
        header: "Low",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.low ?? "—")}</span>,
      },
      {
        accessorKey: "recurrenceInterval",
        header: "Interval",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.recurrenceInterval ?? "—")}</span>,
      },
      {
        accessorKey: "gracePeriod",
        header: "Grace",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.gracePeriod ?? "—")}</span>,
      },
    ],
    []
  );

  const maxFineColumns: ColumnDef<MaxFineRule>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Rule",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name || `Rule ${row.original.id}`}</div>
            <div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.amount ?? "—")}</span>,
      },
      {
        accessorKey: "isByPercent",
        header: "Type",
        cell: ({ row }) =>
          row.original.isByPercent ? (
            <Badge variant="secondary" className="rounded-full">Percent</Badge>
          ) : (
            <Badge variant="outline" className="rounded-full">Fixed</Badge>
          ),
      },
    ],
    []
  );

  const modifierColumns: ColumnDef<CircModifier>[] = useMemo(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "sip2MediaType",
        header: "SIP2",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sip2MediaType || "—"}</span>,
      },
      {
        accessorKey: "magneticMedia",
        header: "Magnetic",
        cell: ({ row }) =>
          row.original.magneticMedia ? (
            <Badge variant="secondary" className="rounded-full">Yes</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">No</span>
          ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => <span className="text-muted-foreground text-xs line-clamp-2">{row.original.description || "—"}</span>,
      },
    ],
    []
  );

  const hasError = Boolean(
    circError ||
      durationError ||
      fineError ||
      maxFineError ||
      modifiersError ||
      orgTreeError ||
      groupsError ||
      copyLocationsError
  );

  return (
    <PageContainer>
      <PageHeader
        title="Circulation Policies (Advanced)"
        subtitle="Evergreen-backed circulation matchpoints + rule tables. Writes are feature-flagged and audited."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Policy Editors" },
          { label: "Circulation" },
        ]}
        actions={policyEditorsEnabled ? [{ label: "Refresh", onClick: () => void handleRefresh(), icon: RefreshCw, variant: "outline" }] : undefined}
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
                if (!open) {
                  setEditing(null);
                }
              }}
            >
              <DialogContent className="sm:max-w-[980px]">
                <DialogHeader>
                  <DialogTitle>
                    {editorMode === "create"
                      ? "New circulation matchpoint"
                      : `Edit matchpoint #${editing?.id ?? "—"}`}
                  </DialogTitle>
                  <DialogDescription>
                    Writes apply immediately in Evergreen and are recorded in the StacksOS audit log.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4">
                      <div className="min-w-0">
                        <Label className="text-sm">Active</Label>
                        <p className="text-xs text-muted-foreground">Inactive matchpoints are ignored by Evergreen.</p>
                      </div>
                      <Switch
                        checked={draft.active}
                        onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, active: checked }))}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Org unit {editorMode === "create" ? "*" : ""}</Label>
                        <Select
                          value={draft.orgUnit ? String(draft.orgUnit) : "__unset__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({ ...prev, orgUnit: v === "__unset__" ? null : parseInt(v, 10) }))
                          }
                          disabled={orgTreeLoading || orgOptions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={orgTreeLoading ? "Loading…" : "Select org unit"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unset__" disabled>
                              Select org unit
                            </SelectItem>
                            {orgOptions.map((o) => (
                              <SelectItem key={o.id} value={String(o.id)}>
                                <div className="flex items-center gap-2">
                                  <span style={{ paddingLeft: o.depth * 12 }} className="truncate">
                                    {o.label}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Patron group</Label>
                        <Select
                          value={draft.grp ? String(draft.grp) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({ ...prev, grp: v === "__any__" ? null : parseInt(v, 10) }))
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
                        <Label>Circ modifier</Label>
                        <Select
                          value={draft.circModifier ?? "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({ ...prev, circModifier: v === "__any__" ? null : v }))
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
                        <Label>Copy location</Label>
                        <Select
                          value={draft.copyLocation ? String(draft.copyLocation) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({ ...prev, copyLocation: v === "__any__" ? null : parseInt(v, 10) }))
                          }
                          disabled={copyLocationsLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={copyLocationsLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {copyLocations
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((loc) => (
                                <SelectItem key={loc.id} value={String(loc.id)}>
                                  {loc.name}
                                  {loc.owningLibShortname ? (
                                    <span className="ml-2 text-xs text-muted-foreground">({loc.owningLibShortname})</span>
                                  ) : null}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4">
                        <div className="min-w-0">
                          <Label className="text-sm">Circulate</Label>
                          <p className="text-xs text-muted-foreground">If disabled, Evergreen blocks checkout.</p>
                        </div>
                        <Switch
                          checked={draft.circulate}
                          onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, circulate: checked }))}
                        />
                      </div>

                      <div className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Is renewal</Label>
                          <Select
                            value={draft.isRenewal === null ? "any" : draft.isRenewal ? "yes" : "no"}
                            onValueChange={(v) =>
                              setDraft((prev) => ({
                                ...prev,
                                isRenewal: v === "any" ? null : v === "yes",
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Reference</Label>
                          <Select
                            value={draft.refFlag === null ? "any" : draft.refFlag ? "yes" : "no"}
                            onValueChange={(v) =>
                              setDraft((prev) => ({
                                ...prev,
                                refFlag: v === "any" ? null : v === "yes",
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-28">
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
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Duration rule</Label>
                        <Select
                          value={draft.durationRule ? String(draft.durationRule) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({ ...prev, durationRule: v === "__any__" ? null : parseInt(v, 10) }))
                          }
                          disabled={durationLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={durationLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {durationRules.map((r) => (
                              <SelectItem key={r.id} value={String(r.id)}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Fine rule</Label>
                        <Select
                          value={draft.recurringFineRule ? String(draft.recurringFineRule) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              recurringFineRule: v === "__any__" ? null : parseInt(v, 10),
                            }))
                          }
                          disabled={fineLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={fineLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {fineRules.map((r) => (
                              <SelectItem key={r.id} value={String(r.id)}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Max fine rule</Label>
                        <Select
                          value={draft.maxFineRule ? String(draft.maxFineRule) : "__any__"}
                          onValueChange={(v) =>
                            setDraft((prev) => ({ ...prev, maxFineRule: v === "__any__" ? null : parseInt(v, 10) }))
                          }
                          disabled={maxFineLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={maxFineLoading ? "Loading…" : "Any"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__any__">Any</SelectItem>
                            {maxFineRules.map((r) => (
                              <SelectItem key={r.id} value={String(r.id)}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={draft.description}
                        onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="Optional notes (who/what this matchpoint is for)"
                        className="min-h-[90px]"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold">Preview changes</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review before saving. Permission required: <span className="font-mono">ADMIN_CIRC_MATRIX_MATCHPOINT</span>.
                    </p>
                    <div className="mt-4 space-y-2">
                      {previewRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No changes.</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {previewRows.map((r) => (
                            <li key={r.label} className="rounded-xl border border-border/70 bg-card p-3">
                              <div className="flex items-start justify-between gap-3">
                                <span className="font-medium">{r.label}</span>
                                <span className="text-xs text-muted-foreground">{editorMode === "create" ? "new" : "changed"}</span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {editorMode === "create" ? (
                                  <span>{r.to}</span>
                                ) : (
                                  <span>
                                    <span className="line-through">{r.from}</span> → <span className="text-foreground">{r.to}</span>
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
                  <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={isMutating}>
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
              title={editorMode === "create" ? "Create matchpoint?" : `Save changes to matchpoint #${editing?.id ?? "—"}?`}
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
                      <span className="text-muted-foreground">{editorMode === "create" ? r.to : `${r.from} → ${r.to}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ConfirmDialog>

            <ConfirmDialog
              open={deleteConfirmOpen}
              onOpenChange={setDeleteConfirmOpen}
              title={deleteTarget?.id ? `Delete matchpoint #${deleteTarget.id}?` : "Delete matchpoint?"}
              description="This permanently deletes the matchpoint from Evergreen. This action cannot be undone."
              confirmText="Delete"
              variant="danger"
              onConfirm={confirmDelete}
              isLoading={isMutating}
            >
              {deleteTarget ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Org</span>
                    <span>{deleteTarget.orgUnitName || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Group</span>
                    <span>{deleteTarget.grpName || "Any"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Modifier</span>
                    <span className="font-mono text-xs">{deleteTarget.circModifier || "Any"}</span>
                  </div>
                </div>
              ) : null}
            </ConfirmDialog>

            {hasError ? (
              <EmptyState
                title="Could not load circulation policies"
                description={String(
                  circError ||
                    durationError ||
                    fineError ||
                    maxFineError ||
                    modifiersError ||
                    orgTreeError ||
                    groupsError ||
                    copyLocationsError
                )}
                action={{ label: "Try again", onClick: () => void handleRefresh(), icon: RefreshCw }}
              />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Matchpoints</p>
                      <div className="text-2xl font-semibold mt-1">{matchpoints.length}</div>
                    </div>
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                      <BookOpen className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Duration Rules</p>
                      <div className="text-2xl font-semibold mt-1">{durationRules.length}</div>
                    </div>
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                      <Clock className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Fine Rules</p>
                      <div className="text-2xl font-semibold mt-1">{fineRules.length}</div>
                    </div>
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-700">
                      <DollarSign className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Circ Modifiers</p>
                      <div className="text-2xl font-semibold mt-1">{circModifiers.length}</div>
                    </div>
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-600">
                      <Tag className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Configuration</CardTitle>
                <CardDescription>
                  Read from Evergreen. Matchpoint writes are feature-flagged and audited.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="matchpoints">
                  <TabsList className="flex flex-wrap">
                    <TabsTrigger value="matchpoints">Matchpoints</TabsTrigger>
                    <TabsTrigger value="duration">Duration</TabsTrigger>
                    <TabsTrigger value="fine">Fine</TabsTrigger>
                    <TabsTrigger value="maxFine">Max Fine</TabsTrigger>
                    <TabsTrigger value="modifiers">Circ Modifiers</TabsTrigger>
                  </TabsList>

	              <TabsContent value="matchpoints" className="mt-4">
	                <DataTable
	                  columns={matchpointColumns}
	                  data={matchpoints}
	                  isLoading={circLoading}
	                  searchPlaceholder="Search matchpoints..."
	                  toolbar={
	                    <Button size="sm" onClick={openCreate} disabled={isMutating}>
	                      <Plus className="h-4 w-4 mr-2" />
	                      New matchpoint
	                    </Button>
	                  }
	                  emptyState={
	                    <EmptyState
	                      title="No matchpoints found"
	                      description="Evergreen returned zero circulation matchpoints."
	                    />
	                  }
	                  caption="Evergreen: config.circ_matrix_matchpoint"
	                />
	              </TabsContent>

              <TabsContent value="duration" className="mt-4">
                <DataTable
                  columns={durationColumns}
                  data={durationRules}
                  isLoading={durationLoading}
                  searchPlaceholder="Search duration rules..."
                  emptyState={
                    <EmptyState
                      title="No duration rules found"
                      description="Evergreen returned zero duration rules."
                    />
                  }
                  caption="Evergreen: config.rule_circ_duration"
                />
              </TabsContent>

              <TabsContent value="fine" className="mt-4">
                <DataTable
                  columns={fineColumns}
                  data={fineRules}
                  isLoading={fineLoading}
                  searchPlaceholder="Search fine rules..."
                  emptyState={
                    <EmptyState
                      title="No fine rules found"
                      description="Evergreen returned zero recurring fine rules."
                    />
                  }
                  caption="Evergreen: config.rule_recurring_fine"
                />
              </TabsContent>

              <TabsContent value="maxFine" className="mt-4">
                <DataTable
                  columns={maxFineColumns}
                  data={maxFineRules}
                  isLoading={maxFineLoading}
                  searchPlaceholder="Search max fine rules..."
                  emptyState={
                    <EmptyState
                      title="No max fine rules found"
                      description="Evergreen returned zero maximum fine rules."
                    />
                  }
                  caption="Evergreen: config.rule_max_fine"
                />
              </TabsContent>

              <TabsContent value="modifiers" className="mt-4">
                <DataTable
                  columns={modifierColumns}
                  data={circModifiers}
                  isLoading={modifiersLoading}
                  searchPlaceholder="Search circ modifiers..."
                  emptyState={
                    <EmptyState
                      title="No circ modifiers found"
                      description="Evergreen returned zero circ modifiers."
                    />
                  }
                  caption="Evergreen: config.circ_modifier"
                />

                {!featureFlags.policyEditors ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Editing tools are disabled. Set `NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1` to enable advanced admin tooling.
                  </div>
                ) : null}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
