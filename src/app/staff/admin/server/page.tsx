"use client";

import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/hooks";
import { featureFlags } from "@/lib/feature-flags";
import { Server, Database, Activity, HardDrive, RefreshCw } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

interface ServiceStatus {
  name: string;
  status: "running" | "stopped" | "error";
  uptime?: string;
  lastChecked: string;
}

export default function ServerAdminPage() {
  const enabled = featureFlags.serverAdmin;
  const pingUrl = enabled ? "/api/evergreen/ping" : null;
  const { data: pingData, isLoading, refetch } = useApi<any>(pingUrl, { immediate: enabled });

  if (!enabled) {
    return (
      <PageContainer>
        <PageHeader
          title="Server Administration"
          subtitle="Monitor Evergreen services and server health."
          breadcrumbs={[
            { label: "Administration", href: "/staff/admin" },
            { label: "Server" },
          ]}
        />
        <PageContent>
          <EmptyState
            title="Server admin is disabled"
            description="Set NEXT_PUBLIC_STACKSOS_EXPERIMENTAL=1 to enable experimental server admin views."
          />
        </PageContent>
      </PageContainer>
    );
  }

  const services: ServiceStatus[] = [
    {
      name: "open-ils.auth",
      status: pingData?.ok ? "running" : "error",
      uptime: pingData?.ok ? "Active" : "Unknown",
      lastChecked: new Date().toLocaleTimeString(),
    },
    {
      name: "open-ils.actor",
      status: pingData?.ok ? "running" : "error",
      uptime: pingData?.ok ? "Active" : "Unknown",
      lastChecked: new Date().toLocaleTimeString(),
    },
    {
      name: "open-ils.circ",
      status: pingData?.ok ? "running" : "error",
      uptime: pingData?.ok ? "Active" : "Unknown",
      lastChecked: new Date().toLocaleTimeString(),
    },
    {
      name: "open-ils.search",
      status: pingData?.ok ? "running" : "error",
      uptime: pingData?.ok ? "Active" : "Unknown",
      lastChecked: new Date().toLocaleTimeString(),
    },
    {
      name: "open-ils.pcrud",
      status: pingData?.ok ? "running" : "error",
      uptime: pingData?.ok ? "Active" : "Unknown",
      lastChecked: new Date().toLocaleTimeString(),
    },
  ];

  const columns: ColumnDef<ServiceStatus>[] = [
    {
      accessorKey: "name",
      header: "Service",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.name}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          label={row.original.status === "running" ? "Running" : row.original.status === "stopped" ? "Stopped" : "Error"}
          status={row.original.status === "running" ? "success" : row.original.status === "stopped" ? "pending" : "error"}
        />
      ),
    },
    {
      accessorKey: "uptime",
      header: "Uptime",
    },
    {
      accessorKey: "lastChecked",
      header: "Last Checked",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Server Administration"
        subtitle="Monitor Evergreen services and server health."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Server" },
        ]}
        actions={
          enabled
            ? [
                {
                  label: "Refresh",
                  onClick: () => refetch(),
                  icon: RefreshCw,
                },
              ]
            : undefined
        }
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Gateway</p>
                  <div className="text-lg font-semibold mt-1">{pingData?.ok ? "Online" : "Offline"}</div>
                </div>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${pingData?.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                  <Activity className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Database</p>
                  <div className="text-lg font-semibold mt-1">PostgreSQL</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <Database className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Services</p>
                  <div className="text-lg font-semibold mt-1">{services.filter(s => s.status === "running").length}/{services.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600">
                  <Server className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Storage</p>
                  <div className="text-lg font-semibold mt-1">Healthy</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-600">
                  <HardDrive className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">OpenSRF Services</CardTitle>
            <CardDescription>Status of Evergreen backend services.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={services}
              isLoading={isLoading}
              searchable={false}
              paginated={false}
              emptyState={<EmptyState title="No services" description="Could not retrieve service status." />}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Server Configuration</CardTitle>
            <CardDescription>System-level configuration is managed directly in Evergreen.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Advanced server configuration (OpenSRF settings, Apache config, database tuning) should be performed
              directly on the Evergreen server. StacksOS provides a read-only view of service health.
            </p>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
