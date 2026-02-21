"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { AiCatalogingSuggestion, MarcRecord } from "./marc-types";
import { recordToLines, toCounts, applySuggestionToRecord } from "./marc-utils";

interface AiSuggestionsPanelProps {
  record: MarcRecord;
  aiLoading: boolean;
  aiError: string | null;
  aiDraftId: string | null;
  aiSuggestions: AiCatalogingSuggestion[];
  aiDecisions: Record<string, "accepted" | "rejected">;
  aiExpandedDiffs: Record<string, boolean>;
  onClose: () => void;
  onRunAi: () => void;
  onApplySuggestion: (s: AiCatalogingSuggestion) => void;
  onDecideSuggestion: (decision: "accepted" | "rejected", suggestionId: string) => void;
  onSetDecision: (id: string, decision: "accepted" | "rejected") => void;
  onToggleDiffExpanded: (id: string) => void;
}

export function AiSuggestionsPanel({
  record,
  aiLoading,
  aiError,
  aiDraftId,
  aiSuggestions,
  aiDecisions,
  aiExpandedDiffs,
  onClose,
  onRunAi,
  onApplySuggestion,
  onDecideSuggestion,
  onSetDecision,
  onToggleDiffExpanded,
}: AiSuggestionsPanelProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI suggestions
          </span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} title="Close AI panel" aria-label="Close AI panel">
            <X className="h-4 w-4" />
            <span className="sr-only">Close AI panel</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Draft-only suggestions. Nothing is applied until you accept a suggestion,
          and nothing is saved until you click Save Record.
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onRunAi} disabled={aiLoading}>
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Generate suggestions
          </Button>
          {aiDraftId ? <Badge variant="outline">Draft {aiDraftId.slice(0, 8)}</Badge> : null}
        </div>

        {aiError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {aiError}
          </div>
        )}

        {!aiLoading && aiSuggestions.length === 0 && !aiError ? (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            No suggestions yet.
          </div>
        ) : null}

        <div className="space-y-3">
          {aiSuggestions.map((s) => {
            const decision = aiDecisions[s.id];
            const preview = applySuggestionToRecord(record, s);
            const previewDiff = (() => {
              const before = toCounts(recordToLines(record));
              const after = toCounts(recordToLines(preview));
              const keys = new Set<string>([...before.keys(), ...after.keys()]);
              const rows = [...keys]
                .map((line) => {
                  const b = before.get(line) || 0;
                  const a = after.get(line) || 0;
                  if (a === b) return null;
                  if (a > b) return { line, kind: "added" as const };
                  return { line, kind: "removed" as const };
                })
                .filter(Boolean) as Array<{ line: string; kind: "added" | "removed" }>;
              return {
                added: rows.filter((r) => r.kind === "added"),
                removed: rows.filter((r) => r.kind === "removed"),
              };
            })();

            const showDiff = Boolean(aiExpandedDiffs[s.id]);
            const canAccept = !decision || decision !== "accepted";
            const canReject = !decision || decision !== "rejected";

            return (
              <div key={s.id} className="rounded-lg border bg-background p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{s.type}</Badge>
                      <Badge variant="outline">{Math.round((Number(s.confidence || 0) || 0) * 100)}%</Badge>
                      {decision ? (
                        <Badge className={decision === "accepted" ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10" : "bg-rose-500/10 text-rose-700 hover:bg-rose-500/10"}>
                          {decision}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-sm font-medium mt-1">{s.message}</div>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 px-2 py-2 font-mono text-xs whitespace-pre-wrap">
                  {s.suggestedValue}
                </div>

                {Array.isArray(s.provenance) && s.provenance.length > 0 ? (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="font-medium text-foreground/80">Provenance</div>
                    <ul className="list-disc pl-5">
                      {s.provenance.slice(0, 5).map((p, idx) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => { onApplySuggestion(s); onSetDecision(s.id, "accepted"); onDecideSuggestion("accepted", s.id); }} disabled={!canAccept}>
                      <ThumbsUp className="h-4 w-4 mr-1" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { onSetDecision(s.id, "rejected"); onDecideSuggestion("rejected", s.id); }} disabled={!canReject}>
                      <ThumbsDown className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onToggleDiffExpanded(s.id)} disabled={previewDiff.added.length + previewDiff.removed.length === 0}>
                    {showDiff ? "Hide diff" : "Show diff"}
                  </Button>
                </div>

                {showDiff ? (
                  <div className="rounded-lg border bg-background max-h-[260px] overflow-auto">
                    <div className="p-2 font-mono text-xs space-y-1">
                      {previewDiff.removed.map((r) => (
                        <div key={`r-${r.line}`} className="rounded-md px-2 py-1 bg-rose-50 text-rose-900">
                          <span className="inline-block w-4 text-center mr-1">-</span>
                          <span className="break-words">{r.line}</span>
                        </div>
                      ))}
                      {previewDiff.added.map((r) => (
                        <div key={`a-${r.line}`} className="rounded-md px-2 py-1 bg-emerald-50 text-emerald-900">
                          <span className="inline-block w-4 text-center mr-1">+</span>
                          <span className="break-words">{r.line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
