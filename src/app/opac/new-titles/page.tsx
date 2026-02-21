"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookCard } from "@/components/opac/book-card";
import {
  Sparkles,
  Filter,
  BookOpen,
  Smartphone,
  Headphones,
  Film,
  Music,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface NewTitle {
  id: number;
  title: string;
  author?: string;
  coverUrl?: string;
  publicationYear?: number;
  format: string;
  dateAdded: string;
  availableCopies: number;
  totalCopies: number;
}

function transformResults(records: any[]): NewTitle[] {
  return records.map((record) => ({
    id: record.id,
    title: record.title || "Unknown Title",
    author: record.author,
    coverUrl:
      record.coverUrl ||
      (record.isbn ? `https://covers.openlibrary.org/b/isbn/${record.isbn}-M.jpg` : undefined),
    publicationYear: record.pubdate ? parseInt(record.pubdate, 10) : undefined,
    format: record.format || "Book",
    dateAdded: record.create_date || record.createDate || new Date().toISOString(),
    availableCopies: record.availableCopies || 0,
    totalCopies: record.totalCopies || 0,
  }));
}

function getFORMAT_FILTERS(t: (key: string) => string) { return [
  { value: "all", label: t("allFormats"), icon: Sparkles },
  { value: "book", label: "Books", icon: BookOpen },
  { value: "ebook", label: "eBooks", icon: Smartphone },
  { value: "audiobook", label: "Audiobooks", icon: Headphones },
  { value: "dvd", label: "DVDs", icon: Film },
  { value: "music", label: "Music", icon: Music },
]; }

const TIME_FILTERS = [
  { value: "7", label: "Past Week" },
  { value: "30", label: "Past Month" },
  { value: "90", label: "Past 3 Months" },
  { value: "365", label: "Past Year" },
];

export default function NewTitlesPage() {
  const t = useTranslations("newTitles");
  const FORMAT_FILTERS = getFORMAT_FILTERS(t);
  const enabled = featureFlags.opacBrowseV2;
  const [titles, setTitles] = useState<NewTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formatFilter, setFormatFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("30");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 24;

  const fetchNewTitles = useCallback(async () => {
    if (!enabled) return;
    try {
      setIsLoading(true);

      const params = new URLSearchParams({
        q: "*",
        sort: "create_date",
        order: "desc",
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });

      if (formatFilter !== "all") {
        params.set("format", formatFilter);
      }

      // Add date filter based on time selection
      const daysAgo = parseInt(timeFilter);
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysAgo);
      params.set("since", sinceDate.toISOString().split("T")[0]!);

      const response = await fetchWithAuth(`/api/evergreen/catalog?${params}`);

      if (response.ok) {
        const data = await response.json();
        setTitles(transformResults(data.records || []));
        const totalCount =
          Number(data.count) || (Array.isArray(data.records) ? data.records.length : 0);
        setTotalPages(Math.max(1, Math.ceil(totalCount / pageSize)));
      }
    } catch (error) {
      clientLogger.error("Error fetching new titles:", error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, formatFilter, page, pageSize, timeFilter]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    void fetchNewTitles();
  }, [enabled, fetchNewTitles]);

  if (!enabled) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-sm border border-border p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">New titles are disabled</h1>
          <p className="text-muted-foreground mb-6">
            Curated browse experiences are behind an experimental feature flag.
          </p>
          <Link
            href="/opac/search"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white
                     rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            Search the catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Sparkles className="h-6 w-6 text-primary-600" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">New Arrivals</h1>
          </div>
          <p className="text-muted-foreground">Discover the latest additions to our collection.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Format filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Format:</span>
              <div className="flex gap-1">
                {FORMAT_FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.value}
                    onClick={() => {
                      setFormatFilter(filter.value);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                      ${
                        formatFilter === filter.value
                          ? "bg-primary-600 text-white"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time filter */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground">Added:</span>
              <select
                value={timeFilter}
                onChange={(e) => {
                  setTimeFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none 
                         focus:ring-2 focus:ring-primary-500"
              >
                {TIME_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : titles.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/70" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No new titles found</h3>
            <p className="mt-2 text-muted-foreground">
              Try adjusting your filters or check back later.
            </p>
          </div>
        ) : (
          <>
            {/* Grid of results */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {titles.map((title) => (
                <BookCard
                  key={title.id}
                  id={title.id}
                  title={title.title}
                  author={title.author}
                  coverUrl={title.coverUrl}
                  publicationYear={title.publicationYear}
                  availableCopies={title.availableCopies}
                  totalCopies={title.totalCopies}
                  variant="grid"
                  showFormats={false}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-border hover:bg-muted/30 
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <button
                        type="button"
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-10 h-10 rounded-lg font-medium transition-colors
                          ${
                            page === pageNum
                              ? "bg-primary-600 text-white"
                              : "border border-border hover:bg-muted/30"
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg border border-border hover:bg-muted/30 
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
