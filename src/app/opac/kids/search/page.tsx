"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, useCallback, Suspense } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  BookOpen,
  Filter,
  Grid,
  LayoutList,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { LoadingSpinner } from "@/components/shared/loading-state";
import { useTranslations } from "next-intl";

interface SearchResult {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  format?: string;
  readingLevel?: string;
  availableCopies: number;
  totalCopies: number;
}

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "popularity", label: "Popular" },
  { value: "create_date", label: "New" },
  { value: "title_asc", label: "Title A–Z" },
];

function getCoverUrl(record: any): string | undefined {
  const isbn = record.isbn || record.simple_record?.isbn;
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  }
  return undefined;
}

function transformResults(records: any[]): SearchResult[] {
  return records.map((record) => ({
    id: record.id || record.record_id,
    title: record.title || record.simple_record?.title || "Unknown Title",
    author: record.author || record.simple_record?.author || "",
    coverUrl: getCoverUrl(record),
    format: record.format || record.icon_format,
    readingLevel: record.lexile
      ? `Lexile ${record.lexile}`
      : record.ar_level
        ? `AR ${record.ar_level}`
        : undefined,
    availableCopies: record.available_copies || record.availability?.available || 0,
    totalCopies: record.total_copies || record.availability?.total || 0,
  }));
}

function KidsSearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || "";
  const sort = searchParams.get("sort") || "relevance";
  const order = searchParams.get("order") || "";
  const format = searchParams.get("format") || "";
  const availableOnly = searchParams.get("available") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [searchInput, setSearchInput] = useState(query);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);

  const limit = 24;

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      // Reset to page 1 when anything but page changes
      if (!("page" in updates)) {
        params.delete("page");
      }

      router.push(`/opac/kids/search?${params.toString()}`);
    },
    [router, searchParams]
  );

  const searchCatalog = useCallback(async () => {
    const hasBrowseIntent =
      Boolean(query) || Boolean(format) || availableOnly || sort !== "relevance";
    if (!hasBrowseIntent) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (type) params.set("type", type);
      params.set("audience", "juvenile");
      params.set("limit", String(limit));
      params.set("offset", String((page - 1) * limit));

      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);
      if (format) params.set("format", format);
      if (availableOnly) params.set("available", "true");

      // Reading level filter — mapped to audience/item_type refinements
      const level = searchParams.get("level");
      if (level === "early") params.set("item_type", "easy_reader");
      else if (level === "elementary") params.set("audience_grade", "K-3");
      else if (level === "middle") params.set("audience_grade", "4-6");

      const response = await fetchWithAuth(`/api/evergreen/catalog?${params}`);
      if (response.ok) {
        const data = await response.json();
        setResults(transformResults(data.records || []));
        const totalCount =
          Number(data.count) || (Array.isArray(data.records) ? data.records.length : 0);
        setTotalResults(totalCount);
      }
    } catch (err) {
      clientLogger.error("Search error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [availableOnly, format, order, page, query, sort, type]);

  useEffect(() => {
    void searchCatalog();
  }, [searchCatalog]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateSearchParams({ q: searchInput });
  };

  const totalPages = Math.ceil(totalResults / limit);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Search Header */}
      <div className="mb-8">
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-6">
          <div className="relative">
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search for books..."
              aria-label="Search for books"
              className="w-full pl-5 pr-14 py-4 text-lg rounded-full border-2 kids-border-primary-wash
                       text-foreground placeholder:text-muted-foreground/70 bg-card
                       focus:outline-none kids-focus-border focus:ring-4 kids-focus-ring"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 kids-gradient-button text-white rounded-full
                       transition-colors"
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>
        </form>

        {/* Results info and controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {totalResults > 0 && (
              <p className="text-muted-foreground">
                Found <span className="font-bold kids-text-primary">{totalResults}</span> books
                {query && (
                  <>
                    {` for "`}
                    <span className="font-medium">{query}</span>
                    {`"`}
                  </>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Sort */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort:</span>
              <Select
                value={sort}
                onValueChange={(next) => {
                  updateSearchParams({
                    sort: next,
                    order: next === "create_date" ? "desc" : null,
                  });
                }}
              >
                <SelectTrigger className="w-[150px] rounded-xl border-2 bg-card text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter toggle */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-colors
                       ${
                         showFilters
                           ? "kids-border-primary-muted kids-bg-primary-wash kids-text-primary-hover"
                           : "border-border text-muted-foreground kids-hover-border-primary-wash"
                       }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </Button>

            {/* View toggle */}
            <div className="flex bg-card rounded-xl border-2 border-border overflow-hidden">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setViewMode("grid")}
                className={`rounded-none p-2 ${viewMode === "grid" ? "kids-bg-primary-light kids-text-primary-hover" : "text-muted-foreground"}`}
              >
                <Grid className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setViewMode("list")}
                className={`rounded-none p-2 ${viewMode === "list" ? "kids-bg-primary-light kids-text-primary-hover" : "text-muted-foreground"}`}
              >
                <LayoutList className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-card rounded-2xl border-2 kids-border-primary-light shadow-sm">
            <div className="flex flex-wrap gap-4">
              <div>
                <label
                  htmlFor="format"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Format
                </label>
                <Select
                  value={format || "all"}
                  onValueChange={(value) =>
                    updateSearchParams({ format: value === "all" ? null : value })
                  }
                >
                  <SelectTrigger id="format" className="w-[170px] rounded-lg border">
                    <SelectValue placeholder="All Formats" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Formats</SelectItem>
                    <SelectItem value="book">Books</SelectItem>
                    <SelectItem value="ebook">eBooks</SelectItem>
                    <SelectItem value="audiobook">Audiobooks</SelectItem>
                    <SelectItem value="dvd">DVDs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="availability"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Availability
                </label>
                <Select
                  value={availableOnly ? "available" : "all"}
                  onValueChange={(value) =>
                    updateSearchParams({ available: value === "available" ? "true" : null })
                  }
                >
                  <SelectTrigger id="availability" className="w-[170px] rounded-lg border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="available">Available Now</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="reading-level"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Reading Level
                </label>
                <Select
                  value={searchParams.get("level") || "all"}
                  onValueChange={(value) =>
                    updateSearchParams({ level: value === "all" ? null : value })
                  }
                >
                  <SelectTrigger id="reading-level" className="w-[170px] rounded-lg border">
                    <SelectValue placeholder="All Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="early">Early Readers</SelectItem>
                    <SelectItem value="elementary">Elementary (K-3)</SelectItem>
                    <SelectItem value="middle">Middle Grade (4-6)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={() => updateSearchParams({ format: null, available: null, level: null })}
                className="self-end px-4 py-2 text-sm kids-text-primary kids-hover-text-primary-hover"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <LoadingSpinner message="Searching..." size="lg" />
        </div>
      ) : results.length > 0 ? (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {results.map((book) => (
                <KidsSearchResultCard key={book.id} book={book} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((book) => (
                <KidsSearchResultListItem key={book.id} book={book} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                type="button"
                variant="outline"
                onClick={() => updateSearchParams({ page: String(Math.max(1, page - 1)) })}
                disabled={page === 1}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-card border-2 border-border
                         text-foreground/80 disabled:opacity-50 disabled:cursor-not-allowed
                         kids-hover-border-primary-wash transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              <span className="text-muted-foreground">
                Page <span className="font-bold kids-text-primary">{page}</span> of {totalPages}
              </span>

              <Button
                type="button"
                variant="outline"
                onClick={() => updateSearchParams({ page: String(Math.min(totalPages, page + 1)) })}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-card border-2 border-border
                         text-foreground/80 disabled:opacity-50 disabled:cursor-not-allowed
                         kids-hover-border-primary-wash transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      ) : query || format || availableOnly || sort !== "relevance" ? (
        <div className="text-center py-20 bg-card rounded-3xl">
          <div className="w-20 h-20 mx-auto mb-4 kids-bg-primary-light rounded-full flex items-center justify-center">
            <Search className="h-10 w-10 kids-text-primary-muted" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">No Books Found</h3>
          <p className="text-muted-foreground mb-6">Try searching for something else!</p>
          <Link
            href="/opac/kids"
            className="inline-flex items-center gap-2 px-6 py-3 kids-gradient-button
                     text-white rounded-full font-medium"
          >
            <Sparkles className="h-5 w-5" />
            Browse Categories
          </Link>
        </div>
      ) : (
        <div className="text-center py-20 bg-card rounded-3xl">
          <div className="w-20 h-20 mx-auto mb-4 kids-bg-primary-light rounded-full flex items-center justify-center">
            <BookOpen className="h-10 w-10 kids-text-primary-muted" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Ready to Search?</h3>
          <p className="text-muted-foreground">Type what you want to find above!</p>
        </div>
      )}
    </div>
  );
}

function KidsSearchResultCard({ book }: { book: SearchResult }) {
  const [imageError, setImageError] = useState(false);
  const isAvailable = book.availableCopies > 0;

  return (
    <Link href={`/opac/kids/record/${book.id}`} className="group block">
      <div
        className="relative aspect-[2/3] rounded-xl overflow-hidden kids-gradient-cover-placeholder
                    shadow-md group-hover:shadow-xl transition-all group-hover:-translate-y-1"
      >
        {book.coverUrl && !imageError ? (
          <Image
            src={book.coverUrl}
            alt={book.title}
            fill
            sizes="240px"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-12 w-12 kids-text-primary-muted" />
          </div>
        )}

        {/* Availability badge */}
        <div
          className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold shadow-sm
                      ${
                        isAvailable
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
        >
          {isAvailable ? "Available!" : "On Hold"}
        </div>

        {/* Reading level */}
        {book.readingLevel && (
          <div
            className="absolute top-2 left-2 px-2 py-1 bg-card/90 backdrop-blur-sm
                        rounded-full text-xs font-medium kids-text-primary-hover"
          >
            {book.readingLevel}
          </div>
        )}
      </div>

      <div className="mt-2">
        <h3 className="font-medium text-foreground text-sm line-clamp-2 kids-group-hover-text-primary">
          {book.title}
        </h3>
        {book.author && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
        )}
      </div>
    </Link>
  );
}

function KidsSearchResultListItem({ book }: { book: SearchResult }) {
  const [imageError, setImageError] = useState(false);
  const isAvailable = book.availableCopies > 0;

  return (
    <Link
      href={`/opac/kids/record/${book.id}`}
      className="flex gap-4 p-4 bg-card rounded-2xl border-2 border-transparent
               kids-hover-border-primary-wash hover:shadow-md transition-all group"
    >
      <div className="w-20 h-28 shrink-0 rounded-lg overflow-hidden kids-gradient-cover-placeholder">
        {book.coverUrl && !imageError ? (
          <Image
            src={book.coverUrl}
            alt={book.title}
            width={80}
            height={112}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-8 w-8 kids-text-primary-muted" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-foreground text-lg kids-group-hover-text-primary line-clamp-1">
          {book.title}
        </h3>
        {book.author && <p className="text-muted-foreground text-sm">{book.author}</p>}

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span
            className={`px-2 py-1 rounded-full text-xs font-bold
                        ${
                          isAvailable
                            ? "bg-green-100 text-green-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
          >
            {isAvailable ? "Available!" : "On Hold"}
          </span>

          {book.readingLevel && (
            <span className="px-2 py-1 kids-bg-primary-light kids-text-primary-hover rounded-full text-xs font-medium">
              {book.readingLevel}
            </span>
          )}

          {book.format && (
            <span className="px-2 py-1 bg-muted/50 text-muted-foreground rounded-full text-xs">
              {book.format}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function KidsSearchPage() {
  const _t = useTranslations("kidsSearch");
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <KidsSearchContent />
    </Suspense>
  );
}
