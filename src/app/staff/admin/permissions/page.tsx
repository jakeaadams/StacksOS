"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/contexts/auth-context";
import { useApi, useMutation } from "@/hooks";
import { featureFlags } from "@/lib/feature-flags";

import {
  PageContainer,
  PageHeader,
  PageContent,
  LoadingSpinner,
  EmptyState,
  StatusBadge,
  DataTable,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Shield,
  ExternalLink,
  Plus,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

import type { PermGroup, GroupPerm, EvergreenPermission } from "./_components/permissions-types";
import { SECTIONS } from "./_components/permissions-types";
import { useGroupColumns, useGroupPermColumns } from "./_components/permissions-columns";
import { PermissionsDialogs } from "./_components/PermissionsDialogs";

export default function PermissionsInspectorPage() {
  const { user } = useAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const allPerms = useMemo(() => {
    const uniq = new Set<string>(["GROUP_APPLICATION_PERM"]);
    SECTIONS.flatMap((s) => s.items).forEach((p) => uniq.add(p.code));
    return Array.from(uniq);
  }, []);

  const permsQuery = useMemo(() => encodeURIComponent(allPerms.join(",")), [allPerms]);
  const {
    data: permData,
    isLoading,
    error,
    refetch,
  } = useApi<any>(`/api/evergreen/perm-check?perms=${permsQuery}`, {
    immediate: true,
    revalidateOnFocus: false,
    revalidateInterval: 5 * 60_000,
  });

  const perms: Record<string, boolean> = permData?.perms || {};
  const evergreenOrgId = permData?.orgId ?? null;
  const canEdit = Boolean(perms["GROUP_APPLICATION_PERM"]);

  const groupsUrl = featureFlags.permissionsExplorer
    ? "/api/evergreen/permissions?type=groups&limit=500"
    : null;
  const {
    data: groupsData,
    isLoading: groupsLoading,
    error: groupsError,
    refetch: refetchGroups,
  } = useApi<any>(groupsUrl, { immediate: true, revalidateOnFocus: false });
  const groups = useMemo<PermGroup[]>(
    () => (Array.isArray(groupsData?.groups) ? (groupsData.groups as PermGroup[]) : []),
    [groupsData?.groups]
  );

  const groupPermsUrl =
    featureFlags.permissionsExplorer && selectedGroupId
      ? `/api/evergreen/permissions?type=group_perms&group_id=${selectedGroupId}&limit=1000`
      : null;
  const {
    data: groupPermsData,
    isLoading: groupPermsLoading,
    error: groupPermsError,
    refetch: refetchGroupPerms,
  } = useApi<any>(groupPermsUrl, { immediate: true, revalidateOnFocus: false });
  const groupPerms = useMemo<GroupPerm[]>(
    () =>
      Array.isArray(groupPermsData?.groupPerms) ? (groupPermsData.groupPerms as GroupPerm[]) : [],
    [groupPermsData?.groupPerms]
  );

  const permissionsUrl = featureFlags.permissionsExplorer
    ? "/api/evergreen/permissions?type=permissions&limit=2000"
    : null;
  const {
    data: permissionsData,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useApi<any>(permissionsUrl, {
    immediate: true,
    revalidateOnFocus: false,
    revalidateInterval: 30 * 60_000,
  });
  const permissions = useMemo<EvergreenPermission[]>(
    () =>
      Array.isArray(permissionsData?.permissions)
        ? (permissionsData.permissions as EvergreenPermission[])
        : [],
    [permissionsData?.permissions]
  );

  const selectedGroup: PermGroup | null = useMemo(
    () => (!selectedGroupId ? null : groups.find((g) => g.id === selectedGroupId) || null),
    [groups, selectedGroupId]
  );
  const { mutateAsync: mutatePermissions, isLoading: isMutating } = useMutation<any, any>({
    onError: (err) => toast.error(err.message),
  });

  // --- Group dialog state ---
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<"create" | "edit">("create");
  const [groupDraft, setGroupDraft] = useState<{
    id: number | null;
    name: string;
    parent: number | null;
    description: string;
    applicationPerm: string;
  }>({ id: null, name: "", parent: null, description: "", applicationPerm: "" });

  const openCreateGroup = useCallback(() => {
    setGroupDialogMode("create");
    setGroupDraft({ id: null, name: "", parent: null, description: "", applicationPerm: "" });
    setGroupDialogOpen(true);
  }, []);
  const openEditGroup = useCallback((group: PermGroup) => {
    setGroupDialogMode("edit");
    setGroupDraft({
      id: group.id,
      name: group.name || "",
      parent: typeof group.parent === "number" ? group.parent : null,
      description: group.description || "",
      applicationPerm: group.application_perm || "",
    });
    setGroupDialogOpen(true);
  }, []);

  const handleSaveGroup = useCallback(async () => {
    if (!canEdit) {
      toast.error("Missing permission: GROUP_APPLICATION_PERM");
      return;
    }
    if (!groupDraft.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    const payload = {
      name: groupDraft.name.trim(),
      parent: groupDraft.parent,
      description: groupDraft.description.trim() || null,
      applicationPerm: groupDraft.applicationPerm.trim() || null,
    };
    if (groupDialogMode === "create") {
      const res = await mutatePermissions("/api/evergreen/permissions", {
        type: "group",
        action: "create",
        data: payload,
      });
      const createdId = typeof res?.id === "number" ? res.id : parseInt(String(res?.id ?? ""), 10);
      toast.success("Permission group created");
      await refetchGroups();
      if (Number.isFinite(createdId)) setSelectedGroupId(createdId);
      setGroupDialogOpen(false);
      return;
    }
    if (!groupDraft.id) {
      toast.error("Group ID is missing");
      return;
    }
    await mutatePermissions("/api/evergreen/permissions", {
      type: "group",
      action: "update",
      data: { id: groupDraft.id, ...payload },
    });
    toast.success("Permission group updated");
    await refetchGroups();
    setGroupDialogOpen(false);
  }, [canEdit, groupDraft, groupDialogMode, mutatePermissions, refetchGroups]);

  // --- Mapping dialog state ---
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingDialogMode, setMappingDialogMode] = useState<"add" | "edit">("add");
  const [mappingDraft, setMappingDraft] = useState<{
    id: number | null;
    permId: number | null;
    depth: number;
    grantable: boolean;
  }>({ id: null, permId: null, depth: 0, grantable: false });
  const [permPickerOpen, setPermPickerOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GroupPerm | null>(null);

  const assignedPermIds = useMemo(
    () => new Set<number>(groupPerms.map((gp) => gp.perm)),
    [groupPerms]
  );
  const availablePermissions = useMemo(
    () =>
      permissions
        .filter((p) => !assignedPermIds.has(p.id))
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    [permissions, assignedPermIds]
  );
  const selectedPerm = useMemo(
    () =>
      !mappingDraft.permId ? null : permissions.find((p) => p.id === mappingDraft.permId) || null,
    [permissions, mappingDraft.permId]
  );

  const openAddMapping = useCallback(() => {
    if (!selectedGroupId) return;
    setMappingDialogMode("add");
    setMappingDraft({ id: null, permId: null, depth: 0, grantable: false });
    setMappingDialogOpen(true);
  }, [selectedGroupId]);
  const openEditMapping = useCallback((mapping: GroupPerm) => {
    const depthParsed = parseInt(String(mapping.depth ?? "0"), 10);
    setMappingDialogMode("edit");
    setMappingDraft({
      id: mapping.id,
      permId: mapping.perm,
      depth: Number.isFinite(depthParsed) ? depthParsed : 0,
      grantable: Boolean(mapping.grantable),
    });
    setMappingDialogOpen(true);
  }, []);
  const requestRemoveMapping = useCallback((mapping: GroupPerm) => {
    setRemoveTarget(mapping);
    setRemoveDialogOpen(true);
  }, []);

  const handleSaveMapping = useCallback(async () => {
    if (!canEdit) {
      toast.error("Missing permission: GROUP_APPLICATION_PERM");
      return;
    }
    if (mappingDialogMode === "add") {
      if (!selectedGroupId) {
        toast.error("Select a group first");
        return;
      }
      if (!mappingDraft.permId) {
        toast.error("Select a permission to add");
        return;
      }
      await mutatePermissions("/api/evergreen/permissions", {
        type: "group_perm",
        action: "add",
        data: {
          grp: selectedGroupId,
          perm: mappingDraft.permId,
          depth: mappingDraft.depth,
          grantable: mappingDraft.grantable,
        },
      });
      toast.success("Permission added to group");
      await refetchGroupPerms();
      setMappingDialogOpen(false);
      return;
    }
    if (!mappingDraft.id) {
      toast.error("Mapping ID is missing");
      return;
    }
    await mutatePermissions("/api/evergreen/permissions", {
      type: "group_perm",
      action: "update",
      data: { id: mappingDraft.id, depth: mappingDraft.depth, grantable: mappingDraft.grantable },
    });
    toast.success("Mapping updated");
    await refetchGroupPerms();
    setMappingDialogOpen(false);
  }, [
    canEdit,
    mappingDialogMode,
    mappingDraft,
    mutatePermissions,
    refetchGroupPerms,
    selectedGroupId,
  ]);

  const handleRemoveMapping = useCallback(async () => {
    if (!canEdit) {
      toast.error("Missing permission: GROUP_APPLICATION_PERM");
      return;
    }
    if (!removeTarget) return;
    await mutatePermissions("/api/evergreen/permissions", {
      type: "group_perm",
      action: "remove",
      data: { id: removeTarget.id },
    });
    toast.success("Permission removed from group");
    await refetchGroupPerms();
    setRemoveDialogOpen(false);
    setRemoveTarget(null);
  }, [canEdit, mutatePermissions, refetchGroupPerms, removeTarget]);

  // --- Column hooks ---
  const groupColumns = useGroupColumns({ canEdit, onEdit: openEditGroup });
  const groupPermColumns = useGroupPermColumns({
    canEdit,
    onEdit: openEditMapping,
    onRemove: requestRemoveMapping,
  });

  return (
    <PageContainer>
      <PageHeader
        title="Permissions Inspector"
        subtitle="See what your account can do (Evergreen-backed) and where to configure it."
        breadcrumbs={[{ label: "Administration", href: "/staff/admin" }, { label: "Permissions" }]}
        actions={[
          { label: "Refresh", onClick: () => void refetch(), icon: RefreshCw, variant: "outline" },
        ]}
      >
        <StatusBadge
          label={user?.profileName ? `Role: ${user.profileName}` : "Role: \u2014"}
          status="info"
        />
        {evergreenOrgId ? (
          <Badge variant="secondary" className="rounded-full">
            Work-perms at OU {evergreenOrgId}
          </Badge>
        ) : null}
      </PageHeader>

      <PageContent className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Your session</CardTitle>
            <CardDescription>
              Role/profile names come from Evergreen permission groups.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">User</span>
              <span className="font-medium">{user?.displayName || "\u2014"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Username</span>
              <span className="font-mono text-xs">{user?.username || "\u2014"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Home library</span>
              <span className="font-medium">{user?.homeLibrary || "\u2014"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Active org</span>
              <span className="font-medium">{user?.activeOrgName || "\u2014"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Workstation</span>
              <span className="font-mono text-xs">{user?.workstation || "\u2014"}</span>
            </div>
          </CardContent>
        </Card>

        {isLoading ? <LoadingSpinner message="Checking permissions..." /> : null}
        {error ? (
          <EmptyState
            title="Could not check permissions"
            description={String(error)}
            action={{ label: "Try again", onClick: () => void refetch(), icon: RefreshCw }}
          />
        ) : null}

        {!isLoading && !error ? (
          <div className="grid gap-4">
            {SECTIONS.map((section) => (
              <Card key={section.title} className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    {section.title}
                  </CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.items.map((item) => {
                    const allowed = Boolean(perms[item.code]);
                    return (
                      <div
                        key={item.code}
                        className="rounded-xl border border-border/70 bg-muted/10 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">{item.label}</div>
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground font-mono">
                              {item.code}
                            </div>
                          </div>
                          <Badge
                            variant={allowed ? "default" : "secondary"}
                            className="rounded-full"
                          >
                            {allowed ? (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Allowed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <XCircle className="h-3.5 w-3.5" /> Denied
                              </span>
                            )}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Configure: {item.evergreenHint}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Next steps</CardTitle>
            <CardDescription>Make StacksOS-first admin possible.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <div>
              If a permission is denied and you expected it to be allowed, update the user&apos;s
              permission group in Evergreen, then re-login to refresh the session.
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/staff/admin/policy-inspector">
                  Policy Inspector <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/staff/admin/users">
                  Staff Users <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {featureFlags.permissionsExplorer ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">
                Evergreen permission groups (experimental)
              </CardTitle>
              <CardDescription>
                Browse (and optionally edit) Evergreen permission groups and assigned permissions.
                Editing requires the Evergreen permission{" "}
                <span className="font-mono text-xs">GROUP_APPLICATION_PERM</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupsError ? (
                <EmptyState
                  title="Could not load permission groups"
                  description={String(groupsError)}
                  action={{
                    label: "Try again",
                    onClick: () => void refetchGroups(),
                    icon: RefreshCw,
                  }}
                />
              ) : null}

              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                    <KeyRound className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {canEdit ? "Editing enabled" : "Read-only mode"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Changes are applied immediately in Evergreen. Use with care.
                    </div>
                    {permissionsError ? (
                      <div className="mt-2 text-xs text-destructive">
                        Could not load full permissions list. &quot;Add permission&quot; may be
                        unavailable.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Groups</div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => void refetchGroups()}>
                        <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                      </Button>
                      {canEdit ? (
                        <Button size="sm" onClick={openCreateGroup}>
                          <Plus className="h-4 w-4 mr-2" /> New group
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <DataTable
                    columns={groupColumns}
                    data={groups}
                    isLoading={groupsLoading}
                    searchPlaceholder="Search groups..."
                    paginated={groups.length > 25}
                    defaultPageSize={25}
                    onRowClick={(row) => setSelectedGroupId(row.id)}
                    getRowClassName={(row) =>
                      row.id === selectedGroupId
                        ? "bg-[hsl(var(--brand-1))]/10 border-[hsl(var(--brand-1))]/20"
                        : ""
                    }
                    emptyState={
                      <EmptyState
                        title="No groups found"
                        description="Evergreen returned zero permission groups."
                      />
                    }
                  />
                </div>

                <div className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">
                      Group permissions
                      {selectedGroupId
                        ? ` (group #${selectedGroupId}${selectedGroup?.name ? ` \u2014 ${selectedGroup.name}` : ""})`
                        : ""}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refetchGroupPerms()}
                        disabled={!selectedGroupId}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                      </Button>
                      {canEdit ? (
                        <Button
                          size="sm"
                          onClick={openAddMapping}
                          disabled={!selectedGroupId || permissionsLoading || !!permissionsError}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Add permission
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {!selectedGroupId ? (
                    <EmptyState
                      title="Select a group"
                      description="Pick a permission group to view its assigned permissions."
                    />
                  ) : groupPermsError ? (
                    <EmptyState
                      title="Could not load group permissions"
                      description={String(groupPermsError)}
                      action={{
                        label: "Try again",
                        onClick: () => void refetchGroupPerms(),
                        icon: RefreshCw,
                      }}
                    />
                  ) : (
                    <DataTable
                      columns={groupPermColumns}
                      data={groupPerms}
                      isLoading={groupPermsLoading}
                      searchPlaceholder="Search permissions..."
                      paginated={groupPerms.length > 25}
                      defaultPageSize={25}
                      emptyState={
                        <EmptyState
                          title="No permissions found"
                          description="Evergreen returned zero permissions for this group."
                        />
                      }
                    />
                  )}
                </div>
              </div>

              <PermissionsDialogs
                groupDialogOpen={groupDialogOpen}
                setGroupDialogOpen={setGroupDialogOpen}
                groupDialogMode={groupDialogMode}
                groupDraft={groupDraft}
                setGroupDraft={setGroupDraft}
                groups={groups}
                onSaveGroup={() => void handleSaveGroup()}
                canEdit={canEdit}
                isMutating={isMutating}
                mappingDialogOpen={mappingDialogOpen}
                setMappingDialogOpen={setMappingDialogOpen}
                mappingDialogMode={mappingDialogMode}
                mappingDraft={mappingDraft}
                setMappingDraft={setMappingDraft}
                selectedGroup={selectedGroup}
                selectedGroupId={selectedGroupId}
                selectedPerm={selectedPerm}
                availablePermissions={availablePermissions}
                permPickerOpen={permPickerOpen}
                setPermPickerOpen={setPermPickerOpen}
                permissionsLoading={permissionsLoading}
                permissionsError={permissionsError}
                onSaveMapping={() => void handleSaveMapping()}
                removeDialogOpen={removeDialogOpen}
                setRemoveDialogOpen={setRemoveDialogOpen}
                removeTarget={removeTarget}
                onRemoveMapping={() => void handleRemoveMapping()}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Evergreen permission groups</CardTitle>
              <CardDescription>
                Enable experimental tooling to browse Evergreen groups and perms.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Set <span className="font-mono text-xs">NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1</span> to
              enable the permissions explorer.
            </CardContent>
          </Card>
        )}
      </PageContent>
    </PageContainer>
  );
}
