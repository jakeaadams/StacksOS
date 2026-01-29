"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BookCard, BookFormat } from "@/components/opac/BookCard";
import { useLibrary } from "@/hooks/useLibrary";
import { usePatronSession } from "@/hooks/usePatronSession";
import {
  Search,
  SlidersHorizontal,
  Grid,
  List,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  BookOpen,
  Smartphone,
  Headphones,
  MonitorPlay,
  Loader2,
  AlertCircle,
  ArrowUpDown,
} from "lucide-react";

interface SearchResult {
  id: number;
  title: string;
  author?: string;
  coverUrl?: string;
  publicationYear?: number;
  summary?: string;
  subjects?: string[];
  isbn?: string;
  formats: BookFormat[];
  availableCopies: number;
  totalCopies: number;
  holdCount: number;
  rating?: number;
  reviewCount?: number;
}

interface SearchFacet {
  name: string;
  values: { value: string; count: number; selected: boolean }[];
}

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "title_asc", label: "Title (A-Z)" },
  { value: "title_desc", label: "Title (Z-A)" },
  { value: "author_asc", label: "Author (A-Z)" },
  { value: "date_desc", label: "Newest First" },
  { value: "date_asc", label: "Oldest First" },
  { value: "popularity", label: "Most Popular" },
];

const FORMAT_FILTERS = [
  { value: "book", label: "Books", icon: BookOpen },
  { value: "ebook", label: "eBooks", icon: Smartphone },
  { value: "audiobook", label: "Audiobooks", icon: Headphones },
  { value: "dvd", label: "DVDs", icon: MonitorPlay },
];

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { library } = useLibrary();
  const { isLoggedIn, placeHold } = usePatronSession();

  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<SearchFacet[]>([]);

  // UI state
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedFacets, setExpandedFacets] = useState<string[]>(["format", "availability"]);

  // Search params
  const query = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const sort = searchParams.get("sort") || "relevance";
  const format = searchParams.get("format") || "";
  const available = searchParams.get("available") === "true";
  const location = searchParams.get("location") || "";

  const pageSize = 20;

  const performSearch = useCallback(async () => {
    if (!query && !format) return;

    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (format) params.set("format", format);
      if (available) params.set("available", "true");
      if (location) params.set("location", location);
      params.set("limit", pageSize.toString());
      params.set("offset", ((page - 1) * pageSize).toString());
      params.set("sort", sort);

      const response = await fetchWithAuth(`/api/evergreen/catalog?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Search failed. Please try again.");
      }

      const data = await response.json();

      // Check for API-level errors
      if (data.ok === false) {
        throw new Error(data.error || "Search failed");
      }

      // Transform results
      const transformedResults = (data.records || []).map((record: any) => ({
        id: record.id || record.record_id,
        title: record.title || record.simple_record?.title || "Unknown Title",
        author: record.author || record.simple_record?.author,
        coverUrl: getCoverUrl(record),
        publicationYear: record.pubdate || record.simple_record?.pubdate,
        summary: record.summary || record.simple_record?.abstract,
        subjects: record.subjects || [],
        isbn: record.isbn || record.simple_record?.isbn,
        formats: extractFormats(record),
        availableCopies: record.availability?.available || 0,
        totalCopies: record.availability?.total || 0,
        holdCount: record.hold_count || 0,
        rating: record.rating,
        reviewCount: record.review_count,
      }));

      setResults(transformedResults);
      setTotalResults(parseInt(data.count, 10) || transformedResults.length);

      // Build facets from response or defaults
      setFacets(buildFacets(data.facets));

    } catch (err) {
      clientLogger.error("Search error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [query, format, available, location, page, sort]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  const getCoverUrl = (record: any): string | undefined => {
    const isbn = record.isbn || record.simple_record?.isbn;
    if (isbn) {
      return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
    }
    return undefined;
  };

  const extractFormats = (record: any): BookFormat[] => {
    // Extract format information from record
    const formats: BookFormat[] = [];
    const copyInfo = record.availability || {};

    if (copyInfo.book || record.type === "book") {
      formats.push({
        type: "book",
        available: copyInfo.book?.available || copyInfo.available || 0,
        total: copyInfo.book?.total || copyInfo.total || 0,
      });
    }
    if (copyInfo.ebook) {
      formats.push({
        type: "ebook",
        available: copyInfo.ebook.available,
        total: copyInfo.ebook.total,
        eContentUrl: record.ebook_url,
      });
    }
    if (copyInfo.audiobook) {
      formats.push({
        type: "audiobook",
        available: copyInfo.audiobook.available,
        total: copyInfo.audiobook.total,
      });
    }
    if (copyInfo.dvd) {
      formats.push({
        type: "dvd",
        available: copyInfo.dvd.available,
        total: copyInfo.dvd.total,
      });
    }

    // If no specific formats, add generic based on available info
    if (formats.length === 0 && (copyInfo.available > 0 || copyInfo.total > 0)) {
      formats.push({
        type: "book",
        available: copyInfo.available || 0,
        total: copyInfo.total || 0,
      });
    }

    return formats;
  };

  const buildFacets = (facetData?: any): SearchFacet[] => {
    // Return default facets structure
    return [
      {
        name: "format",
        values: FORMAT_FILTERS.map(f => ({
          value: f.value,
          count: facetData?.format?.[f.value] || 0,
          selected: format === f.value,
        })),
      },
      {
        name: "availability",
        values: [
          { value: "available", count: 0, selected: available },
        ],
      },
    ];
  };

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    // Reset to page 1 when filters change
    if (!updates.page) {
      params.delete("page");
    }

    router.push(`/opac/search?${params.toString()}`);
  };

  const toggleFacet = (facetName: string) => {
    setExpandedFacets(prev => 
      prev.includes(facetName)
        ? prev.filter(f => f !== facetName)
        : [...prev, facetName]
    );
  };

  const handlePlaceHold = async (recordId: number) => {
    if (!isLoggedIn) {
      router.push(`/opac/login?redirect=/opac/record/${recordId}`);
      return;
    }
    // Would show a modal to select pickup location
    // For now, use default location
    const result = await placeHold(recordId, 1);
    if (result.success) {
      alert("Hold placed successfully!");
    } else {
      alert(result.message);
    }
  };

  const totalPages = Math.ceil(totalResults / pageSize);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Search header */}
      <div className="bg-card border-b border-border sticky top-[73px] z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Search form */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const newQuery = formData.get("q") as string;
              updateSearchParams({ q: newQuery });
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search by title, author, subject..."
                className="w-full pl-4 pr-10 py-3 border border-border rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
            <button type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-3 border rounded-lg flex items-center gap-2 transition-colors
                        ${showFilters 
                          ? "bg-primary-50 border-primary-300 text-primary-700" 
                          : "border-border text-foreground/80 hover:bg-muted/30"}`}
            >
              <SlidersHorizontal className="h-5 w-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </form>

          {/* Active filters */}
          {(format || available) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {format && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 
                               text-primary-800 rounded-full text-sm">
                  {FORMAT_FILTERS.find(f => f.value === format)?.label || format}
                  <button type="button" 
                    onClick={() => updateSearchParams({ format: null })}
                    className="hover:text-primary-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              )}
              {available && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 
                               text-green-800 rounded-full text-sm">
                  Available Now
                  <button type="button" 
                    onClick={() => updateSearchParams({ available: null })}
                    className="hover:text-green-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              )}
              <button type="button"
                onClick={() => updateSearchParams({ format: null, available: null })}
                className="text-sm text-muted-foreground hover:text-foreground/80"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Filters sidebar */}
          {showFilters && (
            <aside className="w-64 shrink-0">
              <div className="bg-card rounded-lg shadow-sm border border-border p-4 sticky top-[200px]">
                <h3 className="font-semibold text-foreground mb-4">Filters</h3>

                {/* Format filter */}
                <div className="border-b border-border pb-4 mb-4">
                  <button type="button"
                    onClick={() => toggleFacet("format")}
                    className="flex items-center justify-between w-full text-left font-medium text-foreground"
                  >
                    Format
                    {expandedFacets.includes("format") 
                      ? <ChevronUp className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                  {expandedFacets.includes("format") && (
                    <div className="mt-3 space-y-2">
                      {FORMAT_FILTERS.map((f) => {
                        const Icon = f.icon;
                        const isSelected = format === f.value;
                        return (
                          <button type="button"
                            key={f.value}
                            onClick={() => updateSearchParams({ 
                              format: isSelected ? null : f.value 
                            })}
                            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm
                                      transition-colors ${isSelected 
                                        ? "bg-primary-100 text-primary-800" 
                                        : "hover:bg-muted/50 text-foreground/80"}`}
                          >
                            <Icon className="h-4 w-4" />
                            {f.label}
                            {isSelected && <Check className="h-4 w-4 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Availability filter */}
                <div className="border-b border-border pb-4 mb-4">
                  <button type="button"
                    onClick={() => toggleFacet("availability")}
                    className="flex items-center justify-between w-full text-left font-medium text-foreground"
                  >
                    Availability
                    {expandedFacets.includes("availability") 
                      ? <ChevronUp className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />
                    }
                  </button>
                  {expandedFacets.includes("availability") && (
                    <div className="mt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={available}
                          onChange={(e) => updateSearchParams({ 
                            available: e.target.checked ? "true" : null 
                          })}
                          className="rounded border-border text-primary-600 
                                   focus:ring-primary-500"
                        />
                        <span className="text-sm text-foreground/80">Available now</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Location filter (if consortium) */}
                {library?.locations && library.locations.length > 1 && (
                  <div>
                    <button type="button"
                      onClick={() => toggleFacet("location")}
                      className="flex items-center justify-between w-full text-left font-medium text-foreground"
                    >
                      Location
                      {expandedFacets.includes("location") 
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />
                      }
                    </button>
                    {expandedFacets.includes("location") && (
                      <div className="mt-3">
                        <select
                          value={location}
                          onChange={(e) => updateSearchParams({ location: e.target.value || null })}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm
                                   focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">All Locations</option>
                          {library.locations.map((loc) => (
                            <option key={loc.id} value={loc.id.toString()}>
                              {loc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* Results */}
          <div className="flex-1">
            {/* Results header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                {isLoading ? (
                  <p className="text-muted-foreground">Searching...</p>
                ) : (
                  <p className="text-foreground/80">
                    {totalResults > 0 ? (
                      <>
                        <span className="font-semibold">{totalResults.toLocaleString()}</span>
                        {" results"}
                        {query && <>{` for "`}<span className="font-medium">{query}</span>{`"`}</>}
                      </>
                    ) : (
                      query ? `No results for "${query}"` : "Enter a search term"
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4">
                {/* Sort */}
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground/70" />
                  <select
                    value={sort}
                    onChange={(e) => updateSearchParams({ sort: e.target.value })}
                    className="border-0 bg-transparent text-sm font-medium text-foreground/80 
                             focus:outline-none focus:ring-0 cursor-pointer"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* View toggle */}
                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                  <button type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-2 ${viewMode === "grid" 
                      ? "bg-primary-100 text-primary-700" 
                      : "text-muted-foreground hover:bg-muted/50"}`}
                    aria-label="Grid view"
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button type="button"
                    onClick={() => setViewMode("list")}
                    className={`p-2 ${viewMode === "list" 
                      ? "bg-primary-100 text-primary-700" 
                      : "text-muted-foreground hover:bg-muted/50"}`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Search Error</p>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Results grid/list */}
            {!isLoading && !error && results.length > 0 && (
              <>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {results.map((result) => (
                      <BookCard
                        key={result.id}
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
                        variant="grid"
                        onPlaceHold={() => handlePlaceHold(result.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {results.map((result) => (
                      <BookCard
                        key={result.id}
                        isbn={result.isbn}
                        id={result.id}
                        title={result.title}
                        author={result.author}
                        coverUrl={result.coverUrl}
                        publicationYear={result.publicationYear}
                        summary={result.summary}
                        formats={result.formats}
                        availableCopies={result.availableCopies}
                        totalCopies={result.totalCopies}
                        holdCount={result.holdCount}
                        rating={result.rating}
                        reviewCount={result.reviewCount}
                        variant="list"
                        showSummary
                        onPlaceHold={() => handlePlaceHold(result.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <button type="button"
                      onClick={() => updateSearchParams({ page: (page - 1).toString() })}
                      disabled={page === 1}
                      className="px-4 py-2 border border-border rounded-lg text-sm font-medium
                               disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/30"
                    >
                      Previous
                    </button>
                    
                    <span className="px-4 py-2 text-sm text-foreground/80">
                      Page {page} of {totalPages}
                    </span>

                    <button type="button"
                      onClick={() => updateSearchParams({ page: (page + 1).toString() })}
                      disabled={page === totalPages}
                      className="px-4 py-2 border border-border rounded-lg text-sm font-medium
                               disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/30"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}

            {/* No results */}
            {!isLoading && !error && results.length === 0 && query && (
              <div className="text-center py-12">
                <BookOpen className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No results found</h3>
                <p className="text-muted-foreground mb-6">
                  We couldn\{`We couldn't find anything for "${query}"`}apos;t find anything for {`"${query}"`}. Try different keywords or browse our catalog.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link
                    href="/opac"
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Browse Catalog
                  </Link>
                  <Link
                    href="/opac/help"
                    className="px-4 py-2 border border-border rounded-lg hover:bg-muted/30"
                  >
                    Search Tips
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OPACSearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
