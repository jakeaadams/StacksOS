"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  StatsSkeleton,
  StatusBadge,
  UniversalSearch,
} from "@/components/shared";
import { DashboardEditor } from "@/components/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { useApi, useDashboardSettings } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";
import {
  ArrowLeftRight,
  Package,
  Users,
  BookOpen,
  Bookmark,
  BarChart3,
  Calendar,
  FileText,
  UserPlus,
  AlertCircle,
  Settings2,
} from "lucide-react";

interface TopItemRow {
  id: string | number;
  title: string;
  author?: string;
  count: number;
}

interface OverdueRow {
  id: string | number;
  dueDate?: string;
  patronId?: string | number;
  copyId?: string | number;
  title?: string;
}

function safeNumber(value: any): number {
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : 0;
}

function metricNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

function formatMetric(value: any): string {
  const num = metricNumber(value);
  return num === null ? "—" : num.toLocaleString();
}

// ============================================================================
// Widget Components
// ============================================================================

function UniversalSearchWidget() {
  return (
    <div className="mb-8 flex flex-col items-center">
      <h2 className="text-lg font-medium text-muted-foreground mb-3">
        What are you looking for?
      </h2>
      <UniversalSearch className="w-full" autoFocus={false} />
      <p className="text-xs text-muted-foreground mt-2">
        Search by patron name, barcode, phone, email • Item barcode • Title, author, ISBN
      </p>
    </div>
  );
}

function StatCardsWidget({ stats, isLoading }: { stats: any; isLoading: boolean }) {
  const statCards = [
    {
      title: "Checkouts Today",
      value: formatMetric(stats?.checkouts_today),
      icon: ArrowLeftRight,
      tone: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Checkins Today",
      value: formatMetric(stats?.checkins_today),
      icon: Package,
      tone: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Active Holds",
      value: formatMetric(stats?.active_holds),
      icon: Bookmark,
      tone: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      title: "Overdue Items",
      value: formatMetric(stats?.overdue_items),
      icon: AlertCircle,
      tone: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  if (isLoading) {
    return <StatsSkeleton />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.title} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <div className={`rounded-lg p-2 ${stat.bg}`}>
              <stat.icon className={`h-4 w-4 ${stat.tone}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">Updated just now</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuickActionsWidget() {
  const quickActions = [
    { title: "Check Out", href: "/staff/circulation/checkout", icon: ArrowLeftRight },
    { title: "Check In", href: "/staff/circulation/checkin", icon: Package },
    { title: "Patron Search", href: "/staff/patrons", icon: Users },
    { title: "Register Patron", href: "/staff/patrons/register", icon: UserPlus },
    { title: "Catalog Search", href: "/staff/catalog", icon: BookOpen },
    { title: "Create Record", href: "/staff/catalog/create", icon: FileText },
  ];

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Actions</CardTitle>
        <CardDescription>Fast routes for daily workflows</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Button
              key={action.title}
              asChild
              variant="outline"
              className="w-full h-auto py-4 flex flex-col gap-2"
            >
              <Link href={action.href}>
                <action.icon className="h-6 w-6" />
                <span className="text-sm font-medium">{action.title}</span>
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TopItemsWidget({
  topItems,
  isLoading,
  message,
}: {
  topItems: TopItemRow[];
  isLoading: boolean;
  message?: string;
}) {
  const topColumns = useMemo<ColumnDef<TopItemRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            {row.original.author && (
              <div className="text-xs text-muted-foreground">{row.original.author}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "count",
        header: "Circs",
        cell: ({ row }) => <span className="font-medium">{row.original.count}</span>,
      },
    ],
    []
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Circulated Items</CardTitle>
        <CardDescription>Based on Evergreen circulation stats</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={topColumns}
          data={topItems}
          isLoading={isLoading}
          searchable={false}
          paginated={false}
          emptyState={
            <EmptyState
              title="No circulation stats"
              description={message || "No data returned from Evergreen yet."}
            />
          }
        />
      </CardContent>
    </Card>
  );
}

function OverdueItemsWidget({
  overdueRows,
  isLoading,
  message,
}: {
  overdueRows: OverdueRow[];
  isLoading: boolean;
  message?: string;
}) {
  const overdueColumns = useMemo<ColumnDef<OverdueRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => row.original.title || "—",
      },
      {
        accessorKey: "copyId",
        header: "Copy",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.copyId ?? "—"}</span>
        ),
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
        <CardTitle className="text-base">Oldest Overdue Items</CardTitle>
        <CardDescription>Items with the longest overdue duration</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={overdueColumns}
          data={overdueRows}
          isLoading={isLoading}
          searchable={false}
          paginated={false}
          emptyState={
            <EmptyState
              title="No overdue items"
              description={message || "Nothing overdue at this branch."}
            />
          }
        />
      </CardContent>
    </Card>
  );
}

function AlertsWidget({ stats }: { stats: any }) {
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
        description: "Review holds ready for pickup",
        tone: "warning",
        href: "/staff/circulation/holds-management",
      });
    }

    if (overdue === null) {
      items.push({
        title: "Overdue metrics unavailable",
        description: "Configure reporting to enable overdue dashboards",
        tone: "info",
        href: "/staff/reports",
      });
    } else if (overdue > 0) {
      items.push({
        title: `${overdue} overdue items`,
        description: "See items needing follow-up",
        tone: "error",
        href: "/staff/reports",
      });
    }

    if (items.length === 0) {
      items.push({
        title: "All clear",
        description: "No urgent holds or overdue items",
        tone: "info",
        href: "/staff/reports",
      });
    }

    return items;
  }, [stats]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Alerts</CardTitle>
        <CardDescription>Operational follow-ups</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <Link key={alert.title} href={alert.href} className="block">
            <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40">
              <div>
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-muted-foreground">{alert.description}</p>
              </div>
              <StatusBadge
                label={
                  alert.tone === "error"
                    ? "Urgent"
                    : alert.tone === "warning"
                      ? "Attention"
                      : "Ok"
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

// ============================================================================
// Main Dashboard
// ============================================================================

export default function StaffDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const orgId = user?.homeLibraryId || 1;

  // Dashboard customization
  const {
    enabledWidgets,
    allWidgets,
    isLoading: settingsLoading,
    isSaving,
    toggleWidget,
    reorderWidgets,
    resetToDefaults,
  } = useDashboardSettings();

  // Data fetching
  const { data: dashboardData, isLoading: dashboardLoading } = useApi<any>(
    orgId ? `/api/evergreen/reports?action=dashboard&org=${orgId}` : null,
    { immediate: !!orgId }
  );

  const { data: topItemsData, isLoading: topItemsLoading } = useApi<any>(
    orgId ? `/api/evergreen/reports?action=top_items&org=${orgId}&limit=10` : null,
    { immediate: !!orgId }
  );

  const { data: overdueData, isLoading: overdueLoading } = useApi<any>(
    orgId ? `/api/evergreen/reports?action=overdue&org=${orgId}&limit=10` : null,
    { immediate: !!orgId }
  );

  const stats = dashboardData?.stats;

  const topItems: TopItemRow[] = useMemo(() => {
    const items = topItemsData?.top_items || [];
    return items.map((item: any, idx: number) => {
      if (Array.isArray(item)) {
        return {
          id: item[0] ?? idx,
          title: item[1] ?? `Record ${item[0] ?? idx}`,
          author: item[2] ?? "",
          count: safeNumber(item[3] ?? item[2] ?? item[1] ?? 0),
        };
      }
      return {
        id: item.id ?? item.record_id ?? item.record ?? idx,
        title: item.title || item.record_title || item.tcn || `Record ${item.id ?? idx}`,
        author: item.author || item.record_author || "",
        count: safeNumber(item.count ?? item.circ_count ?? item.circs ?? item.usage ?? 0),
      };
    });
  }, [topItemsData]);

  const overdueRows: OverdueRow[] = useMemo(() => {
    const overdue = overdueData?.overdue || [];
    return overdue.map((circ: any, idx: number) => ({
      id: circ.id ?? circ.circ_id ?? idx,
      dueDate: circ.due_date ?? circ.dueDate,
      patronId: circ.usr ?? circ.patron_id ?? circ.user_id,
      copyId: circ.target_copy ?? circ.copy_id ?? circ.copy,
      title: circ.title ?? circ.item_title ?? circ.record_title ?? "",
    }));
  }, [overdueData]);

  // Check which widgets are enabled
  const isWidgetEnabled = (widgetId: string) =>
    enabledWidgets.some((w) => w.id === widgetId);

  // Sort content widgets by order for rendering
  const sortedContentWidgets = enabledWidgets
    .filter((w) => w.defaultOrder >= 0)
    .sort((a, b) => {
      const orderA = allWidgets.find((w) => w.id === a.id)?.order ?? a.defaultOrder;
      const orderB = allWidgets.find((w) => w.id === b.id)?.order ?? b.defaultOrder;
      return orderA - orderB;
    });

  // Render a widget by ID
  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case "universal-search":
        return <UniversalSearchWidget key={widgetId} />;
      case "stat-cards":
        return (
          <StatCardsWidget key={widgetId} stats={stats} isLoading={dashboardLoading} />
        );
      case "quick-actions":
        return <QuickActionsWidget key={widgetId} />;
      case "top-items":
        return (
          <TopItemsWidget
            key={widgetId}
            topItems={topItems}
            isLoading={topItemsLoading}
            message={topItemsData?.message}
          />
        );
      case "overdue-items":
        return (
          <OverdueItemsWidget
            key={widgetId}
            overdueRows={overdueRows}
            isLoading={overdueLoading}
            message={overdueData?.message}
          />
        );
      case "alerts":
        return <AlertsWidget key={widgetId} stats={stats} />;
      default:
        return null;
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Staff Dashboard"
        subtitle="Live operational metrics for your branch."
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
            {isWidgetEnabled("date-display") && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            )}
            {dashboardData?.message && (
              <div className="text-xs text-muted-foreground">{dashboardData.message}</div>
            )}
          </div>
          <DashboardEditor
            allWidgets={allWidgets}
            onToggle={toggleWidget}
            onReorder={reorderWidgets}
            onReset={resetToDefaults}
            isSaving={isSaving}
            trigger={
              <Button variant="ghost" size="sm">
                <Settings2 className="h-4 w-4 mr-2" />
                Customize
              </Button>
            }
          />
        </div>
      </PageHeader>

      <PageContent>
        {/* Render widgets in user-defined order */}
        {sortedContentWidgets.map((widget) => {
          // Special handling for the two-column layout (top-items + overdue-items)
          if (widget.id === "top-items") {
            const overdueEnabled = isWidgetEnabled("overdue-items");
            if (overdueEnabled) {
              return (
                <div key="items-grid" className="grid gap-6 lg:grid-cols-2 mt-6">
                  {renderWidget("top-items")}
                  {renderWidget("overdue-items")}
                </div>
              );
            }
            return (
              <div key={widget.id} className="mt-6">
                {renderWidget(widget.id)}
              </div>
            );
          }

          // Skip overdue-items here since it's rendered with top-items
          if (widget.id === "overdue-items" && isWidgetEnabled("top-items")) {
            return null;
          }

          // Render single overdue-items if top-items is disabled
          if (widget.id === "overdue-items") {
            return (
              <div key={widget.id} className="mt-6">
                {renderWidget(widget.id)}
              </div>
            );
          }

          return renderWidget(widget.id);
        })}
      </PageContent>
    </PageContainer>
  );
}
