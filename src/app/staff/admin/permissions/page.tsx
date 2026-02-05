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
  ConfirmDialog,
  TableRowActions,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { CheckCircle2, XCircle, RefreshCw, Shield, ExternalLink, Plus, Edit3, Trash2, KeyRound } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

type PermissionItem = {
  code: string;
  label: string;
  description: string;
  evergreenHint: string;
};

type PermissionSection = {
  title: string;
  description: string;
  items: PermissionItem[];
};

type PermGroup = {
  id: number;
  name: string;
  parent?: number | null;
  parentName?: string | null;
  description?: string | null;
  application_perm?: string | null;
};

type GroupPerm = {
  id: number;
  grp: number;
  perm: number;
  permCode?: string | null;
  permDescription?: string | null;
  depth?: unknown;
  grantable?: boolean;
};

type EvergreenPermission = {
  id: number;
  code: string;
  description?: string | null;
};

const SECTIONS: PermissionSection[] = [
  {
    title: "Circulation",
    description: "Checkout/checkin, holds, claims, payments, overrides.",
    items: [
      {
        code: "COPY_CHECKOUT",
        label: "Checkout items",
        description: "Allows staff to check out copies to patrons.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "COPY_CHECKIN",
        label: "Checkin items",
        description: "Allows staff to check in copies and trigger routing decisions.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "CIRC_OVERRIDE_DUE_DATE",
        label: "Override due date",
        description: "Allows overriding due dates when policy blocks a checkout.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation overrides",
      },
      {
        code: "MARK_ITEM_CLAIMS_RETURNED",
        label: "Mark claims returned",
        description: "Allows resolving claims returned and related stop-fines states.",
        evergreenHint: "Evergreen Admin → Permission Groups → circulation perms",
      },
      {
        code: "MAKE_PAYMENTS",
        label: "Take payments",
        description: "Allows posting payments and waives (where configured).",
        evergreenHint: "Evergreen Admin → Permission Groups → money perms",
      },
      {
        code: "REFUND_PAYMENT",
        label: "Refund payments",
        description: "Allows refunding a payment transaction.",
        evergreenHint: "Evergreen Admin → Permission Groups → money perms",
      },
    ],
  },
  {
    title: "Patrons",
    description: "Create/edit patrons, blocks/penalties, notes.",
    items: [
      {
        code: "CREATE_USER",
        label: "Create patrons",
        description: "Allows creating new patron accounts.",
        evergreenHint: "Evergreen Admin → Permission Groups → patron perms",
      },
      {
        code: "UPDATE_USER",
        label: "Edit patrons",
        description: "Allows editing patron core fields and addresses.",
        evergreenHint: "Evergreen Admin → Permission Groups → patron perms",
      },
      {
        code: "VIEW_USER",
        label: "View staff users",
        description: "Allows listing and searching staff accounts (Administration → Users).",
        evergreenHint: "Evergreen Admin → Permission Groups → staff/admin perms",
      },
    ],
  },
  {
    title: "Cataloging",
    description: "MARC, holdings, item status.",
    items: [
      {
        code: "CREATE_MARC",
        label: "Create / import bibliographic records",
        description: "Allows creating new bib records and importing MARC.",
        evergreenHint: "Evergreen Admin → Permission Groups → cataloging perms",
      },
      {
        code: "UPDATE_MARC",
        label: "Edit MARC",
        description: "Allows updating MARC for existing bib records.",
        evergreenHint: "Evergreen Admin → Permission Groups → cataloging perms",
      },
      {
        code: "ADMIN_COPY_STATUS",
        label: "Manage item statuses",
        description: "Allows editing copy statuses and related status flags.",
        evergreenHint: "Evergreen Admin → Local Administration → Copy Statuses",
      },
    ],
  },
  {
    title: "Acquisitions",
    description: "P.O.s, receiving, cancel/claim.",
    items: [
      {
        code: "VIEW_FUND",
        label: "View funds",
        description: "Allows viewing acquisitions funds.",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions perms",
      },
      {
        code: "VIEW_PROVIDER",
        label: "View vendors",
        description: "Allows viewing vendor/provider records.",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions perms",
      },
      {
        code: "ADMIN_ACQ_CLAIM",
        label: "Claim lineitems",
        description: "Allows claiming acquisitions lineitems (vendor follow-up).",
        evergreenHint: "Evergreen Admin → Permission Groups → acquisitions admin perms",
      },
    ],
  },
  {
    title: "Administration",
    description: "Workstations, org settings, server admin.",
    items: [
      {
        code: "ADMIN_WORKSTATION",
        label: "Manage workstations",
        description: "Allows registering and managing circulation workstations.",
        evergreenHint: "Evergreen Admin → Local Administration → Workstations",
      },
      {
        code: "ADMIN_ORG_UNIT",
        label: "Manage org units",
        description: "Allows editing org units and settings inheritance.",
        evergreenHint: "Evergreen Admin → Server Administration → Org Units",
      },
    ],
  },
];

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
    () => (Array.isArray(groupPermsData?.groupPerms) ? (groupPermsData.groupPerms as GroupPerm[]) : []),
    [groupPermsData?.groupPerms]
  );

  const permissionsUrl = featureFlags.permissionsExplorer
    ? "/api/evergreen/permissions?type=permissions&limit=2000"
    : null;

  const {
    data: permissionsData,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useApi<any>(permissionsUrl, { immediate: true, revalidateOnFocus: false, revalidateInterval: 30 * 60_000 });

  const permissions = useMemo<EvergreenPermission[]>(
    () =>
      Array.isArray(permissionsData?.permissions)
        ? (permissionsData.permissions as EvergreenPermission[])
        : [],
    [permissionsData?.permissions]
  );

  const selectedGroup: PermGroup | null = useMemo(() => {
    if (!selectedGroupId) return null;
    return groups.find((g) => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  const { mutateAsync: mutatePermissions, isLoading: isMutating } = useMutation<any, any>({
    onError: (err) => toast.error(err.message),
  });

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<"create" | "edit">("create");
  const [groupDraft, setGroupDraft] = useState<{
    id: number | null;
    name: string;
    parent: number | null;
    description: string;
    applicationPerm: string;
  }>({
    id: null,
    name: "",
    parent: null,
    description: "",
    applicationPerm: "",
  });

  const openCreateGroup = useCallback(() => {
    setGroupDialogMode("create");
    setGroupDraft({
      id: null,
      name: "",
      parent: null,
      description: "",
      applicationPerm: "",
    });
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
      if (Number.isFinite(createdId)) {
        setSelectedGroupId(createdId);
      }
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

  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingDialogMode, setMappingDialogMode] = useState<"add" | "edit">("add");
  const [mappingDraft, setMappingDraft] = useState<{
    id: number | null;
    permId: number | null;
    depth: number;
    grantable: boolean;
  }>({
    id: null,
    permId: null,
    depth: 0,
    grantable: false,
  });

  const [permPickerOpen, setPermPickerOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GroupPerm | null>(null);

  const assignedPermIds = useMemo(() => new Set<number>(groupPerms.map((gp) => gp.perm)), [groupPerms]);
  const availablePermissions = useMemo(() => {
    return permissions
      .filter((p) => !assignedPermIds.has(p.id))
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [permissions, assignedPermIds]);

  const selectedPerm = useMemo(() => {
    if (!mappingDraft.permId) return null;
    return permissions.find((p) => p.id === mappingDraft.permId) || null;
  }, [permissions, mappingDraft.permId]);

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
      data: {
        id: mappingDraft.id,
        depth: mappingDraft.depth,
        grantable: mappingDraft.grantable,
      },
    });
    toast.success("Mapping updated");
    await refetchGroupPerms();
    setMappingDialogOpen(false);
  }, [canEdit, mappingDialogMode, mappingDraft, mutatePermissions, refetchGroupPerms, selectedGroupId]);

  const requestRemoveMapping = useCallback((mapping: GroupPerm) => {
    setRemoveTarget(mapping);
    setRemoveDialogOpen(true);
  }, []);

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

  const groupColumns: ColumnDef<PermGroup>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Group",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name || `Group ${row.original.id}`}</div>
            <div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div>
            {row.original.parentName ? (
              <div className="text-[11px] text-muted-foreground truncate">Parent: {row.original.parentName}</div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "application_perm",
        header: "App Perm",
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.original.application_perm || "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          if (!canEdit) return null;
          return (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <TableRowActions
                actions={[
                  {
                    id: "edit",
                    label: "Edit group",
                    icon: Edit3,
                    onClick: () => openEditGroup(row.original),
                  },
                ]}
                quickActions={["edit"]}
              />
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [canEdit, openEditGroup]
  );

  const groupPermColumns: ColumnDef<GroupPerm>[] = useMemo(
    () => [
      {
        accessorKey: "permCode",
        header: "Permission",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-mono text-xs truncate">{row.original.permCode || `perm #${row.original.perm}`}</div>
            <div className="text-[11px] text-muted-foreground line-clamp-2">
              {row.original.permDescription || "—"}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "depth",
        header: "Depth",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.depth ?? "—")}</span>,
      },
      {
        accessorKey: "grantable",
        header: "Grantable",
        cell: ({ row }) =>
          row.original.grantable ? (
            <Badge className="rounded-full">Yes</Badge>
          ) : (
            <Badge variant="secondary" className="rounded-full">No</Badge>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          if (!canEdit) return null;
          return (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <TableRowActions
                actions={[
                  {
                    id: "edit",
                    label: "Edit mapping",
                    icon: Edit3,
                    onClick: () => openEditMapping(row.original),
                  },
                  {
                    id: "remove",
                    label: "Remove from group",
                    icon: Trash2,
                    variant: "destructive",
                    onClick: () => requestRemoveMapping(row.original),
                  },
                ]}
                quickActions={["edit"]}
              />
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [canEdit, openEditMapping, requestRemoveMapping]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Permissions Inspector"
        subtitle="See what your account can do (Evergreen-backed) and where to configure it."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Permissions" },
        ]}
        actions={[
          { label: "Refresh", onClick: () => void refetch(), icon: RefreshCw, variant: "outline" },
        ]}
      >
        <StatusBadge
          label={user?.profileName ? `Role: ${user.profileName}` : "Role: —"}
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
            <CardDescription>Role/profile names come from Evergreen permission groups.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">User</span>
              <span className="font-medium">{user?.displayName || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Username</span>
              <span className="font-mono text-xs">{user?.username || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Home library</span>
              <span className="font-medium">{user?.homeLibrary || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Active org</span>
              <span className="font-medium">{user?.activeOrgName || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Workstation</span>
              <span className="font-mono text-xs">{user?.workstation || "—"}</span>
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
                          <div className="flex items-center gap-2">
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
              If a permission is denied and you expected it to be allowed, update the user’s permission group in
              Evergreen, then re-login to refresh the session.
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
              <CardTitle className="text-base">Evergreen permission groups (experimental)</CardTitle>
              <CardDescription>
                Browse (and optionally edit) Evergreen permission groups and assigned permissions. Editing requires the
                Evergreen permission <span className="font-mono text-xs">GROUP_APPLICATION_PERM</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupsError ? (
                <EmptyState
                  title="Could not load permission groups"
                  description={String(groupsError)}
                  action={{ label: "Try again", onClick: () => void refetchGroups(), icon: RefreshCw }}
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
                        Could not load full permissions list. “Add permission” may be unavailable.
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
                      row.id === selectedGroupId ? "bg-[hsl(var(--brand-1))]/10 border-[hsl(var(--brand-1))]/20" : ""
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
                      {selectedGroupId ? ` (group #${selectedGroupId}${selectedGroup?.name ? ` — ${selectedGroup.name}` : ""})` : ""}
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
                      action={{ label: "Try again", onClick: () => void refetchGroupPerms(), icon: RefreshCw }}
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

              <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
                <DialogContent className="sm:max-w-[560px]">
                  <DialogHeader>
                    <DialogTitle>
                      {groupDialogMode === "create" ? "Create permission group" : "Edit permission group"}
                    </DialogTitle>
                    <DialogDescription>
                      Changes apply immediately in Evergreen. Use a test group first if you are unsure.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="pgt-name">Name</Label>
                      <Input
                        id="pgt-name"
                        value={groupDraft.name}
                        onChange={(e) => setGroupDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="e.g., Circulation Supervisor"
                        disabled={isMutating}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Parent group</Label>
                      <Select
                        value={groupDraft.parent ? String(groupDraft.parent) : "none"}
                        onValueChange={(v) =>
                          setGroupDraft((d) => ({ ...d, parent: v === "none" ? null : parseInt(v, 10) }))
                        }
                        disabled={isMutating}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="No parent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No parent</SelectItem>
                          {groups
                            .filter((g) => g.id !== groupDraft.id)
                            .map((g) => (
                              <SelectItem key={g.id} value={String(g.id)}>
                                {g.name || `Group ${g.id}`} (#{g.id})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="pgt-app">Application perm (optional)</Label>
                      <Input
                        id="pgt-app"
                        value={groupDraft.applicationPerm}
                        onChange={(e) => setGroupDraft((d) => ({ ...d, applicationPerm: e.target.value }))}
                        placeholder="e.g., GROUP_APPLICATION_PERM"
                        disabled={isMutating}
                      />
                      <div className="text-xs text-muted-foreground">
                        Controls who can administer this group in Evergreen.
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="pgt-desc">Description</Label>
                      <Textarea
                        id="pgt-desc"
                        value={groupDraft.description}
                        onChange={(e) => setGroupDraft((d) => ({ ...d, description: e.target.value }))}
                        placeholder="Optional notes about when to use this group."
                        disabled={isMutating}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setGroupDialogOpen(false)} disabled={isMutating}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => void handleSaveGroup()}
                      disabled={isMutating || !canEdit || !groupDraft.name.trim()}
                    >
                      {groupDialogMode === "create" ? "Create" : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={mappingDialogOpen}
                onOpenChange={(open) => {
                  setMappingDialogOpen(open);
                  if (!open) setPermPickerOpen(false);
                }}
              >
                <DialogContent className="sm:max-w-[560px]">
                  <DialogHeader>
                    <DialogTitle>
                      {mappingDialogMode === "add" ? "Add permission to group" : "Edit permission mapping"}
                    </DialogTitle>
                    <DialogDescription>
                      Depth and grantable behavior follow Evergreen semantics.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label>Group</Label>
                      <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                        {selectedGroup?.name ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{selectedGroup.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">#{selectedGroup.id}</span>
                          </div>
                        ) : selectedGroupId ? (
                          <span className="font-mono text-xs text-muted-foreground">#{selectedGroupId}</span>
                        ) : (
                          <span className="text-muted-foreground">Select a group first</span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Permission</Label>
                      {mappingDialogMode === "edit" ? (
                        <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                          <div className="font-mono text-xs">{selectedPerm?.code || `perm #${mappingDraft.permId ?? "—"}`}</div>
                          {selectedPerm?.description ? (
                            <div className="mt-1 text-[11px] text-muted-foreground">{selectedPerm.description}</div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {selectedPerm ? (
                              <>
                                <div className="font-mono text-xs truncate">{selectedPerm.code}</div>
                                {selectedPerm.description ? (
                                  <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                                    {selectedPerm.description}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div className="text-sm text-muted-foreground">No permission selected</div>
                            )}
                          </div>
                          <Button
                            type="button"
	                            variant="outline"
	                            size="sm"
	                            onClick={() => setPermPickerOpen((v) => !v)}
	                            disabled={isMutating || permissionsLoading || !!permissionsError || availablePermissions.length === 0}
	                          >
	                            {permPickerOpen ? "Hide" : "Select"}
	                          </Button>
                        </div>
                      )}
                    </div>

                    {mappingDialogMode === "add" && permPickerOpen ? (
                      <div className="rounded-xl border border-border/70 overflow-hidden">
                        <Command>
                          <CommandInput placeholder="Search permissions..." />
                          <CommandList className="max-h-64">
                            <CommandEmpty>No permissions found.</CommandEmpty>
                            <CommandGroup heading={`Available (${availablePermissions.length})`}>
                              {availablePermissions.map((p) => (
                                <CommandItem
                                  key={p.id}
                                  value={`${p.code} ${p.description || ""}`}
                                  onSelect={() => {
                                    setMappingDraft((d) => ({ ...d, permId: p.id }));
                                    setPermPickerOpen(false);
                                  }}
                                >
                                  <div className="min-w-0">
                                    <div className="font-mono text-xs">{p.code}</div>
                                    {p.description ? (
                                      <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                                        {p.description}
                                      </div>
                                    ) : null}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </div>
                    ) : null}

                    <div className="grid gap-2">
                      <Label htmlFor="pgpm-depth">Depth</Label>
                      <Input
                        id="pgpm-depth"
                        type="number"
                        value={String(mappingDraft.depth)}
                        onChange={(e) =>
                          setMappingDraft((d) => ({
                            ...d,
                            depth: Number.isFinite(parseInt(e.target.value, 10)) ? parseInt(e.target.value, 10) : 0,
                          }))
                        }
                        disabled={isMutating}
                      />
                      <div className="text-xs text-muted-foreground">
                        Use <span className="font-mono text-xs">0</span> for default depth. Evergreen uses this for scoping.
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">Grantable</div>
                        <div className="text-xs text-muted-foreground">
                          Allow this group to grant the permission to other groups.
                        </div>
                      </div>
                      <Switch
                        checked={mappingDraft.grantable}
                        onCheckedChange={(v) => setMappingDraft((d) => ({ ...d, grantable: v }))}
                        disabled={isMutating}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMappingDialogOpen(false)} disabled={isMutating}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => void handleSaveMapping()}
                      disabled={isMutating || !canEdit || (mappingDialogMode === "add" && !mappingDraft.permId)}
                    >
                      {mappingDialogMode === "add" ? "Add" : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <ConfirmDialog
                open={removeDialogOpen}
                onOpenChange={setRemoveDialogOpen}
                title="Remove permission from group?"
                description="This removes the mapping from the selected Evergreen permission group."
                variant="danger"
                confirmText="Remove"
                isLoading={isMutating}
                onConfirm={() => void handleRemoveMapping()}
              >
                <div className="text-sm">
                  <div className="font-mono text-xs">{removeTarget?.permCode || `perm #${removeTarget?.perm ?? "—"}`}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Group: {selectedGroup?.name ? `${selectedGroup.name} (#${selectedGroup.id})` : selectedGroupId ? `#${selectedGroupId}` : "—"}
                  </div>
                </div>
              </ConfirmDialog>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Evergreen permission groups</CardTitle>
              <CardDescription>Enable experimental tooling to browse Evergreen groups and perms.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Set <span className="font-mono text-xs">NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1</span> to enable the permissions explorer.
            </CardContent>
          </Card>
        )}
      </PageContent>
    </PageContainer>
  );
}
