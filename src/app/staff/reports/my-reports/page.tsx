"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  StatusBadge,
  LoadingInline,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/client-fetch";
import { FolderOpen, Play, Download, Clock, FileText, RefreshCw, Plus } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { featureFlags } from "@/lib/feature-flags";

type ReportKey = "dashboard_kpis" | "holds_summary" | "overdue_items";
type Cadence = "daily" | "weekly" | "monthly";

interface SavedReport {
  id: number;
  name: string;
  report_key: ReportKey;
  cadence: Cadence;
  enabled: boolean;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_run_id?: number | null;
  last_run_status?: string | null;
  last_run_finished_at?: string | null;
  recipients: string[];
}

interface ReportRun {
  id: number;
  status: "queued" | "running" | "success" | "failure";
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  output_filename?: string | null;
}

const REPORT_KEY_LABELS: Record<ReportKey, string> = {
  dashboard_kpis: "Dashboard KPIs",
  holds_summary: "Holds Summary",
  overdue_items: "Overdue Items",
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function parseRecipients(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
    .filter((item, index, all) => all.indexOf(item) === index);
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function MyReportsPage() {
  const enabled = featureFlags.myReports;
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runningId, setRunningId] = useState<number | null>(null);

  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [runs, setRuns] = useState<ReportRun[]>([]);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newReportKey, setNewReportKey] = useState<ReportKey>("dashboard_kpis");
  const [newCadence, setNewCadence] = useState<Cadence>("daily");
  const [newRecipients, setNewRecipients] = useState("");

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithAuth("/api/reports/scheduled");
      const data = await response.json();
      if (response.ok && data.ok && Array.isArray(data.schedules)) {
        setReports(data.schedules as SavedReport[]);
      } else {
        toast.error(data.error || "Failed to load saved reports");
      }
    } catch {
      toast.error("Failed to load saved reports");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadReports();
  }, [enabled, loadReports]);

  const loadRuns = useCallback(async (reportId: number) => {
    setSelectedReportId(reportId);
    setRunsLoading(true);
    try {
      const response = await fetchWithAuth(`/api/reports/scheduled/${reportId}/runs`);
      const data = await response.json();
      if (response.ok && data.ok && Array.isArray(data.runs)) {
        setRuns(data.runs as ReportRun[]);
      } else {
        setRuns([]);
        toast.error(data.error || "Failed to load report runs");
      }
    } catch {
      setRuns([]);
      toast.error("Failed to load report runs");
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const handleRunReport = useCallback(
    async (report: SavedReport) => {
      setRunningId(report.id);
      try {
        const response = await fetchWithAuth(`/api/reports/scheduled/${report.id}/run`, {
          method: "POST",
        });
        const data = await response.json();

        if (response.ok && data.ok) {
          toast.success("Report run queued", { description: report.name });
          await loadReports();
          await loadRuns(report.id);
        } else {
          toast.error("Report run failed", { description: data.error || "Unknown error" });
        }
      } catch {
        toast.error("Report run failed");
      } finally {
        setRunningId(null);
      }
    },
    [loadReports, loadRuns]
  );

  const handleDownloadLatest = useCallback((report: SavedReport) => {
    if (!report.last_run_id) {
      toast.error("No successful run available to download");
      return;
    }
    window.open(`/api/reports/scheduled/runs/${report.last_run_id}/download`, "_blank", "noopener,noreferrer");
  }, []);

  const handleCreate = useCallback(async () => {
    const recipients = parseRecipients(newRecipients);
    if (!newName.trim()) {
      toast.error("Report name is required");
      return;
    }
    if (recipients.length === 0) {
      toast.error("At least one recipient email is required");
      return;
    }
    if (recipients.some((recipient) => !looksLikeEmail(recipient))) {
      toast.error("One or more recipient emails are invalid");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetchWithAuth("/api/reports/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          reportKey: newReportKey,
          cadence: newCadence,
          timeOfDay: "08:00",
          recipients,
          enabled: true,
          format: "csv",
        }),
      });

      const data = await response.json();
      if (response.ok && data.ok) {
        toast.success("Saved report created");
        setShowCreateDialog(false);
        setNewName("");
        setNewReportKey("dashboard_kpis");
        setNewCadence("daily");
        setNewRecipients("");
        await loadReports();
      } else {
        toast.error(data.error || "Failed to create saved report");
      }
    } catch {
      toast.error("Failed to create saved report");
    } finally {
      setIsCreating(false);
    }
  }, [newCadence, newName, newRecipients, newReportKey, loadReports]);

  const columns: ColumnDef<SavedReport>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Report",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{REPORT_KEY_LABELS[row.original.report_key]}</div>
          </div>
        ),
      },
      {
        accessorKey: "cadence",
        header: "Cadence",
        cell: ({ row }) => <span className="capitalize">{row.original.cadence}</span>,
      },
      {
        accessorKey: "next_run_at",
        header: "Next Run",
        cell: ({ row }) => <span className="text-xs">{formatDateTime(row.original.next_run_at)}</span>,
      },
      {
        accessorKey: "last_run_status",
        header: "Last Status",
        cell: ({ row }) => {
          const status = row.original.last_run_status || "none";
          return (
            <StatusBadge
              label={status === "none" ? "Not run" : status}
              status={
                status === "success"
                  ? "success"
                  : status === "failure"
                    ? "error"
                    : status === "running"
                      ? "pending"
                      : "pending"
              }
            />
          );
        },
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
              onClick={() => void handleRunReport(row.original)}
              disabled={runningId === row.original.id}
              title="Run now"
            >
              {runningId === row.original.id ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => void loadRuns(row.original.id)}
              title="View runs"
            >
              <Clock className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleDownloadLatest(row.original)}
              disabled={!row.original.last_run_id || row.original.last_run_status !== "success"}
              title="Download latest"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [handleDownloadLatest, handleRunReport, loadRuns, runningId]
  );

  if (!enabled) {
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
        <PageContent>
          <EmptyState
            title="My Reports is not enabled"
            description="Enable this once saved report workflows are in use."
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="My Reports"
        subtitle="Saved report configurations, run history, and downloadable outputs."
        breadcrumbs={[
          { label: "Reports", href: "/staff/reports" },
          { label: "My Reports" },
        ]}
        actions={[
          {
            label: "Refresh",
            icon: RefreshCw,
            onClick: () => void loadReports(),
            variant: "outline",
            loading: isLoading,
          },
          {
            label: "New Saved Report",
            icon: Plus,
            onClick: () => setShowCreateDialog(true),
          },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Saved Reports</p>
                  <div className="mt-1 text-2xl font-semibold">{reports.length}</div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
                  <FolderOpen className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Enabled</p>
                  <div className="mt-1 text-2xl font-semibold">{reports.filter((report) => report.enabled).length}</div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <FileText className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Successful Last Runs</p>
                  <div className="mt-1 text-2xl font-semibold">
                    {reports.filter((report) => report.last_run_status === "success").length}
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Saved Reports</CardTitle>
            <CardDescription>Run, inspect, and download your scheduled reports.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 flex justify-center">
                <LoadingInline message="Loading saved reports..." />
              </div>
            ) : reports.length === 0 ? (
              <EmptyState
                title="No saved reports"
                description="Create your first saved report to schedule recurring output and email delivery."
                action={{
                  label: "Create Saved Report",
                  onClick: () => setShowCreateDialog(true),
                  icon: Plus,
                }}
              />
            ) : (
              <DataTable
                columns={columns}
                data={reports}
                searchable={true}
                searchPlaceholder="Search reports..."
                paginated={reports.length > 10}
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Run History</CardTitle>
            <CardDescription>
              {selectedReportId ? `Latest runs for report #${selectedReportId}` : "Select a report row action to view runs"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedReportId ? (
              <EmptyState title="No report selected" description="Choose a report and click the run-history action." />
            ) : runsLoading ? (
              <div className="py-8 flex justify-center">
                <LoadingInline message="Loading runs..." />
              </div>
            ) : runs.length === 0 ? (
              <EmptyState title="No runs yet" description="This report has not been executed yet." />
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div key={run.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs">Run #{run.id}</div>
                      <StatusBadge
                        label={run.status}
                        status={
                          run.status === "success"
                            ? "success"
                            : run.status === "failure"
                              ? "error"
                              : "pending"
                        }
                      />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Started: {formatDateTime(run.started_at)} | Finished: {formatDateTime(run.finished_at)}
                    </div>
                    {run.error ? <div className="mt-1 text-xs text-rose-600">{run.error}</div> : null}
                    {run.output_filename ? (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`/api/reports/scheduled/runs/${run.id}/download`, "_blank", "noopener,noreferrer")}
                        >
                          <Download className="mr-2 h-4 w-4" /> Download {run.output_filename}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Saved Report</DialogTitle>
            <DialogDescription>
              Configure a reusable scheduled report and delivery list.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="report-name">Name</Label>
              <Input
                id="report-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Weekly Overdue Summary"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select value={newReportKey} onValueChange={(value) => setNewReportKey(value as ReportKey)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard_kpis">Dashboard KPIs</SelectItem>
                    <SelectItem value="holds_summary">Holds Summary</SelectItem>
                    <SelectItem value="overdue_items">Overdue Items</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cadence</Label>
                <Select value={newCadence} onValueChange={(value) => setNewCadence(value as Cadence)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipients">Recipients (comma or newline separated emails)</Label>
              <Input
                id="recipients"
                value={newRecipients}
                onChange={(event) => setNewRecipients(event.target.value)}
                placeholder="you@example.org, team@example.org"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
