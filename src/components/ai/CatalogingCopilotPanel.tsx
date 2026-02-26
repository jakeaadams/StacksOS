"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  BookOpen,
  Tag,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithAuth } from "@/lib/client-fetch";

type SubjectSuggestion = {
  heading: string;
  source: "lcsh" | "sears" | "fast" | "inferred";
  confidence: "high" | "medium" | "low";
  provenance: string;
};

type ClassificationSuggestion = {
  ddc?: string;
  lcc?: string;
  confidence: "high" | "medium" | "low";
  provenance: string;
};

type MetadataImprovement = {
  field: string;
  current?: string;
  suggested: string;
  reason: string;
};

type CatalogingCopilotResponse = {
  summary: string;
  subjectSuggestions: SubjectSuggestion[];
  classificationSuggestion?: ClassificationSuggestion;
  metadataImprovements: MetadataImprovement[];
  caveats?: string[];
};

export type MarcDataProps = {
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  existingSubjects?: string[];
  existingClassification?: string;
  physicalDescription?: string;
};

type CatalogingCopilotPanelProps = {
  marcData: MarcDataProps;
  bibId?: number;
  onAcceptSubject?: (heading: string) => void;
  onAcceptImprovement?: (field: string, value: string) => void;
  className?: string;
};

// Uses design system CSS variables (--status-success-*, --status-warning-*) for theme consistency
const confidenceColors = {
  high: "border-[hsl(var(--status-success))]",
  medium: "border-[hsl(var(--status-warning))]",
  low: "border-border text-muted-foreground",
};

const confidenceInlineStyles: Record<string, React.CSSProperties> = {
  high: {
    backgroundColor: "hsl(var(--status-success-bg))",
    color: "hsl(var(--status-success-text))",
  },
  medium: {
    backgroundColor: "hsl(var(--status-warning-bg))",
    color: "hsl(var(--status-warning-text))",
  },
  low: {},
};

const sourceLabels: Record<string, string> = {
  lcsh: "LCSH",
  sears: "Sears",
  fast: "FAST",
  inferred: "Inferred",
};

export function CatalogingCopilotPanel({
  marcData,
  bibId,
  onAcceptSubject,
  onAcceptImprovement,
  className,
}: CatalogingCopilotPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<CatalogingCopilotResponse | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [acceptedSubjects, setAcceptedSubjects] = useState<Set<string>>(new Set());
  const [rejectedSubjects, setRejectedSubjects] = useState<Set<string>>(new Set());

  const handleAnalyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setAcceptedSubjects(new Set());
    setRejectedSubjects(new Set());

    try {
      const res = await fetchWithAuth("/api/ai/cataloging-copilot", {
        method: "POST",
        body: JSON.stringify({ marcData, bibId }),
      });
      const data = await res.json();
      if (!data?.ok) {
        throw new Error(data?.error || "Cataloging copilot request failed");
      }
      setResponse(data.response);
      setDegraded(data.meta?.degraded === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [marcData, bibId, loading]);

  const handleAcceptSubject = useCallback(
    (heading: string) => {
      setAcceptedSubjects((prev) => new Set(prev).add(heading));
      setRejectedSubjects((prev) => {
        const next = new Set(prev);
        next.delete(heading);
        return next;
      });
      onAcceptSubject?.(heading);
    },
    [onAcceptSubject]
  );

  const handleRejectSubject = useCallback((heading: string) => {
    setRejectedSubjects((prev) => new Set(prev).add(heading));
    setAcceptedSubjects((prev) => {
      const next = new Set(prev);
      next.delete(heading);
      return next;
    });
  }, []);

  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Cataloging Copilot
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              AI
            </Badge>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <CardDescription>
          AI-assisted subject, classification, and metadata suggestions
        </CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={loading || !marcData.title}
            className="w-full"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {loading ? "Analyzing..." : "Analyze Record"}
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
              AI provider unavailable. Showing deterministic fallback suggestions.
            </div>
          )}

          {response && (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-4 pr-2">
                {/* Summary */}
                <p className="text-sm text-muted-foreground">{response.summary}</p>

                {/* Subject Suggestions */}
                {response.subjectSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Tag className="h-4 w-4" />
                      Subject Suggestions
                    </div>
                    {response.subjectSuggestions.map((s, i) => {
                      const key = `${s.heading}-${i}`;
                      const accepted = acceptedSubjects.has(s.heading);
                      const rejected = rejectedSubjects.has(s.heading);
                      return (
                        <div
                          key={key}
                          className={cn(
                            "border rounded-lg p-3 space-y-1",
                            accepted && "opacity-100",
                            rejected && "opacity-60"
                          )}
                          style={
                            accepted
                              ? {
                                  borderColor: "hsl(var(--status-success-text))",
                                  backgroundColor: "hsl(var(--status-success-bg) / 0.5)",
                                }
                              : rejected
                                ? {
                                    borderColor: "hsl(var(--status-error-text) / 0.4)",
                                    backgroundColor: "hsl(var(--status-error-bg) / 0.3)",
                                  }
                                : undefined
                          }
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <span className="text-sm font-medium">{s.heading}</span>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px]", confidenceColors[s.confidence])}
                                  style={confidenceInlineStyles[s.confidence]}
                                >
                                  {s.confidence}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {sourceLabels[s.source] || s.source}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{s.provenance}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant={accepted ? "default" : "outline"}
                                className="h-7 w-7 p-0"
                                onClick={() => handleAcceptSubject(s.heading)}
                                title="Accept"
                                aria-label={`Accept subject: ${s.heading}`}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant={rejected ? "destructive" : "outline"}
                                className="h-7 w-7 p-0"
                                onClick={() => handleRejectSubject(s.heading)}
                                title="Reject"
                                aria-label={`Reject subject: ${s.heading}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Classification Suggestion */}
                {response.classificationSuggestion && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Layers className="h-4 w-4" />
                      Classification
                    </div>
                    <div className="border rounded-lg p-3 space-y-1">
                      {response.classificationSuggestion.ddc && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">DDC: </span>
                          <span className="font-mono">{response.classificationSuggestion.ddc}</span>
                        </div>
                      )}
                      {response.classificationSuggestion.lcc && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">LCC: </span>
                          <span className="font-mono">{response.classificationSuggestion.lcc}</span>
                        </div>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          confidenceColors[response.classificationSuggestion.confidence]
                        )}
                        style={confidenceInlineStyles[response.classificationSuggestion.confidence]}
                      >
                        {response.classificationSuggestion.confidence}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {response.classificationSuggestion.provenance}
                      </p>
                    </div>
                  </div>
                )}

                {/* Metadata Improvements */}
                {response.metadataImprovements.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <BookOpen className="h-4 w-4" />
                      Metadata Improvements
                    </div>
                    {response.metadataImprovements.map((m, i) => (
                      <div key={`${m.field}-${i}`} className="border rounded-lg p-3 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {m.field}
                            </Badge>
                            {m.current && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Current: {m.current}
                              </p>
                            )}
                            <p className="text-sm mt-1">{m.suggested}</p>
                            <p className="text-xs text-muted-foreground mt-1">{m.reason}</p>
                          </div>
                          {onAcceptImprovement && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0"
                              onClick={() => onAcceptImprovement(m.field, m.suggested)}
                            >
                              Apply
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Caveats */}
                {response.caveats && response.caveats.length > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 space-y-1">
                    {response.caveats.map((c, i) => (
                      <p key={i}>{c}</p>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {!response && !loading && !error && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Click &quot;Analyze Record&quot; to get AI-powered cataloging suggestions.
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
