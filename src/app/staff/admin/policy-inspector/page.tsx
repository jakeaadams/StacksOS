"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";

import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  PermissionDeniedState,
  EmptyState,
  LoadingSpinner,
  StatusBadge,
} from "@/components/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Settings2, ArrowLeft } from "lucide-react";

type PolicySetting = {
  key: string;
  label: string;
  description: string;
  category: string;
  value: unknown;
  resolution: string;
  resolvedAtOrgId: number;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(not set)";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.length > 120 ? value.slice(0, 120) + "..." : value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function PolicyInspectorPage() {
  const router = useRouter();
  const { orgs, user } = useAuth();

  const [orgId, setOrgId] = useState<number | null>(null);

  useEffect(() => {
    if (!orgId && user?.activeOrgId) {
      setOrgId(user.activeOrgId);
      return;
    }
    if (!orgId && orgs.length > 0) {
      setOrgId(orgs[0]!.id);
    }
  }, [orgId, orgs, user?.activeOrgId]);

  const url = orgId ? `/api/evergreen/settings?org_id=${orgId}` : null;

  const { data, error, isLoading, refetch } = useApi<{ orgId: number; settings: PolicySetting[] }>(
    url,
    {
      immediate: !!orgId,
      deps: [orgId],
    }
  );

  const rows = useMemo(() => data?.settings || [], [data]);

  const columns = useMemo<ColumnDef<PolicySetting>[]>(
    () => [
      {
        accessorKey: "label",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Setting" />,
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium">{row.original.label}</div>
            <div className="text-xs text-muted-foreground font-mono">{row.original.key}</div>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => (
          <span className="text-xs rounded-full border px-2 py-0.5">{row.original.category}</span>
        ),
      },
      {
        accessorKey: "value",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">
            {formatValue(row.original.value)}
          </span>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">
            {row.original.resolution} @ {row.original.resolvedAtOrgId}
          </span>
        ),
      },
      {
        id: "change",
        header: "Change",
        cell: () => (
          <Link
            href="/staff/help#evergreen-setup"
            className="text-xs text-[hsl(var(--brand-1))] hover:underline"
          >
            Evergreen admin
          </Link>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.description}</span>
        ),
      },
    ],
    []
  );

  const apiError = error instanceof ApiError ? error : null;
  const missingPerms = Array.isArray((apiError?.details as Record<string, any>)?.missing)
    ? ((apiError?.details as Record<string, any>).missing as string[])
    : [];
  const requestId =
    typeof (apiError?.details as Record<string, any>)?.requestId === "string"
      ? ((apiError?.details as Record<string, any>).requestId as string)
      : null;

  return (
    <PageContainer>
      <PageHeader
        title="Policy Inspector"
        subtitle="Read-only view of key Evergreen org settings (resolved via ancestor defaults)."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Policy Inspector" },
        ]}
        actions={[
          {
            label: "Back",
            onClick: () => router.push("/staff/admin"),
            icon: ArrowLeft,
            variant: "outline",
          },
          {
            label: "Refresh",
            onClick: () => void refetch(),
            icon: Settings2,
            variant: "default",
          },
        ]}
      />

      <PageContent className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Context
            </CardTitle>
            <CardDescription>
              Values are fetched using Evergreen `ou_setting.ancestor_default.batch`.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Org / Service Location</div>
              <Select
                value={orgId ? String(orgId) : ""}
                onValueChange={(value) => setOrgId(parseInt(value, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select org" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Evergreen</div>
              <div className="flex items-center gap-2">
                <StatusBadge label="Resolved" status="success" />
                <span className="text-xs text-muted-foreground">ancestor_default</span>
              </div>
              {requestId && (
                <div className="text-xs text-muted-foreground font-mono">req {requestId}</div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Staff Session</div>
              <div className="text-sm">
                <div className="font-medium">
                  {user?.displayName || user?.username || "(unknown)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {user?.workstation || "(no workstation)"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {apiError?.status === 403 ? (
          <PermissionDeniedState
            title="Permission denied"
            message="You do not have the required Evergreen permissions to view settings."
            missing={missingPerms}
            requestId={requestId || undefined}
          />
        ) : apiError?.status === 401 ? (
          <EmptyState
            title="Session expired"
            description="Please log in again to continue."
            action={{ label: "Go to login", onClick: () => router.push("/login") }}
          />
        ) : isLoading ? (
          <LoadingSpinner message="Loading settings..." />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchable={true}
            searchPlaceholder="Search settings..."
            emptyState={
              <EmptyState
                title="No settings"
                description="No settings returned for this org (or none are configured)."
                action={{ label: "Refresh", onClick: () => void refetch() }}
              />
            }
          />
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Where do I change these?</CardTitle>
            <CardDescription>
              This inspector is read-only in P1 starter mode. To change policies today, use the
              Evergreen admin tools.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>
              Evergreen staff client:{" "}
              <span className="font-mono">https://&lt;evergreen-ip&gt;/eg/staff/</span>
            </div>
            <div>
              Typical path: Administration -&gt; Local Administration -&gt; Organizational Units /
              Settings
            </div>
            <div className="pt-2">
              <Button variant="outline" onClick={() => router.push("/staff/help#evergreen-setup")}>
                Open setup guide
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
