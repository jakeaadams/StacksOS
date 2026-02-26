"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { useApi } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  SetupRequired,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import { Clock, Download, Play, Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import { SCHEDULED_REPORT_DEFINITIONS } from "@/lib/reports/scheduled-report-definitions";

type Schedule = {
  id: number;
  name: string;
  report_key: "dashboard_kpis" | "holds_summary" | "overdue_items";
  org_id: number | null;
  cadence: "daily" | "weekly" | "monthly";
  time_of_day: string;
  day_of_week: number | null;
  day_of_month: number | null;
  format: "csv" | "json";
  recipients: string[];
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_id: number | null;
  last_run_status: string | null;
  last_run_finished_at: string | null;
};

type Run = {
  id: number;
  status: "queued" | "running" | "success" | "failure";
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  output_filename: string | null;
  output_size_bytes: number | null;
  created_at: string;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function cadenceLabel(s: Schedule): string {
  if (s.cadence === "daily") return `Daily @ ${s.time_of_day}`;
  if (s.cadence === "weekly") {
    const dow = typeof s.day_of_week === "number" ? s.day_of_week : 1;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Weekly (${days[dow]}) @ ${s.time_of_day}`;
  }
  const dom = typeof s.day_of_month === "number" ? s.day_of_month : 1;
  return `Monthly (${dom}) @ ${s.time_of_day}`;
}

function reportLabel(key: Schedule["report_key"]): string {
  return SCHEDULED_REPORT_DEFINITIONS.find((r) => r.key === key)?.label || key;
}

function parseRecipients(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function ScheduledReportsPage() {
  const router = useRouter();
  const { orgs } = useAuth();

  const schedulesApi = useApi<{ schedules: Schedule[] }>("/api/reports/scheduled", {
    immediate: true,
  });
  const envApi = useApi<{
    env: { scheduledReports?: { runnerConfigured?: boolean; publicBaseUrlConfigured?: boolean } };
  }>("/api/env", { immediate: true });

  const schedules = schedulesApi.data?.schedules || [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);

  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const runsApi = useApi<{ runs: Run[] }>(
    selectedScheduleId ? `/api/reports/scheduled/${selectedScheduleId}/runs` : null,
    { immediate: !!selectedScheduleId, deps: [selectedScheduleId] }
  );

  const [form, setForm] = useState({
    name: "",
    reportKey: "dashboard_kpis" as Schedule["report_key"],
    orgId: orgs[0]?.id ? String(orgs[0].id) : "",
    cadence: "daily" as Schedule["cadence"],
    timeOfDay: "08:00",
    dayOfWeek: "1",
    dayOfMonth: "1",
    recipients: "",
    enabled: true,
  });

  const openCreate = () => {
    setEditing(null);
    setForm((prev) => ({
      ...prev,
      name: "",
      reportKey: "dashboard_kpis",
      orgId: orgs[0]?.id ? String(orgs[0].id) : "",
      cadence: "daily",
      timeOfDay: "08:00",
      dayOfWeek: "1",
      dayOfMonth: "1",
      recipients: "",
      enabled: true,
    }));
    setCreateOpen(true);
  };

  const openEdit = (s: Schedule) => {
    setEditing(s);
    setForm({
      name: s.name,
      reportKey: s.report_key,
      orgId: s.org_id ? String(s.org_id) : orgs[0]?.id ? String(orgs[0].id) : "",
      cadence: s.cadence,
      timeOfDay: s.time_of_day,
      dayOfWeek: String(s.day_of_week ?? 1),
      dayOfMonth: String(s.day_of_month ?? 1),
      recipients: (s.recipients || []).join(", "),
      enabled: s.enabled,
    });
    setCreateOpen(true);
  };

  const saveSchedule = async () => {
    const recipients = parseRecipients(form.recipients);
    if (!form.name.trim()) return toast.error("Name is required");
    if (recipients.length === 0) return toast.error("Add at least one recipient email");

    const payload = {
      name: form.name.trim(),
      reportKey: form.reportKey,
      orgId: form.orgId ? parseInt(form.orgId, 10) : null,
      cadence: form.cadence,
      timeOfDay: form.timeOfDay,
      dayOfWeek: form.cadence === "weekly" ? parseInt(form.dayOfWeek, 10) : null,
      dayOfMonth: form.cadence === "monthly" ? parseInt(form.dayOfMonth, 10) : null,
      recipients,
      enabled: form.enabled,
    };

    setSaving(true);
    try {
      const res = await fetchWithAuth(
        editing ? `/api/reports/scheduled/${editing.id}` : "/api/reports/scheduled",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Save failed");

      toast.success(editing ? "Schedule updated" : "Schedule created");
      setCreateOpen(false);
      setEditing(null);
      await schedulesApi.refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (s: Schedule) => {
    try {
      toast.info("Running report…");
      const res = await fetchWithAuth(`/api/reports/scheduled/${s.id}/run`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Run failed");
      toast.success("Run complete", { description: `Run #${json.runId}` });
      setSelectedScheduleId(s.id);
      await Promise.all([schedulesApi.refetch(), runsApi.refetch()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    }
  };

  const toggleEnabled = async (s: Schedule, enabled: boolean) => {
    try {
      const res = await fetchWithAuth(`/api/reports/scheduled/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Update failed");
      await schedulesApi.refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const requestDelete = (s: Schedule) => {
    setDeleteTarget(s);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/reports/scheduled/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Delete failed");
      toast.success("Schedule deleted");
      setDeleteOpen(false);
      setDeleteTarget(null);
      setSelectedScheduleId(null);
      await schedulesApi.refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const scheduleColumns = useMemo<ColumnDef<Schedule>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Schedule",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">
              {reportLabel(row.original.report_key)} • {cadenceLabel(row.original)}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "enabled",
        header: "Enabled",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Switch
              checked={row.original.enabled}
              onCheckedChange={(v) => void toggleEnabled(row.original, Boolean(v))}
            />
            <span className="text-xs text-muted-foreground">
              {row.original.enabled ? "On" : "Off"}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "next_run_at",
        header: "Next Run",
        cell: ({ row }) => (
          <span className="text-xs font-mono">{formatDateTime(row.original.next_run_at)}</span>
        ),
      },
      {
        id: "last",
        header: "Last Run",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.last_run_status ? (
              <Badge
                variant={row.original.last_run_status === "success" ? "secondary" : "destructive"}
              >
                {row.original.last_run_status}
              </Badge>
            ) : (
              <Badge variant="outline">—</Badge>
            )}
            <span className="text-xs font-mono">
              {formatDateTime(row.original.last_run_finished_at)}
            </span>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void runNow(row.original)}>
              <Play className="h-4 w-4 mr-2" />
              Run now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openEdit(row.original)}>
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit</span>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => requestDelete(row.original)}>
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgs]
  );

  const runColumns = useMemo<ColumnDef<Run>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Run",
        cell: ({ row }) => <span className="font-mono text-xs">#{row.original.id}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "success"
                ? "secondary"
                : row.original.status === "failure"
                  ? "destructive"
                  : "outline"
            }
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "finished_at",
        header: "Finished",
        cell: ({ row }) => (
          <span className="text-xs font-mono">{formatDateTime(row.original.finished_at)}</span>
        ),
      },
      {
        id: "download",
        header: "Download",
        cell: ({ row }) =>
          row.original.status === "success" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  `/api/reports/scheduled/runs/${row.original.id}/download`,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.original.error ? "Error" : "—"}
            </span>
          ),
      },
    ],
    []
  );

  const env = envApi.data?.env || {};
  const runnerConfigured = Boolean(env.scheduledReports?.runnerConfigured);
  const publicBaseUrlConfigured = Boolean(env.scheduledReports?.publicBaseUrlConfigured);

  return (
    <PageContainer>
      <PageHeader
        title="Scheduled Reports"
        subtitle="Automated report generation and delivery."
        breadcrumbs={[{ label: "Reports", href: "/staff/reports" }, { label: "Scheduled" }]}
        actions={[
          {
            label: "Refresh",
            onClick: () => void schedulesApi.refetch(),
            icon: RefreshCw,
            variant: "outline" as const,
          },
          { label: "Add Schedule", onClick: openCreate, icon: Plus },
        ]}
      />

      <PageContent className="space-y-6">
        {(!runnerConfigured || !publicBaseUrlConfigured) && (
          <SetupRequired
            module="Scheduled Reports"
            description="Scheduled delivery requires a runner secret and a public base URL for download links."
            setupSteps={[
              "Set STACKSOS_PUBLIC_BASE_URL to the externally reachable URL (e.g. https://stacks.example.org)",
              "Set STACKSOS_SCHEDULED_REPORTS_SECRET to a long random value",
              "Install + enable the systemd timer in ops/stacksos (scheduled reports runner)",
            ]}
            docsUrl="/staff/help#runbook"
            adminUrl="/staff/admin/ops"
          />
        )}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Schedules
            </CardTitle>
            <CardDescription>Create schedules that email report links to staff.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={scheduleColumns}
              data={schedules}
              isLoading={schedulesApi.isLoading}
              searchable
              searchPlaceholder="Search schedules..."
              paginated={schedules.length > 10}
              onRowClick={(row) => setSelectedScheduleId(row.id)}
              emptyState={
                <EmptyState
                  title="No scheduled reports"
                  description="Create your first schedule to automatically deliver KPIs, holds summaries, or overdue lists."
                  action={{ label: "Add Schedule", onClick: openCreate, icon: Plus }}
                  secondaryAction={{
                    label: "Runbook",
                    onClick: () => router.push("/staff/help#runbook"),
                  }}
                />
              }
            />
          </CardContent>
        </Card>

        {selectedScheduleId ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Run History</CardTitle>
              <CardDescription>Last 50 runs for schedule #{selectedScheduleId}</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={runColumns}
                data={runsApi.data?.runs || []}
                isLoading={runsApi.isLoading}
                searchable={false}
                paginated={(runsApi.data?.runs || []).length > 10}
                emptyState={
                  <EmptyState
                    title="No runs yet"
                    description="Use “Run now” to generate the first run."
                  />
                }
              />
            </CardContent>
          </Card>
        ) : null}
      </PageContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "Create schedule"}</DialogTitle>
            <DialogDescription>
              Schedules create a stored run and email a download link.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Daily KPIs"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="report">Report</Label>
              <Select
                id="report"
                value={form.reportKey}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, reportKey: v as Schedule["report_key"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select report" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULED_REPORT_DEFINITIONS.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                {SCHEDULED_REPORT_DEFINITIONS.find((r) => r.key === form.reportKey)?.description}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="organization">Organization</Label>
              <Select
                id="organization"
                value={form.orgId}
                onValueChange={(v) => setForm((p) => ({ ...p, orgId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select org" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.shortname} — {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="cadence">Cadence</Label>
                <Select
                  id="cadence"
                  value={form.cadence}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, cadence: v as Schedule["cadence"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cadence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  value={form.timeOfDay}
                  onChange={(e) => setForm((p) => ({ ...p, timeOfDay: e.target.value }))}
                  placeholder="08:00"
                />
                <div className="text-[11px] text-muted-foreground">Server local time</div>
              </div>
              {form.cadence === "weekly" ? (
                <div className="grid gap-2">
                  <Label htmlFor="day">Day</Label>
                  <Select
                    id="day"
                    value={form.dayOfWeek}
                    onValueChange={(v) => setForm((p) => ({ ...p, dayOfWeek: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Mon</SelectItem>
                      <SelectItem value="2">Tue</SelectItem>
                      <SelectItem value="3">Wed</SelectItem>
                      <SelectItem value="4">Thu</SelectItem>
                      <SelectItem value="5">Fri</SelectItem>
                      <SelectItem value="6">Sat</SelectItem>
                      <SelectItem value="0">Sun</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : form.cadence === "monthly" ? (
                <div className="grid gap-2">
                  <Label htmlFor="day-2">Day</Label>
                  <Input
                    id="day-2"
                    value={form.dayOfMonth}
                    onChange={(e) => setForm((p) => ({ ...p, dayOfMonth: e.target.value }))}
                    placeholder="1"
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="enabled">Enabled</Label>
                  <div className="flex items-center gap-3 h-9">
                    <Switch
                      id="enabled"
                      checked={form.enabled}
                      onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: Boolean(v) }))}
                    />
                    <span className="text-xs text-muted-foreground">
                      {form.enabled ? "On" : "Off"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {(form.cadence === "weekly" || form.cadence === "monthly") && (
              <div className="grid gap-2">
                <Label htmlFor="enabled-2">Enabled</Label>
                <div className="flex items-center gap-3 h-9">
                  <Switch
                    id="enabled-2"
                    checked={form.enabled}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: Boolean(v) }))}
                  />
                  <span className="text-xs text-muted-foreground">
                    {form.enabled ? "On" : "Off"}
                  </span>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="recipients">Recipients</Label>
              <Input
                id="recipients"
                value={form.recipients}
                onChange={(e) => setForm((p) => ({ ...p, recipients: e.target.value }))}
                placeholder="email1@library.org, email2@library.org"
              />
              <div className="text-xs text-muted-foreground">Comma-separated email addresses.</div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveSchedule()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={deleteTarget?.name || "schedule"}
        onConfirm={confirmDelete}
        isLoading={deleting}
      />
    </PageContainer>
  );
}
