"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BookFormat } from "@/components/opac/book-card";
import { AddToListDialog } from "@/components/opac/add-to-list-dialog";
import type { ExplainFilter } from "@/components/opac/why-this-result-dialog";
import { useLibrary } from "@/hooks/use-library";
import { usePatronSession } from "@/hooks/use-patron-session";
import { featureFlags } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Search,
  SlidersHorizontal,
  Grid,
  List,
  Loader2,
  ArrowUpDown,
  Sparkles,
  Info,
  BookOpen,
  Smartphone,
  Headphones,
  MonitorPlay,
  MapPin,
} from "lucide-react";
import { useTranslations } from "next-intl";

import type { SearchResult } from "./_components/search-constants";
import { getSORT_OPTIONS } from "./_components/search-constants";
import { SearchFiltersPanel } from "./_components/SearchFiltersPanel";
import { ActiveFilterChips } from "./_components/ActiveFilterChips";
import { SearchResultsList } from "./_components/SearchResultsList";

// Re-import utilities from search-constants that are used in the page
// (these are not exported from index but used internally)
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

type CatalogSearchScope = "local" | "system" | "consortium";

type OrgLookupEntry = { parentId: number | null; ouType: number | null };

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseCopyDepth(value: string | null, fallback = 1): number {
  const parsed = parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(99, Math.max(0, parsed));
}

function buildOrgLookup(tree: unknown): Record<number, OrgLookupEntry> {
  const lookup: Record<number, OrgLookupEntry> = {};
  const walk = (node: unknown, parentId: number | null) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, any>;
    const id = typeof record.id === "number" ? record.id : parseInt(String(record.id ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) return;

    const ouType =
      typeof record.ou_type === "number"
        ? record.ou_type
        : parseInt(String(record.ou_type ?? ""), 10);

    lookup[id] = {
      parentId,
      ouType: Number.isFinite(ouType) ? ouType : null,
    };

    const children = Array.isArray(record.children) ? record.children : [];
    for (const child of children) walk(child, id);
  };

  walk(tree, null);
  return lookup;
}

function resolveSystemOrgId(
  startOrgId: number | null,
  lookup: Record<number, OrgLookupEntry>,
  fallbackRoot: number
): number {
  if (!startOrgId || !lookup[startOrgId]) return fallbackRoot;
  let cursor: number | null = startOrgId;
  let guard = 0;
  while (cursor && guard < 32) {
    const entry: OrgLookupEntry | undefined = lookup[cursor];
    if (!entry) break;
    if (entry.ouType === 2) return cursor;
    cursor = entry.parentId;
    guard += 1;
  }
  return fallbackRoot;
}

const AI_SEARCH_STORAGE_KEY = "stacksos_ai_search_enabled";
function getStoredAiSearchEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AI_SEARCH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
function storeAiSearchEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AI_SEARCH_STORAGE_KEY, String(enabled));
  } catch {}
}

function getFORMAT_FILTERS(t: (key: string) => string) {
  return [
    { value: "book", label: t("booksFormat"), icon: BookOpen },
    { value: "ebook", label: t("eBooksFormat"), icon: Smartphone },
    { value: "audiobook", label: t("audiobooksFormat"), icon: Headphones },
    { value: "dvd", label: t("dvdsFormat"), icon: MonitorPlay },
  ];
}

function getAUDIENCE_FILTERS(t: (key: string) => string) {
  return [
    { value: "general", label: t("allAges") },
    { value: "juvenile", label: t("kids") },
    { value: "young_adult", label: t("teens") },
  ];
}

function SearchContent() {
  const t = useTranslations("searchPage");
  const SORT_OPTIONS = getSORT_OPTIONS(t);
  const FORMAT_FILTERS = getFORMAT_FILTERS(t);
  const AUDIENCE_FILTERS = getAUDIENCE_FILTERS(t);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { library, currentLocation } = useLibrary();
  const { isLoggedIn } = usePatronSession();

  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rankingMode, setRankingMode] = useState<"keyword" | "hybrid">("keyword");
  const [facets, setFacets] = useState<any>(null);
  const [saveTarget, setSaveTarget] = useState<{ bibId: number; title?: string } | null>(null);

  // AI search state
  const [aiSmartSearchOn, setAiSmartSearchOn] = useState(getStoredAiSearchEnabled);
  const [aiDecomposedInfo, setAiDecomposedInfo] = useState<{
    keywords?: string[];
    subjects?: string[];
    audience?: string | null;
    format?: string | null;
    searchQuery?: string;
  } | null>(null);

  // UI state
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedFacets, setExpandedFacets] = useState<string[]>(["format", "availability"]);
  const [orgLookup, setOrgLookup] = useState<Record<number, OrgLookupEntry>>({});
  const [discoveryDefaults, setDiscoveryDefaults] = useState<{
    defaultSearchScope: CatalogSearchScope;
    defaultCopyDepth: number;
    allowPatronScopeOverride: boolean;
  } | null>(null);

  // Search params
  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || searchParams.get("searchType") || "keyword";
  const page = parseInt(searchParams.get("page") || "1");
  const sort = searchParams.get("sort") || "relevance";
  const searchScopeParam = String(searchParams.get("search_scope") || "")
    .trim()
    .toLowerCase();
  const searchScope: CatalogSearchScope =
    searchScopeParam === "local" ||
    searchScopeParam === "system" ||
    searchScopeParam === "consortium"
      ? searchScopeParam
      : discoveryDefaults?.defaultSearchScope || "local";
  const copyDepth = parseCopyDepth(
    searchParams.get("copy_depth"),
    discoveryDefaults?.defaultCopyDepth ?? 1
  );
  const scopeOrgParam = parsePositiveInt(searchParams.get("scope_org"));
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
  const allowScopeOverride = discoveryDefaults?.allowPatronScopeOverride ?? true;

  useEffect(() => {
    const controller = new AbortController();
    const fetchDiscoveryDefaults = async () => {
      try {
        const response = await fetch("/api/opac/discovery-config", {
          signal: controller.signal,
          credentials: "include",
        });
        if (!response.ok) return;
        const json = await response.json().catch(() => null);
        const discovery = json?.discovery;
        if (!discovery) return;
        const defaultSearchScope =
          discovery.defaultSearchScope === "local" ||
          discovery.defaultSearchScope === "system" ||
          discovery.defaultSearchScope === "consortium"
            ? discovery.defaultSearchScope
            : "local";
        setDiscoveryDefaults({
          defaultSearchScope,
          defaultCopyDepth: parseCopyDepth(String(discovery.defaultCopyDepth ?? ""), 1),
          allowPatronScopeOverride: Boolean(discovery.allowPatronScopeOverride ?? true),
        });
      } catch {
        // Keep fallback defaults if discovery-config endpoint is unavailable.
      }
    };
    void fetchDiscoveryDefaults();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchOrgTree = async () => {
      try {
        const response = await fetch("/api/evergreen/orgs", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => null);
        const tree = data?.orgTree || data?.payload?.[0] || data;
        setOrgLookup(buildOrgLookup(tree));
      } catch {
        // Best-effort; scope falls back to root/local IDs if tree is unavailable.
      }
    };
    void fetchOrgTree();
    return () => controller.abort();
  }, []);

  const resolvedScopeOrgId = useMemo(() => {
    if (scopeOrgParam) return scopeOrgParam;
    const rootOrgId =
      Number.isFinite(library?.id) && (library?.id || 0) > 0 ? (library?.id as number) : 1;
    const locationOrgId = parsePositiveInt(location) || currentLocation?.id || null;
    if (searchScope === "consortium") return rootOrgId;
    if (searchScope === "local") return locationOrgId || rootOrgId;
    return resolveSystemOrgId(locationOrgId, orgLookup, rootOrgId);
  }, [scopeOrgParam, library?.id, location, currentLocation?.id, searchScope, orgLookup]);

  const recordQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("search_scope", searchScope);
    params.set("copy_depth", String(copyDepth));
    params.set("scope_org", String(resolvedScopeOrgId));
    return `?${params.toString()}`;
  }, [searchScope, copyDepth, resolvedScopeOrgId]);

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
      if (labels.length > 0) filters.push({ label: "Format", value: labels.join(", ") });
    }
    if (selectedAudiences.length > 0) {
      const labels = selectedAudiences
        .map((v) => AUDIENCE_FILTERS.find((a) => a.value === v)?.label || v)
        .filter(Boolean);
      if (labels.length > 0) filters.push({ label: "Audience", value: labels.join(", ") });
    }
    if (selectedLanguages.length > 0) {
      const labels = selectedLanguages.map((code) => LANGUAGE_LABELS[code] || code);
      filters.push({ label: "Language", value: labels.join(", ") });
    }
    if (pubdateFrom || pubdateTo)
      filters.push({
        label: "Publication year",
        value: `${pubdateFrom || "\u2026"}\u2013${pubdateTo || "\u2026"}`,
      });
    if (available) filters.push({ label: "Availability", value: "Available now" });
    if (location) {
      const locName =
        library?.locations?.find((loc) => String(loc.id) === String(location))?.name ||
        `Location #${location}`;
      filters.push({ label: "Location", value: locName });
    }
    return filters;
  }, [
    AUDIENCE_FILTERS,
    FORMAT_FILTERS,
    available,
    library?.locations,
    location,
    pubdateFrom,
    pubdateTo,
    selectedAudiences,
    selectedFormats,
    selectedLanguages,
  ]);

  const handleToggleAiSearch = useCallback(() => {
    setAiSmartSearchOn((prev) => {
      const next = !prev;
      storeAiSearchEnabled(next);
      return next;
    });
  }, []);

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
      setAiDecomposedInfo(null);

      if (aiSmartSearchOn && query) {
        const aiParams = new URLSearchParams();
        aiParams.set("q", query);
        aiParams.set("limit", pageSize.toString());
        aiParams.set("offset", ((page - 1) * pageSize).toString());
        aiParams.set("search_scope", searchScope);
        aiParams.set("copy_depth", String(copyDepth));
        aiParams.set("scope_org", String(resolvedScopeOrgId));
        const aiResponse = await fetchWithAuth(`/api/evergreen/ai-search?${aiParams.toString()}`);
        if (!aiResponse.ok) {
          const errData = await aiResponse.json().catch(() => ({}));
          throw new Error(errData.error || "AI search failed. Please try again.");
        }
        const aiData = await aiResponse.json();
        if (aiData.ok === false) throw new Error(aiData.error || "AI search failed");
        setAiDecomposedInfo(aiData.decomposed || null);
        const transformedResults = (aiData.records || []).map((record: any) => ({
          id: record.id,
          title: record.title || "Unknown Title",
          author: record.author,
          coverUrl: record.coverUrl,
          publicationYear: record.pubdate,
          summary: record.summary,
          subjects: record.subjects || [],
          isbn: record.isbn,
          formats: record.formats || [{ type: "book" as const, available: 0, total: 0 }],
          availableCopies: record.availability?.available || 0,
          totalCopies: record.availability?.total || 0,
          holdCount: record.hold_count || 0,
          rankingReason: record.ranking?.semanticReason || undefined,
          rankingScore: record.ranking?.semanticScore ?? undefined,
          aiExplanation: record.aiExplanation || undefined,
        }));
        setResults(transformedResults);
        setTotalResults(parseInt(aiData.count, 10) || transformedResults.length);
        setRankingMode("hybrid");
        setFacets(null);
        return;
      }

      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (type && type !== "keyword") params.set("type", type);
      params.set("search_scope", searchScope);
      params.set("copy_depth", String(copyDepth));
      params.set("scope_org", String(resolvedScopeOrgId));
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
      if (!response.ok) throw new Error("Search failed. Please try again.");
      const data = await response.json();
      if (data.ok === false) throw new Error(data.error || "Search failed");
      setFacets(data.facets || null);

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
  }, [
    query,
    type,
    searchScope,
    copyDepth,
    resolvedScopeOrgId,
    format,
    audience,
    language,
    pubdateFrom,
    pubdateTo,
    available,
    location,
    page,
    sort,
    aiSmartSearchOn,
  ]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);
  useEffect(() => {
    document.title = query ? `Search: ${query} | Library Catalog` : "Search | Library Catalog";
  }, [query]);

  const getCoverUrl = (record: any): string | undefined => {
    const isbn = record.isbn || record.simple_record?.isbn;
    return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : undefined;
  };

  const extractFormats = (record: any): BookFormat[] => {
    const formats: BookFormat[] = [];
    const copyInfo = record.availability || {};
    if (copyInfo.book || record.type === "book")
      formats.push({
        type: "book",
        available: copyInfo.book?.available || copyInfo.available || 0,
        total: copyInfo.book?.total || copyInfo.total || 0,
      });
    if (copyInfo.ebook)
      formats.push({
        type: "ebook",
        available: copyInfo.ebook.available,
        total: copyInfo.ebook.total,
        eContentUrl: record.ebook_url,
      });
    if (copyInfo.audiobook)
      formats.push({
        type: "audiobook",
        available: copyInfo.audiobook.available,
        total: copyInfo.audiobook.total,
      });
    if (copyInfo.dvd)
      formats.push({ type: "dvd", available: copyInfo.dvd.available, total: copyInfo.dvd.total });
    if (formats.length === 0 && (copyInfo.available > 0 || copyInfo.total > 0))
      formats.push({
        type: "book",
        available: copyInfo.available || 0,
        total: copyInfo.total || 0,
      });
    return formats;
  };

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    });
    if (!updates.page) params.delete("page");
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

  return (
    <div className="min-h-screen bg-transparent">
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

      {/* Mobile filters drawer */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="left" className="lg:hidden p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{t("filtersTitle")}</SheetTitle>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("updatingResults")}&hellip;
              </div>
            ) : null}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <SearchFiltersPanel
              formatFilters={FORMAT_FILTERS}
              audienceFilters={AUDIENCE_FILTERS}
              languageLabels={LANGUAGE_LABELS}
              languageOptions={languageOptions}
              facets={facets}
              selectedFormats={selectedFormats}
              selectedAudiences={selectedAudiences}
              selectedLanguages={selectedLanguages}
              pubdateFrom={pubdateFrom}
              pubdateTo={pubdateTo}
              available={available}
              location={location}
              locations={library?.locations}
              expandedFacets={expandedFacets}
              onToggleFacet={toggleFacet}
              onToggleCsvParam={toggleCsvParamValue}
              onUpdateSearchParams={updateSearchParams}
              t={t}
            />
          </div>
          <SheetFooter className="border-t border-border flex-row gap-3">
            <Button
              type="button"
              onClick={clearAllFilters}
              variant="outline"
              className="flex-1 text-foreground/80 hover:bg-muted/30"
            >
              Clear all
            </Button>
            <Button
              type="button"
              onClick={() => setShowFilters(false)}
              className="stx-action-primary flex-1 font-medium hover:brightness-110"
            >
              Show results
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Search header */}
      <div className="sticky top-[73px] z-40 border-b border-border/70 bg-card/84 supports-[backdrop-filter]:bg-card/72 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:py-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              updateSearchParams({ q: formData.get("q") as string });
            }}
            className="flex gap-2 md:gap-3"
          >
            <div className="relative flex-1">
              <Input
                type="text"
                name="q"
                defaultValue={query}
                placeholder={aiSmartSearchOn ? t("searchPlaceholderAI") : t("searchPlaceholder")}
                className={`h-[50px] rounded-xl border py-3.5 pl-4 pr-10 text-sm shadow-xs transition-all focus:border-transparent focus:outline-none focus:ring-4 focus:ring-[hsl(var(--ring))/0.35] ${aiSmartSearchOn ? "border-[hsl(var(--brand-1))/0.42] bg-[hsl(var(--brand-1))/0.09]" : "border-border/85 bg-card/80 backdrop-blur-sm"}`}
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="absolute right-2.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full text-muted-foreground/75 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>
            <Button
              type="button"
              onClick={handleToggleAiSearch}
              variant="outline"
              className={`whitespace-nowrap rounded-xl border px-4 py-3 text-sm font-medium tracking-[-0.01em] transition-colors flex items-center gap-2 ${aiSmartSearchOn ? "border-[hsl(var(--brand-1))/0.44] bg-[hsl(var(--brand-1))/0.11] text-[hsl(var(--brand-1))]" : "border-border/80 bg-card/80 text-foreground/85 hover:bg-muted/45"}`}
              title={aiSmartSearchOn ? "AI Smart Search is ON" : "Enable AI Smart Search"}
            >
              <Sparkles className="h-5 w-5" />
              <span className="hidden sm:inline">{t("aiSearch")}</span>
            </Button>
            <Button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              variant="outline"
              className={`rounded-xl border px-4 py-3 text-sm font-medium tracking-[-0.01em] transition-colors flex items-center gap-2 ${showFilters ? "border-[hsl(var(--brand-1))/0.45] bg-[hsl(var(--brand-1))/0.11] text-[hsl(var(--brand-1))]" : "border-border/80 bg-card/80 text-foreground/85 hover:bg-muted/45"}`}
            >
              <SlidersHorizontal className="h-5 w-5" />
              <span className="hidden sm:inline">{t("filters")}</span>
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border/75 bg-card/70 px-2.5 py-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
              <Select
                value={searchScope}
                onValueChange={(value) =>
                  updateSearchParams({
                    search_scope: value,
                    scope_org: null,
                    page: null,
                  })
                }
                disabled={!allowScopeOverride}
              >
                <SelectTrigger className="h-auto min-w-[170px] border-0 bg-transparent p-0 text-foreground shadow-none focus:ring-0">
                  <SelectValue aria-label="Search scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Search this library</SelectItem>
                  <SelectItem value="system">Search all branches</SelectItem>
                  <SelectItem value="consortium">Search all libraries</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {allowScopeOverride && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-border/75 bg-card/70 px-2.5 py-1.5">
                <span className="font-medium text-foreground/80">Include</span>
                <Select
                  value={String(copyDepth)}
                  onValueChange={(value) =>
                    updateSearchParams({
                      copy_depth: value,
                      page: null,
                    })
                  }
                >
                  <SelectTrigger className="h-auto min-w-[170px] border-0 bg-transparent p-0 text-foreground shadow-none focus:ring-0">
                    <SelectValue aria-label="Search depth" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">This location only</SelectItem>
                    <SelectItem value="1">Nearby branches</SelectItem>
                    <SelectItem value="99">Everywhere</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {aiSmartSearchOn && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-[hsl(var(--brand-1))/0.25] bg-[hsl(var(--brand-1))/0.08] px-3 py-2 text-xs text-[hsl(var(--brand-1))]">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                AI-powered search results. Results are suggestions and may not be perfectly
                accurate.
              </span>
            </div>
          )}

          {aiSmartSearchOn && aiDecomposedInfo && !isLoading && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--brand-1))]">
              <span className="font-semibold uppercase tracking-[0.08em]">{t("aiUnderstood")}</span>
              {aiDecomposedInfo.keywords && aiDecomposedInfo.keywords.length > 0 && (
                <span className="rounded-full border border-[hsl(var(--brand-1))/0.25] bg-[hsl(var(--brand-1))/0.08] px-2.5 py-0.5">
                  Keywords: {aiDecomposedInfo.keywords.join(", ")}
                </span>
              )}
              {aiDecomposedInfo.subjects && aiDecomposedInfo.subjects.length > 0 && (
                <span className="rounded-full border border-[hsl(var(--brand-1))/0.25] bg-[hsl(var(--brand-1))/0.08] px-2.5 py-0.5">
                  Subjects: {aiDecomposedInfo.subjects.join(", ")}
                </span>
              )}
              {aiDecomposedInfo.audience && (
                <span className="rounded-full border border-[hsl(var(--brand-1))/0.25] bg-[hsl(var(--brand-1))/0.08] px-2.5 py-0.5">
                  Audience: {aiDecomposedInfo.audience}
                </span>
              )}
              {aiDecomposedInfo.format && (
                <span className="rounded-full border border-[hsl(var(--brand-1))/0.25] bg-[hsl(var(--brand-1))/0.08] px-2.5 py-0.5">
                  Format: {aiDecomposedInfo.format}
                </span>
              )}
            </div>
          )}

          <ActiveFilterChips
            selectedFormats={selectedFormats}
            selectedAudiences={selectedAudiences}
            selectedLanguages={selectedLanguages}
            pubdateFrom={pubdateFrom}
            pubdateTo={pubdateTo}
            available={available}
            location={location}
            locations={library?.locations}
            formatFilters={FORMAT_FILTERS}
            audienceFilters={AUDIENCE_FILTERS}
            languageLabels={LANGUAGE_LABELS}
            onToggleCsvParam={toggleCsvParamValue}
            onUpdateSearchParams={updateSearchParams}
          />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex gap-6">
          {showFilters ? (
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="surface-glass sticky top-[200px] rounded-2xl p-4">
                <h2 className="font-semibold text-foreground mb-4">{t("filtersTitle")}</h2>
                <SearchFiltersPanel
                  formatFilters={FORMAT_FILTERS}
                  audienceFilters={AUDIENCE_FILTERS}
                  languageLabels={LANGUAGE_LABELS}
                  languageOptions={languageOptions}
                  facets={facets}
                  selectedFormats={selectedFormats}
                  selectedAudiences={selectedAudiences}
                  selectedLanguages={selectedLanguages}
                  pubdateFrom={pubdateFrom}
                  pubdateTo={pubdateTo}
                  available={available}
                  location={location}
                  locations={library?.locations}
                  expandedFacets={expandedFacets}
                  onToggleFacet={toggleFacet}
                  onToggleCsvParam={toggleCsvParamValue}
                  onUpdateSearchParams={updateSearchParams}
                  t={t}
                />
              </div>
            </aside>
          ) : null}

          <div className="flex-1">
            {/* Results header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/78 px-4 py-3 backdrop-blur-sm">
              <div>
                {isLoading ? (
                  <p className="text-muted-foreground">
                    {aiSmartSearchOn ? t("aiSearching") : t("searching")}
                  </p>
                ) : (
                  <p className="text-foreground/80">
                    {totalResults > 0 ? (
                      <>
                        <span className="font-semibold">{totalResults.toLocaleString()}</span>
                        {` ${t("results")}`}
                        {query && (
                          <>
                            {` for "`}
                            <span className="font-medium">{query}</span>
                            {`"`}
                          </>
                        )}
                        {aiSmartSearchOn && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            <Sparkles className="h-3 w-3" />
                            AI-powered
                          </span>
                        )}
                      </>
                    ) : query ? (
                      t("noResultsFor", { query })
                    ) : (
                      t("enterSearchTerm")
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/35 px-3 py-1.5">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground/70" />
                  <Select
                    value={sort}
                    onValueChange={(value) => updateSearchParams({ sort: value })}
                  >
                    <SelectTrigger className="h-auto min-w-[120px] border-0 bg-transparent p-0 text-sm font-medium text-foreground/85 shadow-none focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center overflow-hidden rounded-full border border-border/70 bg-muted/35 p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewMode("grid")}
                    className={`h-8 w-8 rounded-full transition-colors ${viewMode === "grid" ? "bg-[hsl(var(--brand-1))/0.18] text-[hsl(var(--brand-1))]" : "text-muted-foreground hover:bg-muted/70"}`}
                    aria-label={t("gridView")}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewMode("list")}
                    className={`h-8 w-8 rounded-full transition-colors ${viewMode === "list" ? "bg-[hsl(var(--brand-1))/0.18] text-[hsl(var(--brand-1))]" : "text-muted-foreground hover:bg-muted/70"}`}
                    aria-label={t("listView")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <SearchResultsList
              results={results}
              isLoading={isLoading}
              error={error}
              query={query}
              viewMode={viewMode}
              sort={sort}
              rankingMode={rankingMode}
              aiSmartSearchOn={aiSmartSearchOn}
              recordQueryString={recordQueryString}
              explainFilters={explainFilters}
              totalResults={totalResults}
              totalPages={totalPages}
              page={page}
              onPlaceHold={handlePlaceHold}
              onSaveToList={handleSaveToList}
              onToggleAiSearch={handleToggleAiSearch}
              onUpdateSearchParams={updateSearchParams}
              t={t}
            />
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
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
