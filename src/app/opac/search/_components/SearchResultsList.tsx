"use client";

import { useEffect, useState } from "react";
import { BookCard } from "@/components/opac/book-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles, AlertCircle, Search } from "lucide-react";
import Link from "next/link";
import { featureFlags } from "@/lib/feature-flags";
import { opacDesign } from "@/lib/design-system/opac";
import type { SearchResult } from "./search-constants";
import type { ExplainFilter } from "@/components/opac/why-this-result-dialog";

export interface SearchResultsListProps {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  query: string;
  viewMode: "grid" | "list";
  sort: string;
  rankingMode: "keyword" | "hybrid";
  aiSmartSearchOn: boolean;
  recordQueryString?: string;
  explainFilters: ExplainFilter[];
  totalResults: number;
  totalPages: number;
  page: number;
  onPlaceHold: (recordId: number) => void;
  onSaveToList: (record: { id: number; title?: string }) => void;
  onToggleAiSearch: () => void;
  onUpdateSearchParams: (updates: Record<string, string | null>) => void;
  t: (key: string, values?: Record<string, string>) => string;
}

export function SearchResultsList({
  results,
  isLoading,
  error,
  query,
  viewMode,
  sort,
  rankingMode,
  aiSmartSearchOn,
  recordQueryString,
  explainFilters,
  totalResults: _totalResults,
  totalPages,
  page,
  onPlaceHold,
  onSaveToList,
  onToggleAiSearch,
  onUpdateSearchParams,
  t,
}: SearchResultsListProps) {
  const explainSort = sort === "smart" ? "smart" : sort === "relevance" ? "relevance" : null;

  // Loading skeleton
  if (isLoading && results.length === 0 && !error) {
    return viewMode === "grid" ? (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="stx-surface rounded-xl overflow-hidden">
            <Skeleton className="aspect-[2/3] w-full" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="stx-surface flex gap-4 p-4 rounded-xl">
            <Skeleton className="h-36 w-24 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-red-800">{t("searchError")}</p>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Results
  if (results.length > 0) {
    return (
      <>
        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {results.map((result) => (
              <div key={result.id}>
                <BookCard
                  isbn={result.isbn}
                  id={result.id}
                  recordHref={`/opac/record/${result.id}${recordQueryString || ""}`}
                  title={result.title}
                  author={result.author}
                  coverUrl={result.coverUrl}
                  formats={result.formats}
                  availableCopies={result.availableCopies}
                  totalCopies={result.totalCopies}
                  holdCount={result.holdCount}
                  rating={result.rating}
                  summary={result.summary}
                  subjects={result.subjects}
                  explainQuery={explainSort ? query : undefined}
                  explainSort={explainSort || undefined}
                  explainRankingMode={rankingMode}
                  explainRankingScore={
                    sort === "smart" || aiSmartSearchOn ? result.rankingScore : undefined
                  }
                  explainFilters={explainSort ? explainFilters : undefined}
                  rankingReason={
                    sort === "smart" || aiSmartSearchOn ? result.rankingReason : undefined
                  }
                  variant="grid"
                  onAddToList={
                    featureFlags.opacLists
                      ? () => onSaveToList({ id: result.id, title: result.title })
                      : undefined
                  }
                  onPlaceHold={() => onPlaceHold(result.id)}
                />
                {aiSmartSearchOn && result.aiExplanation && (
                  <div className={`mt-1 rounded-lg px-2 py-1.5 ${opacDesign.aiCalloutContainer}`}>
                    <p className={`text-xs leading-snug ${opacDesign.aiCalloutText}`}>
                      <Sparkles className="h-3 w-3 inline-block mr-1 -mt-0.5" />
                      {result.aiExplanation}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result) => (
              <div key={result.id}>
                <BookCard
                  isbn={result.isbn}
                  id={result.id}
                  recordHref={`/opac/record/${result.id}${recordQueryString || ""}`}
                  title={result.title}
                  author={result.author}
                  coverUrl={result.coverUrl}
                  publicationYear={result.publicationYear}
                  summary={result.summary}
                  subjects={result.subjects}
                  formats={result.formats}
                  availableCopies={result.availableCopies}
                  totalCopies={result.totalCopies}
                  holdCount={result.holdCount}
                  rating={result.rating}
                  reviewCount={result.reviewCount}
                  rankingLabel={
                    (sort === "smart" || aiSmartSearchOn) && rankingMode === "hybrid"
                      ? "AI-ranked"
                      : undefined
                  }
                  rankingReason={
                    sort === "smart" || aiSmartSearchOn ? result.rankingReason : undefined
                  }
                  explainQuery={explainSort ? query : undefined}
                  explainSort={explainSort || undefined}
                  explainRankingMode={rankingMode}
                  explainRankingScore={
                    sort === "smart" || aiSmartSearchOn ? result.rankingScore : undefined
                  }
                  explainFilters={explainSort ? explainFilters : undefined}
                  variant="list"
                  showSummary
                  onAddToList={
                    featureFlags.opacLists
                      ? () => onSaveToList({ id: result.id, title: result.title })
                      : undefined
                  }
                  onPlaceHold={() => onPlaceHold(result.id)}
                />
                {aiSmartSearchOn && result.aiExplanation && (
                  <div
                    className={`mt-1 mr-0 md:mr-4 md:ml-28 rounded-lg px-3 py-2 ${opacDesign.aiCalloutContainer}`}
                  >
                    <p className={`text-sm leading-snug ${opacDesign.aiCalloutText}`}>
                      <Sparkles className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />
                      {result.aiExplanation}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onUpdateSearchParams({ page: (page - 1).toString() })}
              disabled={page === 1}
              className="stx-pill disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/30"
            >
              Previous
            </Button>
            <span className="px-4 py-2 text-sm text-foreground/80">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onUpdateSearchParams({ page: (page + 1).toString() })}
              disabled={page === totalPages}
              className="stx-pill disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/30"
            >
              Next
            </Button>
          </div>
        )}
      </>
    );
  }

  // No results
  if (!isLoading && query) {
    return (
      <NoResultsWithSpellcheck
        query={query}
        aiSmartSearchOn={aiSmartSearchOn}
        onToggleAiSearch={onToggleAiSearch}
        onUpdateSearchParams={onUpdateSearchParams}
        t={t}
      />
    );
  }

  return null;
}

/** Sub-component with spellcheck state */
function NoResultsWithSpellcheck({
  query,
  aiSmartSearchOn,
  onToggleAiSearch,
  onUpdateSearchParams,
  t,
}: {
  query: string;
  aiSmartSearchOn: boolean;
  onToggleAiSearch: () => void;
  onUpdateSearchParams: (updates: Record<string, string | null>) => void;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;

    void fetch(`/api/evergreen/spellcheck?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data.suggestion) {
          setSuggestion(data.suggestion);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="text-center py-12">
      <BookOpen className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-foreground mb-2">{t("noResultsFound")}</h2>
      <p className="text-muted-foreground mb-6">
        {`We couldn\u0027t find anything for "${query}". Try different keywords or browse our catalog.`}
      </p>

      {suggestion && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => onUpdateSearchParams({ q: suggestion, page: null })}
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-lg hover:underline"
          >
            <Search className="h-5 w-5" />
            Did you mean: <span className="italic">{suggestion}</span>?
          </button>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {aiSmartSearchOn && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleAiSearch}
            className={`rounded-lg px-4 py-2 ${opacDesign.aiToggleOutline}`}
          >
            Try Standard Search
          </Button>
        )}
        {!aiSmartSearchOn && (
          <Button
            type="button"
            size="sm"
            onClick={onToggleAiSearch}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 ${opacDesign.aiToggleSolid}`}
          >
            <Sparkles className="h-4 w-4" />
            Try AI Smart Search
          </Button>
        )}
        <Link
          href="/opac"
          className="rounded-lg bg-[linear-gradient(125deg,hsl(var(--brand-1))_0%,hsl(var(--brand-3))_88%)] px-4 py-2 text-white hover:brightness-110"
        >
          Browse Catalog
        </Link>
        <Link href="/opac/help" className={`rounded-lg px-4 py-2 ${opacDesign.subtleAction}`}>
          Search Tips
        </Link>
      </div>
    </div>
  );
}
