"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DataTable,
  EmptyState,
  PageContainer,
  PageContent,
  PageHeader,
  StatusBadge,
  UniversalSearch,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { useApi } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Calendar,
  Clock3,
  FileText,
  Package,
  UserPlus,
  Users,
} from "lucide-react";

interface OverdueRow {
  id: string | number;
  dueDate?: string;
  patronId?: string | number;
  copyId?: string | number;
  title?: string;
}

interface OverdueApiRow {
  id?: string | number;
  circ_id?: string | number;
  due_date?: string;
  dueDate?: string;
  usr?: string | number;
  patron_id?: string | number;
  user_id?: string | number;
  target_copy?: string | number;
  copy_id?: string | number;
  copy?: string | number;
  title?: string;
  item_title?: string;
  record_title?: string;
}

function metricNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

function safeNumber(value: unknown): number {
  return metricNumber(value) ?? 0;
}

function formatMetric(value: unknown): string {
  const num = metricNumber(value);
  return num === null ? "—" : num.toLocaleString();
}

function DeskSearchWidget() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Universal Search</CardTitle>
        <CardDescription>
          Barcode, patron, title, author, ISBN, phone, and email in one search.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <UniversalSearch className="w-full" autoFocus={false} />
        <p className="text-xs text-muted-foreground">
          Use this first for desk workflows, then jump directly into checkout, checkin, or record
          views.
        </p>
      </CardContent>
    </Card>
  );
}

function DeskActionsWidget() {
  const quickActions = [
    { title: "Check Out", href: "/staff/circulation/checkout", icon: ArrowLeftRight, hint: "F1" },
    { title: "Check In", href: "/staff/circulation/checkin", icon: Package, hint: "F2" },
    { title: "Patron Search", href: "/staff/patrons", icon: Users, hint: "F3" },
    { title: "Register Patron", href: "/staff/patrons/register", icon: UserPlus, hint: "F4" },
    { title: "Catalog Search", href: "/staff/catalog", icon: BookOpen, hint: "F5" },
    { title: "Create Record", href: "/staff/catalog/create", icon: FileText, hint: "" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Desk Actions</CardTitle>
        <CardDescription>Open the workflows staff use continuously during a shift.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {quickActions.map((action) => (
            <Button
              key={action.title}
              asChild
              variant="outline"
              className="h-auto justify-start px-3 py-3"
            >
              <Link href={action.href} className="flex w-full items-center gap-3">
                <action.icon className="h-4 w-4" />
                <span className="flex-1 text-left text-sm font-medium">{action.title}</span>
                {action.hint ? (
                  <span className="text-[10px] text-muted-foreground font-mono">{action.hint}</span>
                ) : null}
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OperationalSnapshotWidget({ stats }: { stats: Record<string, unknown> | undefined }) {
  const rows = [
    {
      label: "Checkouts Today",
      value: formatMetric(stats?.checkouts_today),
      href: "/staff/circulation/checkout",
    },
    {
      label: "Checkins Today",
      value: formatMetric(stats?.checkins_today),
      href: "/staff/circulation/checkin",
    },
    {
      label: "Active Holds",
      value: formatMetric(stats?.active_holds),
      href: "/staff/circulation/holds-management",
    },
    {
      label: "Overdue Items",
      value: formatMetric(stats?.overdue_items),
      href: "/staff/reports",
    },
    {
      label: "Open Bill Total",
      value: `$${safeNumber(stats?.open_bill_total).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      href: "/staff/circulation/bills",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Operational Snapshot</CardTitle>
        <CardDescription>Live queue and circulation context from Evergreen.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((row) => (
          <Link
            key={row.label}
            href={row.href}
            className="block rounded-md border px-3 py-2 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className="text-sm font-semibold">{row.value}</span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function AlertsWidget({ stats }: { stats: Record<string, unknown> | undefined }) {
  const alerts = useMemo(() => {
    const holds = metricNumber(stats?.active_holds);
    const overdue = metricNumber(stats?.overdue_items);

    const items = [] as {
      title: string;
      description: string;
      tone: "warning" | "error" | "info";
      href: string;
    }[];

    if (holds != null && holds > 0) {
      items.push({
        title: `${holds} active holds`,
        description: "Review captured and pending holds",
        tone: "warning",
        href: "/staff/circulation/holds-management",
      });
    }

    if (overdue === null) {
      items.push({
        title: "Overdue metrics unavailable",
        description: "Reporting setup needed for overdue pipeline",
        tone: "info",
        href: "/staff/reports",
      });
    } else if (overdue > 0) {
      items.push({
        title: `${overdue} overdue items`,
        description: "Items needing immediate follow-up",
        tone: "error",
        href: "/staff/reports",
      });
    }

    if (items.length === 0) {
      items.push({
        title: "No urgent queue alerts",
        description: "Hold and overdue queues are currently stable",
        tone: "info",
        href: "/staff/reports",
      });
    }

    return items;
  }, [stats]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Alerts</CardTitle>
        <CardDescription>Focus these first when starting a shift.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert) => (
          <Link
            key={alert.title}
            href={alert.href}
            className="block rounded-md border p-3 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-muted-foreground">{alert.description}</p>
              </div>
              <StatusBadge
                label={
                  alert.tone === "error" ? "Urgent" : alert.tone === "warning" ? "Attention" : "Ok"
                }
                status={
                  alert.tone === "error"
                    ? "error"
                    : alert.tone === "warning"
                      ? "warning"
                      : "success"
                }
              />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ShiftChecklistWidget() {
  const checklist = [
    { title: "Process pull list", href: "/staff/circulation/pull-list" },
    { title: "Clear holds shelf exceptions", href: "/staff/circulation/holds-shelf" },
    { title: "Review overdue follow-up list", href: "/staff/reports" },
    { title: "Run checkin backlog", href: "/staff/circulation/checkin" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Shift Checklist</CardTitle>
        <CardDescription>
          Common operational tasks for opening and mid-shift routines.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {checklist.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="block rounded-md border px-3 py-2 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{item.title}</span>
              <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function OverdueQueueWidget({
  overdueRows,
  isLoading,
  message,
}: {
  overdueRows: OverdueRow[];
  isLoading: boolean;
  message?: string;
}) {
  const columns = useMemo<ColumnDef<OverdueRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => row.original.title || "—",
      },
      {
        accessorKey: "copyId",
        header: "Copy",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.copyId ?? "—"}</span>,
      },
      {
        accessorKey: "patronId",
        header: "Patron",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.patronId ?? "—"}</span>
        ),
      },
      {
        accessorKey: "dueDate",
        header: "Due Date",
        cell: ({ row }) =>
          row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : "—",
      },
    ],
    []
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overdue Queue</CardTitle>
        <CardDescription>Oldest items needing follow-up right now.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={overdueRows}
          isLoading={isLoading}
          searchable={false}
          paginated={false}
          emptyState={
            <EmptyState
              title="No overdue items"
              description={message || "No overdue records returned for this branch."}
            />
          }
        />
      </CardContent>
    </Card>
  );
}

export default function StaffDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const orgId = user?.homeLibraryId || 1;

  const { data: dashboardData } = useApi<Record<string, unknown>>(
    orgId ? `/api/evergreen/reports?action=dashboard&org=${orgId}` : null,
    { immediate: !!orgId }
  );

  const { data: overdueData, isLoading: overdueLoading } = useApi<Record<string, unknown>>(
    orgId ? `/api/evergreen/reports?action=overdue&org=${orgId}&limit=12` : null,
    { immediate: !!orgId }
  );

  const stats = (dashboardData?.stats as Record<string, unknown> | undefined) || undefined;

  const overdueRows: OverdueRow[] = useMemo(() => {
    const overdue = Array.isArray(overdueData?.overdue) ? overdueData.overdue : [];
    return overdue.map((entry, idx: number) => {
      const circ = (entry as OverdueApiRow) || {};
      return {
        id: circ.id ?? circ.circ_id ?? idx,
        dueDate: circ.due_date ?? circ.dueDate,
        patronId: circ.usr ?? circ.patron_id ?? circ.user_id,
        copyId: circ.target_copy ?? circ.copy_id ?? circ.copy,
        title: circ.title ?? circ.item_title ?? circ.record_title ?? "",
      };
    });
  }, [overdueData]);

  return (
    <PageContainer>
      <PageHeader
        title="Staff Workbench"
        subtitle="Operational workspace for circulation, patrons, and cataloging."
        breadcrumbs={[{ label: "Dashboard" }]}
        actions={[
          {
            label: "Reports",
            onClick: () => router.push("/staff/reports"),
            icon: BarChart3,
          },
        ]}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
            {typeof dashboardData?.message === "string" && (
              <div className="text-xs text-muted-foreground">{dashboardData.message}</div>
            )}
          </div>
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <DeskSearchWidget />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <DeskActionsWidget />
            <ShiftChecklistWidget />
          </div>

          <div className="space-y-6">
            <AlertsWidget stats={stats} />
            <OperationalSnapshotWidget stats={stats} />
          </div>
        </div>

        <OverdueQueueWidget
          overdueRows={overdueRows}
          isLoading={overdueLoading}
          message={typeof overdueData?.message === "string" ? overdueData.message : undefined}
        />
      </PageContent>
    </PageContainer>
  );
}
