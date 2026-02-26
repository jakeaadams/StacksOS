"use client";
import { useCallback, useMemo, useState } from "react";
import { RefreshCw, BookOpen, Clock, DollarSign, Tag, Plus } from "lucide-react";

import { useApi, useMutation } from "@/hooks";
import { featureFlags } from "@/lib/feature-flags";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  ConfirmDialog,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import type {
  CircMatchpoint,
  CircMatchpointDraft,
  DurationRule,
  FineRule,
  MaxFineRule,
  CircModifier,
  OrgTreeNode,
  OrgOption,
  PermGroup,
  CopyLocation,
} from "./_components/policy-types";
import {
  useMatchpointColumns,
  useDurationColumns,
  useFineColumns,
  useMaxFineColumns,
  useModifierColumns,
} from "./_components/policy-columns";
import { MatchpointEditorDialog } from "./_components/MatchpointEditorDialog";

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

export default function CirculationPolicyEditorPage() {
  const policyEditorsEnabled = featureFlags.policyEditors;

  const circUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=circ&limit=500" : null;
  const durationUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=duration_rules" : null;
  const fineUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=fine_rules" : null;
  const maxFineUrl = policyEditorsEnabled ? "/api/evergreen/policies?type=max_fine_rules" : null;
  const modifiersUrl = policyEditorsEnabled ? "/api/evergreen/circ-modifiers" : null;
  const orgTreeUrl = policyEditorsEnabled ? "/api/evergreen/org-tree" : null;
  const groupsUrl = policyEditorsEnabled
    ? "/api/evergreen/permissions?type=groups&limit=2000"
    : null;
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
  } = useApi<any>(orgTreeUrl, {
    immediate: policyEditorsEnabled,
    revalidateOnFocus: false,
    revalidateInterval: 30 * 60_000,
  });
  const {
    data: groupsData,
    isLoading: groupsLoading,
    error: groupsError,
    refetch: refetchGroups,
  } = useApi<any>(groupsUrl, {
    immediate: policyEditorsEnabled,
    revalidateOnFocus: false,
    revalidateInterval: 30 * 60_000,
  });
  const {
    data: copyLocationsData,
    isLoading: copyLocationsLoading,
    error: copyLocationsError,
    refetch: refetchCopyLocations,
  } = useApi<any>(copyLocationsUrl, {
    immediate: policyEditorsEnabled,
    revalidateOnFocus: false,
    revalidateInterval: 30 * 60_000,
  });

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
    () =>
      Array.isArray(modifiersData?.modifiers) ? (modifiersData.modifiers as CircModifier[]) : [],
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
  const durationRuleById = useMemo(
    () => new Map(durationRules.map((r) => [r.id, r.name])),
    [durationRules]
  );
  const fineRuleById = useMemo(() => new Map(fineRules.map((r) => [r.id, r.name])), [fineRules]);
  const maxFineRuleById = useMemo(
    () => new Map(maxFineRules.map((r) => [r.id, r.name])),
    [maxFineRules]
  );
  const modifierByCode = useMemo(
    () => new Map(circModifiers.map((m) => [m.code, m.name])),
    [circModifiers]
  );

  // --- Editor state ---
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

  // --- Column hooks ---
  const matchpointColumns = useMatchpointColumns({ onEdit: openEdit, onDelete: requestDelete });
  const durationColumns = useDurationColumns();
  const fineColumns = useFineColumns();
  const maxFineColumns = useMaxFineColumns();
  const modifierColumns = useModifierColumns();

  // --- Preview rows for the editor ---
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
    add(
      "Org unit",
      fmtId(base.orgUnit, orgLabelById, "Org #{id}"),
      fmtId(draft.orgUnit, orgLabelById, "Org #{id}")
    );
    add(
      "Patron group",
      fmtId(base.grp, groupLabelById, "Group #{id}"),
      fmtId(draft.grp, groupLabelById, "Group #{id}")
    );
    add(
      "Circ modifier",
      base.circModifier
        ? `${base.circModifier} — ${modifierByCode.get(base.circModifier) || "Unknown"}`
        : "Any",
      draft.circModifier
        ? `${draft.circModifier} — ${modifierByCode.get(draft.circModifier) || "Unknown"}`
        : "Any"
    );
    add(
      "Copy location",
      fmtId(base.copyLocation, copyLocationLabelById, "Location #{id}"),
      fmtId(draft.copyLocation, copyLocationLabelById, "Location #{id}")
    );
    add("Circulate", formatBool(base.circulate), formatBool(draft.circulate));
    add("Is renewal", formatTri(base.isRenewal), formatTri(draft.isRenewal));
    add("Reference", formatTri(base.refFlag), formatTri(draft.refFlag));
    add(
      "Duration rule",
      fmtId(base.durationRule, durationRuleById, "Rule #{id}"),
      fmtId(draft.durationRule, durationRuleById, "Rule #{id}")
    );
    add(
      "Fine rule",
      fmtId(base.recurringFineRule, fineRuleById, "Rule #{id}"),
      fmtId(draft.recurringFineRule, fineRuleById, "Rule #{id}")
    );
    add(
      "Max fine rule",
      fmtId(base.maxFineRule, maxFineRuleById, "Rule #{id}"),
      fmtId(draft.maxFineRule, maxFineRuleById, "Rule #{id}")
    );
    add("Description", base.description || "\u2014", draft.description.trim() || "\u2014");

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

  // --- Save / Delete handlers ---
  const confirmSave = useCallback(async () => {
    if (editorMode === "create" && !draft.orgUnit) {
      toast.error("Organization unit is required.");
      return;
    }
    const action = editorMode === "create" ? "create" : "update";
    const data: Record<string, any> = {
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
    if (editorMode === "edit" && editing?.id) data.id = editing.id;
    try {
      await mutatePolicies("/api/evergreen/policies", { action, type: "circ", data });
      await refetchCirc();
      toast.success(editorMode === "create" ? "Matchpoint created." : "Matchpoint updated.");
      setSaveConfirmOpen(false);
      setEditorOpen(false);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save matchpoint");
    }
  }, [draft, editorMode, editing, mutatePolicies, refetchCirc]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    try {
      await mutatePolicies("/api/evergreen/policies", {
        action: "delete",
        type: "circ",
        data: { id: deleteTarget.id },
      });
      await refetchCirc();
      toast.success(`Matchpoint #${deleteTarget.id} deleted.`);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete matchpoint");
    }
  }, [deleteTarget, mutatePolicies, refetchCirc]);

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
        actions={
          policyEditorsEnabled
            ? [
                {
                  label: "Refresh",
                  onClick: () => void handleRefresh(),
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
            <MatchpointEditorDialog
              open={editorOpen}
              onOpenChange={(open) => {
                setEditorOpen(open);
                if (!open) setEditing(null);
              }}
              mode={editorMode}
              editingId={editing?.id ?? null}
              draft={draft}
              setDraft={setDraft}
              onSave={() => setSaveConfirmOpen(true)}
              isMutating={isMutating}
              previewRows={previewRows}
              orgOptions={orgOptions}
              orgTreeLoading={orgTreeLoading}
              groups={groups}
              groupsLoading={groupsLoading}
              circModifiers={circModifiers}
              modifiersLoading={modifiersLoading}
              copyLocations={copyLocations}
              copyLocationsLoading={copyLocationsLoading}
              durationRules={durationRules}
              durationLoading={durationLoading}
              fineRules={fineRules}
              fineLoading={fineLoading}
              maxFineRules={maxFineRules}
              maxFineLoading={maxFineLoading}
            />

            <ConfirmDialog
              open={saveConfirmOpen}
              onOpenChange={setSaveConfirmOpen}
              title={
                editorMode === "create"
                  ? "Create matchpoint?"
                  : `Save changes to matchpoint #${editing?.id ?? "\u2014"}?`
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
                        {editorMode === "create" ? r.to : `${r.from} \u2192 ${r.to}`}
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
                    <span className="text-muted-foreground">Org</span>
                    <span>{deleteTarget.orgUnitName || "\u2014"}</span>
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
                action={{
                  label: "Try again",
                  onClick: () => void handleRefresh(),
                  icon: RefreshCw,
                }}
              />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Matchpoints
                      </p>
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
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Duration Rules
                      </p>
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
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Fine Rules
                      </p>
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
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Circ Modifiers
                      </p>
                      <div className="text-2xl font-semibold mt-1">{circModifiers.length}</div>
                    </div>
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-indigo-500/10 text-indigo-600">
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
                        Editing tools are disabled. Set `NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1` to
                        enable advanced admin tooling.
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
