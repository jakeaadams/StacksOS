"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PageContainer,
  PageContent,
  PageHeader,
  StatusBadge,
  UniversalSearch,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApi, useDashboardSettings } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  Loader2,
  Package,
  Sparkles,
  Settings2,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
  Users,
  RotateCcw,
} from "lucide-react";

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

type DashboardStats = {
  checkouts_today: number | null;
  checkins_today: number | null;
  active_holds: number | null;
  overdue_items: number | null;
  open_bill_total?: number | null;
  fines_collected_today?: number | null;
  new_patrons_today?: number | null;
};

type HoldsStats = {
  available: number;
  pending: number;
  in_transit: number;
  total: number;
};

type AiOpsSummary = {
  summary: string;
  highlights: string[];
  caveats?: string[];
  drilldowns: Array<{ label: string; url: string }>;
};

type AiPlaybookAction = {
  id: string;
  title: string;
  why: string;
  impact: "high" | "medium" | "low";
  etaMinutes: number;
  steps: string[];
  deepLink: string;
};

type AiOpsPlaybooks = {
  summary: string;
  actions: AiPlaybookAction[];
  caveats?: string[];
};

type AiStaffCopilot = {
  summary: string;
  highlights: string[];
  actions: AiPlaybookAction[];
  caveats?: string[];
  drilldowns: Array<{ label: string; url: string }>;
};

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

function OperationalSnapshotWidget({ stats }: { stats: DashboardStats | undefined }) {
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

function AlertsWidget({ stats }: { stats: DashboardStats | undefined }) {
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

function OpsAssistantWidget({
  orgId,
  stats,
  holds,
}: {
  orgId: number;
  stats: DashboardStats | undefined;
  holds: HoldsStats | undefined;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDraftId, setAiDraftId] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<AiOpsSummary | null>(null);
  const [aiPlaybooks, setAiPlaybooks] = useState<AiOpsPlaybooks | null>(null);
  const [aiFeedback, setAiFeedback] = useState<null | "accepted" | "rejected">(null);
  const autoRequested = useRef(false);

  const toCount = useCallback((value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(Math.round(value), 0);
  }, []);

  const generateAiSummary = useCallback(async () => {
    if (!featureFlags.ai || !stats) return;

    const activeHolds = toCount(stats.active_holds);
    const holdSnapshot: HoldsStats = holds || {
      available: Math.max(Math.floor(activeHolds * 0.3), 0),
      pending: Math.max(activeHolds - Math.floor(activeHolds * 0.3), 0),
      in_transit: 0,
      total: activeHolds,
    };

    setAiLoading(true);
    setAiError(null);
    setAiDraftId(null);
    setAiSummary(null);
    setAiPlaybooks(null);
    setAiFeedback(null);

    try {
      const payload = {
        orgId,
        stats: {
          checkouts_today: toCount(stats.checkouts_today),
          checkins_today: toCount(stats.checkins_today),
          active_holds: toCount(stats.active_holds),
          overdue_items: toCount(stats.overdue_items),
          fines_collected_today: toCount(stats.fines_collected_today),
          new_patrons_today: toCount(stats.new_patrons_today),
        },
        holds: holdSnapshot,
      };

      // Preferred path: single cross-module copilot request.
      try {
        const copilotResponse = await fetchWithAuth("/api/ai/staff-copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const copilotJson = await copilotResponse.json();
        if (!copilotResponse.ok || copilotJson.ok === false) {
          throw new Error(copilotJson.error || "AI staff copilot failed");
        }

        const copilot = (copilotJson.response || null) as AiStaffCopilot | null;
        if (!copilot) {
          throw new Error("AI staff copilot returned an empty payload");
        }

        setAiSummary({
          summary: copilot.summary,
          highlights: Array.isArray(copilot.highlights) ? copilot.highlights : [],
          caveats: Array.isArray(copilot.caveats) ? copilot.caveats : [],
          drilldowns: Array.isArray(copilot.drilldowns) ? copilot.drilldowns : [],
        });
        setAiPlaybooks({
          summary: copilot.summary,
          actions: Array.isArray(copilot.actions) ? copilot.actions : [],
          caveats: Array.isArray(copilot.caveats) ? copilot.caveats : [],
        });
        setAiDraftId(typeof copilotJson.draftId === "string" ? copilotJson.draftId : null);
        return;
      } catch {
        // Fallback path for older deployments or temporary endpoint failures.
      }

      const [summaryResult, playbookResult] = await Promise.allSettled([
        fetchWithAuth("/api/ai/analytics-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(async (response) => {
          const json = await response.json();
          if (!response.ok || json.ok === false) {
            throw new Error(json.error || "AI summary failed");
          }
          return json;
        }),
        fetchWithAuth("/api/ai/ops-playbooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(async (response) => {
          const json = await response.json();
          if (!response.ok || json.ok === false) {
            throw new Error(json.error || "AI ops playbooks failed");
          }
          return json;
        }),
      ]);

      let summaryDraftId: string | null = null;
      let playbookDraftId: string | null = null;

      if (summaryResult.status === "fulfilled") {
        summaryDraftId =
          typeof summaryResult.value.draftId === "string" ? summaryResult.value.draftId : null;
        setAiSummary((summaryResult.value.response || null) as AiOpsSummary | null);
      }

      if (playbookResult.status === "fulfilled") {
        playbookDraftId =
          typeof playbookResult.value.draftId === "string" ? playbookResult.value.draftId : null;
        setAiPlaybooks((playbookResult.value.response || null) as AiOpsPlaybooks | null);
      }

      if (summaryResult.status !== "fulfilled" && playbookResult.status !== "fulfilled") {
        const summaryError =
          summaryResult.status === "rejected" ? String(summaryResult.reason) : "";
        const playbookError =
          playbookResult.status === "rejected" ? String(playbookResult.reason) : "";
        throw new Error(`AI generation failed: ${summaryError} ${playbookError}`.trim());
      }

      if (summaryResult.status !== "fulfilled" || playbookResult.status !== "fulfilled") {
        setAiError("Assistant returned partial results; retry for a full refresh.");
      }

      setAiDraftId(playbookDraftId || summaryDraftId);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiLoading(false);
    }
  }, [holds, orgId, stats, toCount]);

  const submitAiFeedback = useCallback(
    async (decision: "accepted" | "rejected") => {
      if (!aiDraftId) return;
      setAiFeedback(decision);
      try {
        await fetchWithAuth(`/api/ai/drafts/${aiDraftId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, suggestionId: "staff_copilot" }),
        });
      } catch {
        // Best-effort only.
      }
    },
    [aiDraftId]
  );

  useEffect(() => {
    if (!featureFlags.ai || !stats || autoRequested.current) return;
    autoRequested.current = true;
    void generateAiSummary();
  }, [generateAiSummary, stats]);

  if (!featureFlags.ai) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Ops Assistant (Kimi 2.5 Pro)
            </CardTitle>
            <CardDescription>
              Cross-module shift guidance from live Evergreen metrics.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void generateAiSummary()}
              disabled={aiLoading || !stats}
            >
              {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void submitAiFeedback("accepted")}
              disabled={!aiDraftId || aiFeedback !== null}
              title="Useful"
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void submitAiFeedback("rejected")}
              disabled={!aiDraftId || aiFeedback !== null}
              title="Not useful"
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {aiLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating shift plan...
          </div>
        )}
        {aiError && (
          <div className="text-sm text-muted-foreground">Assistant unavailable: {aiError}</div>
        )}
        {!aiLoading && !aiError && !aiSummary && (
          <div className="text-sm text-muted-foreground">
            Refresh to generate prioritized actions for circulation, holds, and reports.
          </div>
        )}
        {aiSummary && (
          <div className="space-y-3">
            <div className="text-sm">{aiSummary.summary}</div>
            <div className="grid gap-2">
              {aiSummary.highlights.slice(0, 4).map((highlight, idx) => (
                <div key={idx} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                  {highlight}
                </div>
              ))}
            </div>
            {Array.isArray(aiSummary.caveats) && aiSummary.caveats.length > 0 ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <div className="font-medium text-foreground/80 mb-1">Caveats</div>
                <ul className="list-disc list-inside space-y-1">
                  {aiSummary.caveats.slice(0, 3).map((caveat, idx) => (
                    <li key={idx}>{caveat}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {aiSummary.drilldowns.slice(0, 4).map((drilldown, idx) => (
                <Button key={idx} asChild size="sm" variant="outline">
                  <Link href={drilldown.url}>{drilldown.label}</Link>
                </Button>
              ))}
            </div>
            {aiPlaybooks && aiPlaybooks.actions.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Proactive Playbooks
                </div>
                {aiPlaybooks.actions.slice(0, 4).map((action) => (
                  <div key={action.id} className="rounded-lg border bg-muted/15 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{action.title}</div>
                      <Badge
                        variant={action.impact === "high" ? "destructive" : "outline"}
                        className="capitalize"
                      >
                        {action.impact} impact • {action.etaMinutes}m
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{action.why}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={action.deepLink}>Open Workflow</Link>
                      </Button>
                    </div>
                    <div className="mt-2 text-xs">
                      {action.steps.slice(0, 3).map((step, index) => (
                        <div key={`${action.id}-step-${index}`} className="text-muted-foreground">
                          {index + 1}. {step}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
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

function DashboardCustomizationPanel({
  allWidgets,
  isSaving,
  onToggle,
  onMove,
  onReset,
}: {
  allWidgets: Array<{
    id: string;
    label: string;
    description: string;
    enabled: boolean;
    order: number;
  }>;
  isSaving: boolean;
  onToggle: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReset: () => void;
}) {
  const sorted = [...allWidgets].sort((a, b) => a.order - b.order);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Customize Dashboard</CardTitle>
        <CardDescription>Turn widgets on/off and reorder them for your workflow.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((widget, index) => (
          <div
            key={widget.id}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">{widget.label}</p>
              <p className="text-xs text-muted-foreground">{widget.description}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onMove(widget.id, "up")}
                disabled={index === 0 || isSaving}
                aria-label={`Move ${widget.label} up`}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onMove(widget.id, "down")}
                disabled={index === sorted.length - 1 || isSaving}
                aria-label={`Move ${widget.label} down`}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={widget.enabled ? "default" : "outline"}
                size="sm"
                onClick={() => onToggle(widget.id)}
                disabled={isSaving}
              >
                {widget.enabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={isSaving}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StaffDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const orgId = user?.homeLibraryId || 1;
  const {
    enabledWidgets,
    allWidgets,
    isSaving,
    toggleWidget,
    reorderWidgets,
    resetToDefaults,
    isEditing,
    setIsEditing,
  } = useDashboardSettings();

  const { data: dashboardData } = useApi<{ stats?: DashboardStats; message?: string }>(
    orgId ? `/api/evergreen/reports?action=dashboard&org=${orgId}` : null,
    { immediate: !!orgId }
  );
  const { data: holdsData } = useApi<{ holds?: HoldsStats }>(
    orgId ? `/api/evergreen/reports?action=holds&org=${orgId}` : null,
    { immediate: !!orgId }
  );

  const stats = dashboardData?.stats || undefined;
  const holds = holdsData?.holds || undefined;
  const enabledIds = useMemo(
    () => new Set(enabledWidgets.map((widget) => widget.id)),
    [enabledWidgets]
  );
  const orderedWidgetIds = useMemo(
    () => enabledWidgets.map((widget) => widget.id),
    [enabledWidgets]
  );

  const topWidgetIds = orderedWidgetIds.filter((id) => id === "universal-search");
  const mainWidgetIds = orderedWidgetIds.filter(
    (id) => id === "desk-actions" || id === "shift-checklist"
  );
  const sideWidgetIds = orderedWidgetIds.filter(
    (id) =>
      id === "alerts" ||
      id === "operational-snapshot" ||
      (id === "ops-assistant" && featureFlags.ai)
  );

  const moveWidget = (widgetId: string, direction: "up" | "down") => {
    const ordered = [...allWidgets].sort((a, b) => a.order - b.order).map((widget) => widget.id);
    const index = ordered.indexOf(widgetId);
    if (index < 0) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;

    const next = [...ordered];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved!);
    reorderWidgets(next);
  };

  const renderMainWidget = (id: string) => {
    if (id === "desk-actions") return <DeskActionsWidget key={id} />;
    if (id === "shift-checklist") return <ShiftChecklistWidget key={id} />;
    return null;
  };

  const renderSideWidget = (id: string) => {
    if (id === "alerts") return <AlertsWidget key={id} stats={stats} />;
    if (id === "operational-snapshot") return <OperationalSnapshotWidget key={id} stats={stats} />;
    if (id === "ops-assistant") {
      return <OpsAssistantWidget key={id} orgId={orgId} stats={stats} holds={holds} />;
    }
    return null;
  };

  const hasBodyWidgets = mainWidgetIds.length > 0 || sideWidgetIds.length > 0;
  const showDateDisplay = enabledIds.has("date-display");

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
          {
            label: isEditing ? "Done" : "Customize",
            onClick: () => setIsEditing(!isEditing),
            icon: Settings2,
            variant: isEditing ? "default" : "outline",
          },
        ]}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            {showDateDisplay && (
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
            {typeof dashboardData?.message === "string" && (
              <div className="text-xs text-muted-foreground">{dashboardData.message}</div>
            )}
          </div>
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        {isEditing && (
          <DashboardCustomizationPanel
            allWidgets={allWidgets}
            isSaving={isSaving}
            onToggle={toggleWidget}
            onMove={moveWidget}
            onReset={resetToDefaults}
          />
        )}

        {topWidgetIds.map((id) =>
          id === "universal-search" ? <DeskSearchWidget key={id} /> : null
        )}

        {hasBodyWidgets ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {mainWidgetIds.map((id) => renderMainWidget(id))}
            </div>

            <div className="space-y-6">{sideWidgetIds.map((id) => renderSideWidget(id))}</div>
          </div>
        ) : topWidgetIds.length === 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">No Dashboard Widgets Enabled</CardTitle>
              <CardDescription>
                Use Customize to enable widgets for your desk workflow.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={resetToDefaults} disabled={isSaving}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset to Defaults
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </PageContent>
    </PageContainer>
  );
}
