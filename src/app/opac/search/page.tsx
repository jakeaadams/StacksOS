"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BookCard, BookFormat } from "@/components/opac/book-card";
import { AddToListDialog } from "@/components/opac/add-to-list-dialog";
import type { ExplainFilter } from "@/components/opac/why-this-result-dialog";
import { useLibrary } from "@/hooks/use-library";
import { usePatronSession } from "@/hooks/use-patron-session";
import { featureFlags } from "@/lib/feature-flags";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
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
  rankingReason?: string;
  rankingScore?: number;
}

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "smart", label: "Smart (AI)" },
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

const AUDIENCE_FILTERS = [
  { value: "general", label: "All ages" },
  { value: "juvenile", label: "Kids" },
  { value: "young_adult", label: "Teens" },
];

const LANGUAGE_LABELS: Record<string, string> = {
  eng: "English",
  spa: "Spanish",
  fre: "French",
  ger: "German",
  ita: "Italian",
  por: "Portuguese",
  rus: "Russian",
  chi: "Chinese",
  jpn: "Japanese",
  kor: "Korean",
  ara: "Arabic",
  hin: "Hindi",
};

function parseCsvParam(value: string): string[] {
  return (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { library } = useLibrary();
  const { isLoggedIn } = usePatronSession();

  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rankingMode, setRankingMode] = useState<"keyword" | "hybrid">("keyword");
  const [facets, setFacets] = useState<any>(null);
  const [saveTarget, setSaveTarget] = useState<{ bibId: number; title?: string } | null>(null);

  // UI state
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedFacets, setExpandedFacets] = useState<string[]>(["format", "availability"]);

  // Search params
  const query = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const sort = searchParams.get("sort") || "relevance";
  const format = searchParams.get("format") || "";
  const audience = searchParams.get("audience") || "";
  const language = searchParams.get("language") || "";
  const pubdateFrom = searchParams.get("pubdate_from") || "";
  const pubdateTo = searchParams.get("pubdate_to") || "";
  const available = searchParams.get("available") === "true";
  const location = searchParams.get("location") || "";

  const pageSize = 20;

  const selectedFormats = useMemo(
    () => parseCsvParam(format).map((v) => v.toLowerCase()),
    [format]
  );
  const selectedAudiences = useMemo(
    () => parseCsvParam(audience).map((v) => v.toLowerCase()),
    [audience]
  );
  const selectedLanguages = useMemo(
    () => parseCsvParam(language).map((v) => v.toLowerCase()),
    [language]
  );

  const languageOptions = useMemo(() => {
    const counts =
      facets?.languages && typeof facets.languages === "object" ? facets.languages : null;
    if (counts) {
      return Object.entries(counts as Record<string, number>)
        .filter(([k, v]) => Boolean(k) && typeof v === "number")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k]) => k.toLowerCase());
    }
    return Object.keys(LANGUAGE_LABELS);
  }, [facets]);

  const explainFilters = useMemo<ExplainFilter[]>(() => {
    const filters: ExplainFilter[] = [];

    if (selectedFormats.length > 0) {
      const labels = selectedFormats
        .map((v) => FORMAT_FILTERS.find((f) => f.value === v)?.label || v)
        .filter(Boolean);
      if (labels.length > 0) {
        filters.push({ label: "Format", value: labels.join(", ") });
      }
    }

    if (selectedAudiences.length > 0) {
      const labels = selectedAudiences
        .map((v) => AUDIENCE_FILTERS.find((a) => a.value === v)?.label || v)
        .filter(Boolean);
      if (labels.length > 0) {
        filters.push({ label: "Audience", value: labels.join(", ") });
      }
    }

    if (selectedLanguages.length > 0) {
      const labels = selectedLanguages.map((code) => LANGUAGE_LABELS[code] || code);
      filters.push({ label: "Language", value: labels.join(", ") });
    }

    if (pubdateFrom || pubdateTo) {
      filters.push({
        label: "Publication year",
        value: `${pubdateFrom || "…"}–${pubdateTo || "…"}`,
      });
    }

    if (available) {
      filters.push({ label: "Availability", value: "Available now" });
    }

    if (location) {
      const locName =
        library?.locations?.find((loc) => String(loc.id) === String(location))?.name ||
        `Location #${location}`;
      filters.push({ label: "Location", value: locName });
    }

    return filters;
  }, [
    available,
    library?.locations,
    location,
    pubdateFrom,
    pubdateTo,
    selectedAudiences,
    selectedFormats,
    selectedLanguages,
  ]);

  const performSearch = useCallback(async () => {
    const hasBrowseIntent =
      Boolean(format) ||
      Boolean(audience) ||
      Boolean(language) ||
      Boolean(pubdateFrom) ||
      Boolean(pubdateTo) ||
      available ||
      Boolean(location) ||
      sort !== "relevance";
    if (!query && !hasBrowseIntent) return;

    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (format) params.set("format", format);
      if (audience) params.set("audience", audience);
      if (language) params.set("language", language);
      if (pubdateFrom) params.set("pubdate_from", pubdateFrom);
      if (pubdateTo) params.set("pubdate_to", pubdateTo);
      if (available) params.set("available", "true");
      if (location) params.set("location", location);
      params.set("limit", pageSize.toString());
      params.set("offset", ((page - 1) * pageSize).toString());
      if (sort === "smart") {
        params.set("sort", "relevance");
        params.set("semantic", "1");
      } else {
        params.set("sort", sort);
      }

      const response = await fetchWithAuth(`/api/evergreen/catalog?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Search failed. Please try again.");
      }

      const data = await response.json();

      // Check for API-level errors
      if (data.ok === false) {
        throw new Error(data.error || "Search failed");
      }

      setFacets(data.facets || null);

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
        rankingReason: record.ranking?.semanticReason || undefined,
        rankingScore:
          typeof record.ranking?.semanticScore === "number"
            ? record.ranking.semanticScore
            : undefined,
      }));

      setResults(transformedResults);
      setTotalResults(parseInt(data.count, 10) || transformedResults.length);
      setRankingMode(data.rankingMode === "hybrid" ? "hybrid" : "keyword");
    } catch (err) {
      clientLogger.error("Search error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [query, format, audience, language, pubdateFrom, pubdateTo, available, location, page, sort]);

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

  const toggleCsvParamValue = (key: string, value: string) => {
    const current = parseCsvParam(searchParams.get(key) || "").map((v) => v.toLowerCase());
    const v = value.toLowerCase();
    const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
    updateSearchParams({ [key]: next.length ? next.join(",") : null });
  };

  const toggleFacet = (facetName: string) => {
    setExpandedFacets((prev) =>
      prev.includes(facetName) ? prev.filter((f) => f !== facetName) : [...prev, facetName]
    );
  };

  const handlePlaceHold = async (recordId: number) => {
    const holdUrl = `/opac/record/${recordId}?hold=1`;
    if (!isLoggedIn) {
      router.push(`/opac/login?redirect=${encodeURIComponent(holdUrl)}`);
      return;
    }
    router.push(holdUrl);
  };

  const handleSaveToList = useCallback(
    (record: { id: number; title?: string }) => {
      if (!featureFlags.opacLists) return;
      if (!isLoggedIn) {
        router.push(`/opac/login?redirect=${encodeURIComponent(`/opac/record/${record.id}`)}`);
        return;
      }
      setSaveTarget({ bibId: record.id, title: record.title });
    },
    [isLoggedIn, router]
  );

  const totalPages = Math.ceil(totalResults / pageSize);

  const explainSort = sort === "smart" ? "smart" : sort === "relevance" ? "relevance" : null;

  const clearAllFilters = () =>
    updateSearchParams({
      format: null,
      audience: null,
      language: null,
      pubdate_from: null,
      pubdate_to: null,
      available: null,
      location: null,
    });

  const filtersPanel = (
    <>
      {/* Format filter */}
      <div className="border-b border-border pb-4 mb-4">
        <button
          type="button"
          onClick={() => toggleFacet("format")}
          className="flex items-center justify-between w-full text-left font-medium text-foreground"
        >
          Format
          {expandedFacets.includes("format") ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedFacets.includes("format") ? (
          <div className="mt-3 space-y-2">
            {FORMAT_FILTERS.map((f) => {
              const Icon = f.icon;
              const isSelected = selectedFormats.includes(f.value);
              return (
                <button
                  type="button"
                  key={f.value}
                  onClick={() => {
                    if (featureFlags.opacFacetsV2) {
                      toggleCsvParamValue("format", f.value);
                    } else {
                      updateSearchParams({ format: isSelected ? null : f.value });
                    }
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? "bg-primary-100 text-primary-800"
                      : "hover:bg-muted/50 text-foreground/80"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {f.label}
                  {isSelected ? <Check className="h-4 w-4 ml-auto" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Availability filter */}
      <div className="border-b border-border pb-4 mb-4">
        <button
          type="button"
          onClick={() => toggleFacet("availability")}
          className="flex items-center justify-between w-full text-left font-medium text-foreground"
        >
          Availability
          {expandedFacets.includes("availability") ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {expandedFacets.includes("availability") ? (
          <div className="mt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) =>
                  updateSearchParams({ available: e.target.checked ? "true" : null })
                }
                className="rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-foreground/80">Available now</span>
            </label>
          </div>
        ) : null}
      </div>

      {/* Location filter (if consortium) */}
      {library?.locations && library.locations.length > 1 ? (
        <div className="border-b border-border pb-4 mb-4">
          <button
            type="button"
            onClick={() => toggleFacet("location")}
            className="flex items-center justify-between w-full text-left font-medium text-foreground"
          >
            Location
            {expandedFacets.includes("location") ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {expandedFacets.includes("location") ? (
            <div className="mt-3">
              <select
                value={location}
                onChange={(e) => updateSearchParams({ location: e.target.value || null })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All Locations</option>
                {library.locations.map((loc) => (
                  <option key={loc.id} value={loc.id.toString()}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {featureFlags.opacFacetsV2 ? (
        <>
          {/* Audience filter */}
          <div className="border-b border-border pb-4 mb-4">
            <button
              type="button"
              onClick={() => toggleFacet("audience")}
              className="flex items-center justify-between w-full text-left font-medium text-foreground"
            >
              Audience
              {expandedFacets.includes("audience") ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedFacets.includes("audience") ? (
              <div className="mt-3 space-y-2">
                {AUDIENCE_FILTERS.map((a) => {
                  const isSelected = selectedAudiences.includes(a.value);
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => toggleCsvParamValue("audience", a.value)}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? "bg-primary-100 text-primary-800"
                          : "hover:bg-muted/50 text-foreground/80"
                      }`}
                    >
                      {a.label}
                      {isSelected ? <Check className="h-4 w-4 ml-auto" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Language filter */}
          <div className="border-b border-border pb-4 mb-4">
            <button
              type="button"
              onClick={() => toggleFacet("language")}
              className="flex items-center justify-between w-full text-left font-medium text-foreground"
            >
              Language
              {expandedFacets.includes("language") ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedFacets.includes("language") ? (
              <div className="mt-3 space-y-2">
                {languageOptions.map((code) => {
                  const isSelected = selectedLanguages.includes(code);
                  const count =
                    facets?.languages && typeof facets.languages === "object"
                      ? (facets.languages as Record<string, number>)[code] ||
                        (facets.languages as Record<string, number>)[code.toUpperCase()]
                      : null;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleCsvParamValue("language", code)}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? "bg-primary-100 text-primary-800"
                          : "hover:bg-muted/50 text-foreground/80"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {LANGUAGE_LABELS[code] || code}
                      </span>
                      {typeof count === "number" ? (
                        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                      ) : null}
                      {isSelected ? <Check className="h-4 w-4" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Publication year */}
          <div className="border-b border-border pb-4 mb-4">
            <button
              type="button"
              onClick={() => toggleFacet("pubdate")}
              className="flex items-center justify-between w-full text-left font-medium text-foreground"
            >
              Publication year
              {expandedFacets.includes("pubdate") ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedFacets.includes("pubdate") ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">From</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={pubdateFrom}
                    onChange={(e) => updateSearchParams({ pubdate_from: e.target.value || null })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g. 2000"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">To</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={pubdateTo}
                    onChange={(e) => updateSearchParams({ pubdate_to: e.target.value || null })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g. 2026"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {featureFlags.opacLists && saveTarget ? (
        <AddToListDialog
          open={Boolean(saveTarget)}
          onOpenChange={(open) => {
            if (!open) setSaveTarget(null);
          }}
          bibId={saveTarget.bibId}
          title={saveTarget.title}
        />
      ) : null}

      {/* Mobile filters drawer (facets v2) */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="left" className="lg:hidden p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Filters</SheetTitle>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Updating results…
              </div>
            ) : null}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">{filtersPanel}</div>
          <SheetFooter className="border-t border-border flex-row gap-3">
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex-1 py-2 rounded-lg border border-border text-foreground/80 hover:bg-muted/30 transition-colors"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="flex-1 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors"
            >
              Show results
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-3 border rounded-lg flex items-center gap-2 transition-colors
                        ${
                          showFilters
                            ? "bg-primary-50 border-primary-300 text-primary-700"
                            : "border-border text-foreground/80 hover:bg-muted/30"
                        }`}
            >
              <SlidersHorizontal className="h-5 w-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </form>

          {/* Active filters */}
          {(selectedFormats.length > 0 ||
            selectedAudiences.length > 0 ||
            selectedLanguages.length > 0 ||
            Boolean(pubdateFrom) ||
            Boolean(pubdateTo) ||
            available ||
            Boolean(location)) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedFormats.map((f) => (
                <span
                  key={`format:${f}`}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm"
                >
                  {FORMAT_FILTERS.find((x) => x.value === f)?.label || f}
                  <button
                    type="button"
                    onClick={() => {
                      if (featureFlags.opacFacetsV2) toggleCsvParamValue("format", f);
                      else updateSearchParams({ format: null });
                    }}
                    className="hover:text-primary-900"
                    aria-label={`Remove format ${f}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}

              {selectedAudiences.map((a) => (
                <span
                  key={`audience:${a}`}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm"
                >
                  {AUDIENCE_FILTERS.find((x) => x.value === a)?.label || a}
                  <button
                    type="button"
                    onClick={() => toggleCsvParamValue("audience", a)}
                    className="hover:text-indigo-900"
                    aria-label={`Remove audience ${a}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}

              {selectedLanguages.map((code) => (
                <span
                  key={`language:${code}`}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-800 rounded-full text-sm"
                >
                  {LANGUAGE_LABELS[code] || code}
                  <button
                    type="button"
                    onClick={() => toggleCsvParamValue("language", code)}
                    className="hover:text-slate-900"
                    aria-label={`Remove language ${code}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}

              {(pubdateFrom || pubdateTo) && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm">
                  Year {pubdateFrom || "…"}–{pubdateTo || "…"}
                  <button
                    type="button"
                    onClick={() => updateSearchParams({ pubdate_from: null, pubdate_to: null })}
                    className="hover:text-amber-900"
                    aria-label="Remove publication year filter"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              )}

              {location ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-muted text-foreground/80 rounded-full text-sm">
                  {library?.locations?.find((l) => String(l.id) === location)?.name ||
                    `Location ${location}`}
                  <button
                    type="button"
                    onClick={() => updateSearchParams({ location: null })}
                    className="hover:text-foreground"
                    aria-label="Remove location filter"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ) : null}

              {available && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  Available now
                  <button
                    type="button"
                    onClick={() => updateSearchParams({ available: null })}
                    className="hover:text-green-900"
                    aria-label="Remove availability filter"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={() =>
                  updateSearchParams({
                    format: null,
                    audience: null,
                    language: null,
                    pubdate_from: null,
                    pubdate_to: null,
                    available: null,
                    location: null,
                  })
                }
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
          {showFilters ? (
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="bg-card rounded-lg shadow-sm border border-border p-4 sticky top-[200px]">
                <h3 className="font-semibold text-foreground mb-4">Filters</h3>
                {filtersPanel}
              </div>
            </aside>
          ) : null}

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
                        {query && (
                          <>
                            {` for "`}
                            <span className="font-medium">{query}</span>
                            {`"`}
                          </>
                        )}
                      </>
                    ) : query ? (
                      `No results for "${query}"`
                    ) : (
                      "Enter a search term"
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
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-2 ${
                      viewMode === "grid"
                        ? "bg-primary-100 text-primary-700"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                    aria-label="Grid view"
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`p-2 ${
                      viewMode === "list"
                        ? "bg-primary-100 text-primary-700"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Loading state (skeleton first paint) */}
            {isLoading && results.length === 0 && !error ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-card rounded-xl shadow-sm border border-border overflow-hidden"
                    >
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
                    <div
                      key={i}
                      className="flex gap-4 p-4 bg-card rounded-xl shadow-sm border border-border"
                    >
                      <Skeleton className="h-36 w-24 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}

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
            {!error && results.length > 0 && (
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
                        summary={result.summary}
                        subjects={result.subjects}
                        explainQuery={explainSort ? query : undefined}
                        explainSort={explainSort || undefined}
                        explainRankingMode={rankingMode}
                        explainRankingScore={sort === "smart" ? result.rankingScore : undefined}
                        explainFilters={explainSort ? explainFilters : undefined}
                        rankingReason={sort === "smart" ? result.rankingReason : undefined}
                        variant="grid"
                        onAddToList={
                          featureFlags.opacLists
                            ? () => handleSaveToList({ id: result.id, title: result.title })
                            : undefined
                        }
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
                        subjects={result.subjects}
                        formats={result.formats}
                        availableCopies={result.availableCopies}
                        totalCopies={result.totalCopies}
                        holdCount={result.holdCount}
                        rating={result.rating}
                        reviewCount={result.reviewCount}
                        rankingLabel={
                          sort === "smart" && rankingMode === "hybrid" ? "AI-ranked" : undefined
                        }
                        rankingReason={sort === "smart" ? result.rankingReason : undefined}
                        explainQuery={explainSort ? query : undefined}
                        explainSort={explainSort || undefined}
                        explainRankingMode={rankingMode}
                        explainRankingScore={sort === "smart" ? result.rankingScore : undefined}
                        explainFilters={explainSort ? explainFilters : undefined}
                        variant="list"
                        showSummary
                        onAddToList={
                          featureFlags.opacLists
                            ? () => handleSaveToList({ id: result.id, title: result.title })
                            : undefined
                        }
                        onPlaceHold={() => handlePlaceHold(result.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <button
                      type="button"
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

                    <button
                      type="button"
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
                  {`We couldn't find anything for "${query}". Try different keywords or browse our catalog.`}
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-muted/30 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
