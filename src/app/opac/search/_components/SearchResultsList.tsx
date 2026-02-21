"use client";

import { BookCard } from "@/components/opac/book-card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Sparkles, AlertCircle } from "lucide-react";
import Link from "next/link";
import { featureFlags } from "@/lib/feature-flags";
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
  explainFilters,
  totalResults,
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
          <div key={i} className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
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
          <div key={i} className="flex gap-4 p-4 bg-card rounded-xl shadow-sm border border-border">
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
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
                  explainRankingScore={sort === "smart" || aiSmartSearchOn ? result.rankingScore : undefined}
                  explainFilters={explainSort ? explainFilters : undefined}
                  rankingReason={sort === "smart" || aiSmartSearchOn ? result.rankingReason : undefined}
                  variant="grid"
                  onAddToList={featureFlags.opacLists ? () => onSaveToList({ id: result.id, title: result.title }) : undefined}
                  onPlaceHold={() => onPlaceHold(result.id)}
                />
                {aiSmartSearchOn && result.aiExplanation && (
                  <div className="mt-1 px-2 py-1.5 bg-purple-50 border border-purple-100 rounded-lg">
                    <p className="text-xs text-purple-700 leading-snug">
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
                    (sort === "smart" || aiSmartSearchOn) && rankingMode === "hybrid" ? "AI-ranked" : undefined
                  }
                  rankingReason={sort === "smart" || aiSmartSearchOn ? result.rankingReason : undefined}
                  explainQuery={explainSort ? query : undefined}
                  explainSort={explainSort || undefined}
                  explainRankingMode={rankingMode}
                  explainRankingScore={sort === "smart" || aiSmartSearchOn ? result.rankingScore : undefined}
                  explainFilters={explainSort ? explainFilters : undefined}
                  variant="list"
                  showSummary
                  onAddToList={featureFlags.opacLists ? () => onSaveToList({ id: result.id, title: result.title }) : undefined}
                  onPlaceHold={() => onPlaceHold(result.id)}
                />
                {aiSmartSearchOn && result.aiExplanation && (
                  <div className="mt-1 ml-28 mr-4 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg">
                    <p className="text-sm text-purple-700 leading-snug">
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
            <button
              type="button"
              onClick={() => onUpdateSearchParams({ page: (page - 1).toString() })}
              disabled={page === 1}
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/30"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-sm text-foreground/80">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onUpdateSearchParams({ page: (page + 1).toString() })}
              disabled={page === totalPages}
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/30"
            >
              Next
            </button>
          </div>
        )}
      </>
    );
  }

  // No results
  if (!isLoading && query) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">{t("noResultsFound")}</h2>
        <p className="text-muted-foreground mb-6">
          {`We couldn\u0027t find anything for "${query}". Try different keywords or browse our catalog.`}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {aiSmartSearchOn && (
            <button
              type="button"
              onClick={onToggleAiSearch}
              className="px-4 py-2 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50"
            >
              Try Standard Search
            </button>
          )}
          {!aiSmartSearchOn && (
            <button
              type="button"
              onClick={onToggleAiSearch}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Try AI Smart Search
            </button>
          )}
          <Link href="/opac" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            Browse Catalog
          </Link>
          <Link href="/opac/help" className="px-4 py-2 border border-border rounded-lg hover:bg-muted/30">
            Search Tips
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
