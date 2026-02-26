"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  StatusBadge,
  ErrorMessage,
  LoadingSpinner,
} from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Play,
  CheckCheck,
  ChevronRight,
  ExternalLink,
  Loader2,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OnboardingTaskPhase = "foundation" | "launch" | "optimization";
type OnboardingTaskStatus = "pass" | "warn" | "fail" | "unknown";

interface OnboardingTask {
  id: string;
  phase: OnboardingTaskPhase;
  title: string;
  description: string;
  deepLink: string;
  checkKeys: string[];
  status: OnboardingTaskStatus;
}

interface ProfilePlaybook {
  profile: string;
  intro: string;
  tasks: OnboardingTask[];
}

interface TaskCompletion {
  task_id: string;
  completed_at: string;
  completed_by: number | null;
  notes: string | null;
}

interface OnboardingData {
  summary: string;
  tenant: {
    tenantId: string;
    displayName: string;
    profile: string;
  };
  checks: Record<string, { status: string; ok: boolean; detail: string }>;
  profilePlaybook: ProfilePlaybook;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Phase config
// ---------------------------------------------------------------------------

const PHASES: { key: OnboardingTaskPhase; label: string; description: string }[] = [
  {
    key: "foundation",
    label: "Foundation",
    description: "Core infrastructure and connectivity checks",
  },
  {
    key: "launch",
    label: "Launch",
    description: "Profile-specific feature activation and validation",
  },
  {
    key: "optimization",
    label: "Optimization",
    description: "Fine-tuning, governance, and operational hardening",
  },
];

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusIcon(status: OnboardingTaskStatus, className?: string) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className={`h-5 w-5 text-green-600 ${className || ""}`} />;
    case "warn":
      return <AlertTriangle className={`h-5 w-5 text-amber-500 ${className || ""}`} />;
    case "fail":
      return <XCircle className={`h-5 w-5 text-red-600 ${className || ""}`} />;
    default:
      return <HelpCircle className={`h-5 w-5 text-muted-foreground ${className || ""}`} />;
  }
}

function statusLabel(status: OnboardingTaskStatus): string {
  switch (status) {
    case "pass":
      return "Passing";
    case "warn":
      return "Warning";
    case "fail":
      return "Failing";
    default:
      return "Unknown";
  }
}

function statusBadgeTone(
  status: OnboardingTaskStatus
): "success" | "warning" | "error" | "neutral" {
  switch (status) {
    case "pass":
      return "success";
    case "warn":
      return "warning";
    case "fail":
      return "error";
    default:
      return "neutral";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingWizardPage() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningChecks, setRunningChecks] = useState(false);
  const [markingTaskId, setMarkingTaskId] = useState<string | null>(null);

  // ---- Data loading ----

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setRunningChecks(true);
      const [onboardingRes, tasksRes] = await Promise.all([
        fetch("/api/admin/onboarding", { cache: "no-store" }),
        fetch("/api/admin/onboarding/tasks", { cache: "no-store" }),
      ]);
      const onboardingJson = await onboardingRes.json();
      const tasksJson = await tasksRes.json();

      if (!onboardingRes.ok || onboardingJson.ok === false) {
        throw new Error(onboardingJson.error || "Failed to load onboarding data");
      }
      setData(onboardingJson);

      if (tasksRes.ok && tasksJson.ok !== false) {
        setCompletions(tasksJson.completions || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRunningChecks(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ---- Mark task complete ----

  const markComplete = useCallback(async (taskId: string) => {
    try {
      setMarkingTaskId(taskId);
      const res = await fetch("/api/admin/onboarding/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Failed to mark task complete");
      }
      // Refresh completions
      const tasksRes = await fetch("/api/admin/onboarding/tasks", { cache: "no-store" });
      const tasksJson = await tasksRes.json();
      if (tasksRes.ok && tasksJson.ok !== false) {
        setCompletions(tasksJson.completions || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarkingTaskId(null);
    }
  }, []);

  // ---- Derived state ----

  const completedTaskIds = useMemo(() => new Set(completions.map((c) => c.task_id)), [completions]);

  const tasks = data?.profilePlaybook?.tasks || [];

  const tasksByPhase = useMemo(() => {
    const grouped: Record<OnboardingTaskPhase, OnboardingTask[]> = {
      foundation: [],
      launch: [],
      optimization: [],
    };
    for (const task of tasks) {
      if (grouped[task.phase]) {
        grouped[task.phase].push(task);
      }
    }
    return grouped;
  }, [tasks]);

  const phaseCompletion = useMemo(() => {
    const result: Record<OnboardingTaskPhase, { total: number; done: number; percent: number }> = {
      foundation: { total: 0, done: 0, percent: 0 },
      launch: { total: 0, done: 0, percent: 0 },
      optimization: { total: 0, done: 0, percent: 0 },
    };
    for (const phase of PHASES) {
      const phaseTasks = tasksByPhase[phase.key];
      const total = phaseTasks.length;
      const done = phaseTasks.filter(
        (t) => t.status === "pass" || completedTaskIds.has(t.id)
      ).length;
      result[phase.key] = {
        total,
        done,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }
    return result;
  }, [tasksByPhase, completedTaskIds]);

  const isPhaseGated = useCallback(
    (phase: OnboardingTaskPhase): boolean => {
      if (phase === "foundation") return false;
      if (phase === "launch") {
        return phaseCompletion.foundation.percent < 100;
      }
      // optimization requires launch complete
      return phaseCompletion.launch.percent < 100;
    },
    [phaseCompletion]
  );

  const overallPercent = useMemo(() => {
    const total = tasks.length;
    if (total === 0) return 0;
    const done = tasks.filter((t) => t.status === "pass" || completedTaskIds.has(t.id)).length;
    return Math.round((done / total) * 100);
  }, [tasks, completedTaskIds]);

  // ---- Render ----

  if (loading) {
    return (
      <PageContainer>
        <PageHeader
          title="Onboarding Wizard"
          subtitle="Loading onboarding status..."
          breadcrumbs={[{ label: "Administration", href: "/staff/admin" }, { label: "Onboarding" }]}
        />
        <PageContent className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Onboarding Wizard"
        subtitle={data?.profilePlaybook?.intro || "Profile-guided onboarding for your library."}
        breadcrumbs={[{ label: "Administration", href: "/staff/admin" }, { label: "Onboarding" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          {data?.tenant?.profile ? (
            <Badge variant="secondary" className="rounded-full capitalize">
              {data.tenant.profile} profile
            </Badge>
          ) : null}
          {data?.summary ? (
            <StatusBadge
              label={
                data.summary === "pass"
                  ? "All Checks Passing"
                  : data.summary === "warn"
                    ? "Warnings"
                    : "Issues Found"
              }
              status={
                data.summary === "pass" ? "success" : data.summary === "warn" ? "warning" : "error"
              }
            />
          ) : null}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        {error ? <ErrorMessage title="Onboarding Error" message={error} /> : null}

        {/* Overall progress */}
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Overall Progress</CardTitle>
                <CardDescription>
                  {data?.tenant?.displayName || "Tenant"} &mdash; {overallPercent}% complete
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadData()}
                disabled={runningChecks}
              >
                {runningChecks ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Run All Checks
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={overallPercent} className="mb-4" />
            <div className="grid gap-3 sm:grid-cols-3">
              {PHASES.map((phase, idx) => {
                const stats = phaseCompletion[phase.key];
                const gated = isPhaseGated(phase.key);
                return (
                  <div
                    key={phase.key}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      gated ? "opacity-50" : ""
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                        stats.percent === 100
                          ? "bg-green-100 text-green-700"
                          : stats.done > 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{phase.label}</span>
                        {gated ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Locked
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stats.done}/{stats.total} tasks
                      </div>
                    </div>
                    {stats.percent === 100 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Phase sections */}
        {PHASES.map((phase) => {
          const phaseTasks = tasksByPhase[phase.key];
          const gated = isPhaseGated(phase.key);
          const stats = phaseCompletion[phase.key];

          if (phaseTasks.length === 0) return null;

          return (
            <Card key={phase.key} className="rounded-2xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {phase.label}
                      {stats.percent === 100 ? (
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          Complete
                        </Badge>
                      ) : null}
                      {gated ? (
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          Complete previous phase first
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>{phase.description}</CardDescription>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {stats.done}/{stats.total}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {phaseTasks.map((task) => {
                  const isComplete = task.status === "pass" || completedTaskIds.has(task.id);
                  const isMarking = markingTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                        gated ? "opacity-50 pointer-events-none" : ""
                      } ${isComplete ? "bg-muted/30" : ""}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isComplete ? statusIcon("pass") : statusIcon(task.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{task.title}</span>
                          <StatusBadge
                            label={isComplete ? "Complete" : statusLabel(task.status)}
                            status={isComplete ? "success" : statusBadgeTone(task.status)}
                            size="sm"
                          />
                          {completedTaskIds.has(task.id) && task.status !== "pass" ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              Manually completed
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {!gated && !isComplete ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void loadData()}
                                disabled={runningChecks}
                              >
                                {runningChecks ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Play className="h-3 w-3 mr-1" />
                                )}
                                Run Check
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void markComplete(task.id)}
                                disabled={isMarking}
                              >
                                {isMarking ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <CheckCheck className="h-3 w-3 mr-1" />
                                )}
                                Mark Complete
                              </Button>
                            </>
                          ) : null}
                          <Link
                            href={task.deepLink}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {task.deepLink}
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}

        {/* Recommendations */}
        {data?.recommendations && data.recommendations.length > 0 ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Recommendations</CardTitle>
              <CardDescription>Suggestions based on current probe results.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {data.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </PageContent>
    </PageContainer>
  );
}
