"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithAuth } from "@/lib/client-fetch";

type Highlight = {
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
};

type Action = {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
  deepLink?: string;
};

type Drilldown = {
  label: string;
  description: string;
};

type AdminCopilotResponse = {
  summary: string;
  highlights: Highlight[];
  actions: Action[];
  drilldowns?: Drilldown[];
};

export type AdminMetricsProps = {
  circulationToday: number;
  circulationWeek: number;
  overdueRate: number;
  holdFillRate: number;
  activePatrons: number;
  collectionSize: number;
  newAcquisitionsMonth?: number;
};

type AdminAlert = {
  type: string;
  message: string;
  severity: "critical" | "warning" | "info";
};

type AdminCopilotPanelProps = {
  orgId: number;
  metrics: AdminMetricsProps | null;
  alerts?: AdminAlert[];
  className?: string;
};

// Uses design system CSS variables (--status-error-*, --status-warning-*) for theme consistency
const priorityColors = {
  high: "border-[hsl(var(--status-error))]",
  medium: "border-[hsl(var(--status-warning))]",
  low: "border-border text-muted-foreground",
};

const priorityInlineStyles: Record<string, React.CSSProperties> = {
  high: {
    backgroundColor: "hsl(var(--status-error-bg))",
    color: "hsl(var(--status-error-text))",
  },
  medium: {
    backgroundColor: "hsl(var(--status-warning-bg))",
    color: "hsl(var(--status-warning-text))",
  },
  low: {},
};

const TrendIcon = ({ trend }: { trend: "up" | "down" | "flat" }) => {
  if (trend === "up")
    return <TrendingUp className="h-4 w-4" style={{ color: "hsl(var(--status-success-text))" }} />;
  if (trend === "down")
    return <TrendingDown className="h-4 w-4" style={{ color: "hsl(var(--status-error-text))" }} />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
};

export function AdminCopilotPanel({ orgId, metrics, alerts, className }: AdminCopilotPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AdminCopilotResponse | null>(null);
  const [degraded, setDegraded] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth("/api/ai/admin-copilot", {
        method: "POST",
        body: JSON.stringify({ orgId, metrics, alerts }),
      });
      const data = await res.json();
      if (!data?.ok) {
        throw new Error(data?.error || "Admin copilot request failed");
      }
      setResponse(data.response);
      setDegraded(data.meta?.degraded === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, metrics, alerts, loading]);

  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Admin Copilot
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            AI
          </Badge>
        </div>
        <CardDescription>
          AI-powered operational insights and action recommendations
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!metrics ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Connect to your Evergreen system to enable admin insights.</p>
            <p className="text-xs mt-1">Metrics data not yet available.</p>
          </div>
        ) : (
          <>
            <Button size="sm" onClick={handleAnalyze} disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-2" />
              )}
              {loading ? "Analyzing..." : "Analyze Operations"}
            </Button>

            {error && (
              <div
                className="flex items-center gap-2 text-sm rounded-lg p-3"
                style={{
                  color: "hsl(var(--status-error-text))",
                  backgroundColor: "hsl(var(--status-error-bg))",
                }}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {degraded && response && (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                AI provider unavailable. Showing threshold-based fallback analysis.
              </div>
            )}

            {response && (
              <ScrollArea className="max-h-[500px]">
                <div className="space-y-4 pr-2">
                  {/* Summary */}
                  <p className="text-sm text-muted-foreground">{response.summary}</p>

                  {/* Highlights */}
                  {response.highlights.length > 0 && (
                    <div className="grid gap-2 grid-cols-2">
                      {response.highlights.map((h, i) => (
                        <div
                          key={`${h.label}-${i}`}
                          className="border rounded-lg p-3 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-xs text-muted-foreground">{h.label}</p>
                            <p className="text-lg font-semibold">{h.value}</p>
                          </div>
                          <TrendIcon trend={h.trend} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  {response.actions.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Lightbulb className="h-4 w-4" />
                        Recommended Actions
                      </div>
                      {response.actions.map((a, i) => (
                        <div key={`${a.title}-${i}`} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{a.title}</span>
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px]", priorityColors[a.priority])}
                                  style={priorityInlineStyles[a.priority]}
                                >
                                  {a.priority}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {a.category}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                            </div>
                            {a.deepLink && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 shrink-0"
                                onClick={() => router.push(a.deepLink ?? "/")}
                              >
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Drilldowns */}
                  {response.drilldowns && response.drilldowns.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Suggested Drilldowns</div>
                      {response.drilldowns.map((d, i) => (
                        <div key={`${d.label}-${i}`} className="bg-muted/30 rounded-lg p-2">
                          <p className="text-xs font-medium">{d.label}</p>
                          <p className="text-xs text-muted-foreground">{d.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}

            {!response && !loading && !error && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Click &quot;Analyze Operations&quot; to get AI-powered operational insights.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
