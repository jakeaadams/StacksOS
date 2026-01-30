"use client";

import { useCallback, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  StatusBadge,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Calendar, Play, Pause, Mail, RefreshCw, Plus } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

interface ScheduledReport {
  id: string;
  name: string;
  apiAction: string;
  schedule: string;
  nextRun: string;
  lastRun: string | null;
  status: "active" | "paused" | "error";
  email?: string;
}

export default function ScheduledReportsPage() {
  const [reports, setReports] = useState<ScheduledReport[]>([
    {
      id: "1",
      name: "Daily Circulation Summary",
      apiAction: "dashboard",
      schedule: "Daily at 6:00 AM",
      nextRun: "2026-01-31T06:00:00.000Z",
      lastRun: "2026-01-30T06:00:00.000Z",
      status: "active",
      email: "reports@library.org",
    },
    {
      id: "2",
      name: "Weekly Overdue Report",
      apiAction: "overdue",
      schedule: "Mondays at 8:00 AM",
      nextRun: "2026-02-02T08:00:00.000Z",
      lastRun: "2026-01-26T08:00:00.000Z",
      status: "active",
      email: "circ@library.org",
    },
    {
      id: "3",
      name: "Monthly Holds Statistics",
      apiAction: "holds",
      schedule: "1st of month at 7:00 AM",
      nextRun: "2026-02-01T07:00:00.000Z",
      lastRun: null,
      status: "paused",
    },
  ]);

  const handleToggleStatus = (report: ScheduledReport) => {
    setReports(prev => prev.map(r =>
      r.id === report.id
        ? { ...r, status: r.status === "active" ? "paused" as const : "active" as const }
        : r
    ));
    toast.success(
      report.status === "active" ? "Report paused" : "Report activated",
      { description: report.name }
    );
  };

  const handleRunNow = async (report: ScheduledReport) => {
    try {
      const response = await fetchWithAuth(`/api/evergreen/reports?action=${report.apiAction}`);
      const data = await response.json();

      if (data.ok) {
        setReports(prev => prev.map(r =>
          r.id === report.id
            ? { ...r, lastRun: new Date().toISOString() }
            : r
        ));
        toast.success("Report executed", { description: report.name });
      } else {
        toast.error("Report failed", { description: data.error });
      }
    } catch (error) {
      toast.error("Report failed");
    }
  };

  const columns: ColumnDef<ScheduledReport>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Report",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.schedule}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "nextRun",
      header: "Next Run",
      cell: ({ row }) => new Date(row.original.nextRun).toLocaleDateString(),
    },
    {
      accessorKey: "lastRun",
      header: "Last Run",
      cell: ({ row }) => row.original.lastRun
        ? new Date(row.original.lastRun).toLocaleDateString()
        : "\u2014",
    },
    {
      accessorKey: "email",
      header: "Email To",
      cell: ({ row }) => row.original.email ? (
        <span className="inline-flex items-center gap-1 text-xs">
          <Mail className="h-3 w-3" />
          {row.original.email}
        </span>
      ) : "\u2014",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          label={row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
          status={
            row.original.status === "active" ? "success" :
            row.original.status === "paused" ? "pending" : "error"
          }
        />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleRunNow(row.original)}
            title="Run now"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleToggleStatus(row.original)}
            title={row.original.status === "active" ? "Pause" : "Resume"}
          >
            {row.original.status === "active" ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </div>
      ),
    },
  ], []);

  return (
    <PageContainer>
      <PageHeader
        title="Scheduled Reports"
        subtitle="Automated report generation and delivery."
        breadcrumbs={[
          { label: "Reports", href: "/staff/reports" },
          { label: "Scheduled" },
        ]}
        actions={[
          {
            label: "Add Schedule",
            onClick: () => toast.info("Scheduling requires Evergreen reporter configuration"),
            icon: Plus,
          },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled</p>
                  <div className="text-2xl font-semibold mt-1">{reports.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <Calendar className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
                  <div className="text-2xl font-semibold mt-1">
                    {reports.filter(r => r.status === "active").length}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                  <Play className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Paused</p>
                  <div className="text-2xl font-semibold mt-1">
                    {reports.filter(r => r.status === "paused").length}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600">
                  <Pause className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Scheduled Reports</CardTitle>
            <CardDescription>Reports that run automatically on a schedule.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={reports}
              searchable={true}
              searchPlaceholder="Search scheduled reports..."
              paginated={reports.length > 10}
              emptyState={
                <EmptyState
                  title="No scheduled reports"
                  description="Schedule a report to run automatically."
                />
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">About Scheduled Reports</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Scheduled reports run automatically at specified intervals. Results can be emailed to
              staff members or stored for later download. Full scheduling functionality requires
              configuration in the Evergreen reporting system.
            </p>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
