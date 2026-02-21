"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Columns2, Loader2, X } from "lucide-react";

interface DiffRow {
  line: string;
  kind: "same" | "added" | "removed";
  baseCount: number;
  compareCount: number;
  delta: number;
}

interface ComparePanelProps {
  recordId: string | null;
  compareDraft: string;
  compareLoading: boolean;
  compareError: string | null;
  compareBibInfo: { title: string; author: string } | null;
  compareIdParam: string | null;
  diffRows: DiffRow[];
  diffAdded: number;
  diffRemoved: number;
  hasCompare: boolean;
  diffOnly: boolean;
  canLoadCompare: boolean;
  onCompareDraftChange: (v: string) => void;
  onLoadCompare: (id: string) => void;
  onClearCompare: () => void;
  onCloseCompare: () => void;
}

export function ComparePanel({
  recordId,
  compareDraft,
  compareLoading,
  compareError,
  compareBibInfo,
  compareIdParam,
  diffRows,
  diffAdded,
  diffRemoved,
  hasCompare,
  diffOnly,
  canLoadCompare,
  onCompareDraftChange,
  onLoadCompare,
  onClearCompare,
  onCloseCompare,
}: ComparePanelProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <Columns2 className="h-4 w-4" />
            Compare records
          </span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCloseCompare} title="Close compare" aria-label="Close compare panel">
            <X className="h-4 w-4" />
            <span className="sr-only">Close compare</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Load another bib record ID to compare against the current record.
        </div>

        <div className="flex items-center gap-2">
          <Input value={compareDraft} onChange={(e) => onCompareDraftChange(e.target.value)} placeholder="Compare record ID (e.g. 123)" inputMode="numeric" />
          <Button
            onClick={() => {
              const id = compareDraft.trim();
              if (!/^\d+$/.test(id)) return;
              onLoadCompare(id);
            }}
            disabled={!canLoadCompare || compareLoading}
          >
            {compareLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Load
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">Tip: add `?compare=123` to deep-link this view.</div>
          <Button size="sm" variant="outline" onClick={onClearCompare} disabled={compareLoading}>Clear</Button>
        </div>

        {compareError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{compareError}</div>
        )}

        {compareBibInfo && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="text-sm font-medium truncate">{compareBibInfo.title || "Untitled"}</div>
            <div className="text-xs text-muted-foreground truncate">{compareBibInfo.author || "\u2014"}</div>
          </div>
        )}

        {hasCompare ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">Base #{recordId}</Badge>
              <Badge variant="outline">Compare #{compareDraft.trim() || compareIdParam}</Badge>
              <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">+{diffAdded}</Badge>
              <Badge className="bg-rose-500/10 text-rose-700 hover:bg-rose-500/10">-{diffRemoved}</Badge>
            </div>

            <div className="max-h-[520px] overflow-auto rounded-lg border bg-background">
              <div className="p-2 font-mono text-xs space-y-1">
                {diffRows
                  .filter((r) => !diffOnly || r.kind !== "same")
                  .map((r) => (
                    <div
                      key={r.line}
                      className={
                        "rounded-md px-2 py-1 leading-relaxed " +
                        (r.kind === "added"
                          ? "bg-emerald-50 text-emerald-900"
                          : r.kind === "removed"
                            ? "bg-rose-50 text-rose-900"
                            : "text-muted-foreground")
                      }
                    >
                      <span className="inline-block w-4 text-center mr-1">
                        {r.kind === "added" ? "+" : r.kind === "removed" ? "-" : "\u00b7"}
                      </span>
                      <span className="break-words">{r.line}</span>
                      {r.delta > 1 ? (
                        <span className="ml-2 text-[10px] text-muted-foreground">\u00d7{r.delta}</span>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            No compare record loaded yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
