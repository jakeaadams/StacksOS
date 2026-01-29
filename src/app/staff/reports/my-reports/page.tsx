"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  StatusBadge,
  LoadingSpinner,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchWithAuth } from "@/lib/client-fetch";
import { FolderOpen, Play, Download, Clock, FileText, RefreshCw } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { exportToCSV, generateExportFilename } from "@/lib/csv";

interface SavedReport {
  id: string;
  name: string;
  templateName: string;
  apiAction: string;
  lastRun: string | null;
  status: "ready" | "running" | "completed" | "failed";
  data?: any;
}

export default function MyReportsPage() {
  const [reports, setReports] = useState<SavedReport[]>([
    {
      id: "1",
      name: "Daily Stats",
      templateName: "Dashboard Statistics",
      apiAction: "dashboard",
      lastRun: null,
      status: "ready",
    },
    {
      id: "2",
      name: "Holds Report",
      templateName: "Holds Summary",
      apiAction: "holds",
      lastRun: null,
      status: "ready",
    },
    {
      id: "3",
      name: "Overdue Items",
      templateName: "Overdue Items Report",
      apiAction: "overdue",
      lastRun: null,
      status: "ready",
    },
  ]);
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleRunReport = async (report: SavedReport) => {
    setRunningId(report.id);
    setReports(prev => prev.map(r =>
      r.id === report.id ? { ...r, status: "running" as const } : r
    ));

    try {
      const response = await fetchWithAuth(`/api/evergreen/reports?action=${report.apiAction}`);
      const data = await response.json();

      if (data.ok) {
        setReports(prev => prev.map(r =>
          r.id === report.id ? {
            ...r,
            status: "completed" as const,
            lastRun: new Date().toISOString(),
            data,
          } : r
        ));
        toast.success("Report generated", { description: report.name });
      } else {
        setReports(prev => prev.map(r =>
          r.id === report.id ? { ...r, status: "failed" as const } : r
        ));
        toast.error("Report failed", { description: data.error });
      }
    } catch (error) {
      setReports(prev => prev.map(r =>
        r.id === report.id ? { ...r, status: "failed" as const } : r
      ));
      toast.error("Report failed");
    } finally {
      setRunningId(null);
    }
  };

  const handleDownload = async (report: SavedReport) => {
    if (!report.data) {
      toast.error("Run the report first");
      return;
    }

    try {
      const flatData = report.data.stats ? [report.data.stats] :
                       report.data.holds ? [report.data.holds] :
                       report.data.overdue || [report.data];
      
      exportToCSV(generateExportFilename(report.name), flatData);
      toast.success("Downloaded", { description: `${report.name}.csv` });
    } catch (error) {
      toast.error("Download failed");
    }
  };

  const columns: ColumnDef<SavedReport>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Report Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.templateName}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "lastRun",
      header: "Last Run",
      cell: ({ row }) => row.original.lastRun
        ? new Date(row.original.lastRun).toLocaleString()
        : "\u2014",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          label={row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
          status={
            row.original.status === "completed" ? "success" :
            row.original.status === "running" ? "pending" :
            row.original.status === "failed" ? "error" : "pending"
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
            onClick={() => handleRunReport(row.original)}
            disabled={runningId === row.original.id}
            title="Run report"
          >
            {runningId === row.original.id ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="sr-only">Run report</span>
          </Button>
          {row.original.status === "completed" && row.original.data && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleDownload(row.original)}
              title="Download report"
            >
              <Download className="h-4 w-4" />
              <span className="sr-only">Download report</span>
            </Button>
          )}
        </div>
      ),
    },
  ], [runningId]);

  return (
    <PageContainer>
      <PageHeader
        title="My Reports"
        subtitle="Saved report configurations and recent results."
        breadcrumbs={[
          { label: "Reports", href: "/staff/reports" },
          { label: "My Reports" },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Saved Reports</p>
                  <div className="text-2xl font-semibold mt-1">{reports.length}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600">
                  <FolderOpen className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed</p>
                  <div className="text-2xl font-semibold mt-1">
                    {reports.filter(r => r.status === "completed").length}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600">
                  <FileText className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Running</p>
                  <div className="text-2xl font-semibold mt-1">
                    {reports.filter(r => r.status === "running").length}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Saved Reports</CardTitle>
            <CardDescription>Your saved report configurations.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={reports}
              searchable={true}
              searchPlaceholder="Search reports..."
              paginated={reports.length > 10}
              emptyState={
                <EmptyState
                  title="No saved reports"
                  description="Save a report from a template to see it here."
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
