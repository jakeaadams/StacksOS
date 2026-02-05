"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Sparkles } from "lucide-react";

export type ExplainFilter = {
  label: string;
  value: string;
};

type RankingMode = "keyword" | "hybrid";
type ExplainSort = "relevance" | "smart";

function tokenizeQuery(query: string): string[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const tokens = cleaned
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .slice(0, 12);
  return Array.from(new Set(tokens));
}

function pickTokenHits(tokens: string[], haystack: string): string[] {
  if (tokens.length === 0) return [];
  const text = haystack.toLowerCase();
  return tokens.filter((t) => text.includes(t));
}

export function WhyThisResultDialog({
  query,
  sort,
  rankingMode,
  title,
  author,
  summary,
  subjects,
  availableCopies,
  totalCopies,
  holdCount,
  semanticReason,
  semanticScore,
  filters,
  children,
}: {
  query: string;
  sort: ExplainSort;
  rankingMode: RankingMode;
  title: string;
  author?: string;
  summary?: string;
  subjects?: string[];
  availableCopies: number;
  totalCopies: number;
  holdCount: number;
  semanticReason?: string;
  semanticScore?: number;
  filters?: ExplainFilter[];
  children: React.ReactNode;
}) {
  const tokens = useMemo(() => tokenizeQuery(query), [query]);

  const matchSummary = useMemo(() => {
    const titleHits = pickTokenHits(tokens, title);
    const authorHits = author ? pickTokenHits(tokens, author) : [];
    const subjectText = Array.isArray(subjects) ? subjects.join(" ") : "";
    const subjectHits = subjectText ? pickTokenHits(tokens, subjectText) : [];
    const summaryHits = summary ? pickTokenHits(tokens, summary) : [];

    const directPhraseHit =
      query.trim().length >= 4 &&
      (title.toLowerCase().includes(query.trim().toLowerCase()) ||
        (author ? author.toLowerCase().includes(query.trim().toLowerCase()) : false));

    const fields: Array<{ label: string; hits: string[] }> = [
      { label: "Title", hits: titleHits },
      { label: "Author", hits: authorHits },
      { label: "Subjects", hits: subjectHits },
      { label: "Summary", hits: summaryHits },
    ].filter((f) => f.hits.length > 0);

    return {
      tokens,
      directPhraseHit,
      fields,
      hasAny: fields.length > 0 || directPhraseHit,
    };
  }, [author, query, subjects, summary, title, tokens]);

  const availabilityLabel = useMemo(() => {
    if (totalCopies <= 0) return "Availability unknown";
    if (availableCopies > 0) {
      return `${availableCopies} of ${totalCopies} copies available now`;
    }
    if (holdCount > 0) {
      return `All copies checked out • ${holdCount} ${holdCount === 1 ? "hold" : "holds"} in queue`;
    }
    return "All copies checked out";
  }, [availableCopies, holdCount, totalCopies]);

  const sortLabel = sort === "smart" ? "Smart (AI)" : "Relevance";
  const rankingLabel = sort === "smart" ? "Hybrid ranking" : "Keyword relevance ranking";

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Why this result?</DialogTitle>
          <DialogDescription>
            A best-effort explanation based on visible metadata, availability, and the selected sort mode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                {sort === "smart" ? (
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Search className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium">{sortLabel} sorting</div>
                  <Badge variant="secondary" className="rounded-full">
                    {rankingLabel}
                  </Badge>
                  {sort === "smart" && rankingMode === "hybrid" ? (
                    <Badge className="rounded-full">AI rerank</Badge>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {sort === "smart"
                    ? "StacksOS starts with keyword search results from Evergreen, then uses AI to re-rank based on semantic similarity."
                    : "Evergreen relevance depends on where your terms match (title/author/subjects), library field weights, and other local configuration."}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Signals for this item</div>

            <div className="rounded-2xl border border-border/70 p-3">
              <div className="text-xs font-medium text-muted-foreground">Matches</div>
              {query.trim() ? (
                matchSummary.hasAny ? (
                  <div className="mt-2 space-y-2 text-sm">
                    {matchSummary.directPhraseHit ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-muted-foreground">Exact phrase match</div>
                        <Badge className="rounded-full">Yes</Badge>
                      </div>
                    ) : null}
                    {matchSummary.fields.map((f) => (
                      <div key={f.label} className="flex items-start justify-between gap-3">
                        <div className="text-muted-foreground">{f.label}</div>
                        <div className="text-right">
                          <div className="font-mono text-xs">{f.hits.join(", ")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">
                    This record matched in the library catalog search, but the exact query terms do not appear in the fields shown
                    here. It may match other metadata (series, alternate titles, MARC fields, etc.).
                  </div>
                )
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">
                  No search query was provided. Results are driven by filters and sorting.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border/70 p-3">
              <div className="text-xs font-medium text-muted-foreground">Availability</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">{availabilityLabel}</div>
                {availableCopies > 0 ? (
                  <Badge className="rounded-full">Available</Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-full">
                    Checked out
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Some libraries boost available items for relevance sorting; exact weights vary by Evergreen configuration.
              </div>
            </div>

            {filters && filters.length > 0 ? (
              <div className="rounded-2xl border border-border/70 p-3">
                <div className="text-xs font-medium text-muted-foreground">Your filters</div>
                <div className="mt-2 space-y-2 text-sm">
                  {filters.map((f) => (
                    <div key={`${f.label}:${f.value}`} className="flex items-start justify-between gap-3">
                      <div className="text-muted-foreground">{f.label}</div>
                      <div className="text-right text-sm">{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {sort === "smart" ? (
              <div className="rounded-2xl border border-border/70 p-3">
                <div className="text-xs font-medium text-muted-foreground">AI rationale</div>
                <div className="mt-2 space-y-2 text-sm">
                  {semanticReason ? (
                    <div className="text-muted-foreground">{semanticReason}</div>
                  ) : (
                    <div className="text-muted-foreground">No AI rationale was provided for this result.</div>
                  )}
                  {typeof semanticScore === "number" ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-muted-foreground">Semantic score</div>
                      <div className="font-mono text-xs">{semanticScore.toFixed(2)}</div>
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    AI explanations are generated from bibliographic metadata and may be imperfect. Always verify key details in the
                    record view.
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground">
            Tip: Use filters to narrow results first, then switch between <span className="font-medium">Relevance</span> and{" "}
            <span className="font-medium">Smart (AI)</span> sorting to compare ranking behaviors.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

