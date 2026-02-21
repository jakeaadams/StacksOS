"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BookCard, BookFormat } from "@/components/opac/book-card";
import { AddToListDialog } from "@/components/opac/add-to-list-dialog";
import type { ExplainFilter } from "@/components/opac/why-this-result-dialog";
import { useLibrary } from "@/hooks/use-library";
import { usePatronSession } from "@/hooks/use-patron-session";
import { featureFlags } from "@/lib/feature-flags";
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
  eng: "English", spa: "Spanish", fre: "French", ger: "German",
  ita: "Italian", por: "Portuguese", rus: "Russian", chi: "Chinese",
  jpn: "Japanese", kor: "Korean", ara: "Arabic", hin: "Hindi",
};

function parseCsvParam(value: string): string[] {
  return (value || "").split(",").map((v) => v.trim()).filter(Boolean);
}

const AI_SEARCH_STORAGE_KEY = "stacksos_ai_search_enabled";
function getStoredAiSearchEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(AI_SEARCH_STORAGE_KEY) === "true"; } catch { return false; }
}
function storeAiSearchEnabled(enabled: boolean) {
  try { localStorage.setItem(AI_SEARCH_STORAGE_KEY, String(enabled)); } catch {}
}

function getFORMAT_FILTERS(t: (key: string) => string) { return [
  { value: "book", label: t("booksFormat"), icon: require("lucide-react").BookOpen },
  { value: "ebook", label: t("eBooksFormat"), icon: require("lucide-react").Smartphone },
  { value: "audiobook", label: t("audiobooksFormat"), icon: require("lucide-react").Headphones },
  { value: "dvd", label: t("dvdsFormat"), icon: require("lucide-react").MonitorPlay },
]; }

function getAUDIENCE_FILTERS(t: (key: string) => string) { return [
  { value: "general", label: t("allAges") },
  { value: "juvenile", label: t("kids") },
  { value: "young_adult", label: t("teens") },
]; }

function SearchContent() {
  const t = useTranslations("searchPage");
  const SORT_OPTIONS = getSORT_OPTIONS(t);
  const FORMAT_FILTERS = getFORMAT_FILTERS(t);
  const AUDIENCE_FILTERS = getAUDIENCE_FILTERS(t);
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

  // AI search state
  const [aiSmartSearchOn, setAiSmartSearchOn] = useState(getStoredAiSearchEnabled);
  const [aiDecomposedInfo, setAiDecomposedInfo] = useState<{
    keywords?: string[]; subjects?: string[]; audience?: string | null; format?: string | null; searchQuery?: string;
  } | null>(null);

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

  const selectedFormats = useMemo(() => parseCsvParam(format).map((v) => v.toLowerCase()), [format]);
  const selectedAudiences = useMemo(() => parseCsvParam(audience).map((v) => v.toLowerCase()), [audience]);
  const selectedLanguages = useMemo(() => parseCsvParam(language).map((v) => v.toLowerCase()), [language]);

  const languageOptions = useMemo(() => {
    const counts = facets?.languages && typeof facets.languages === "object" ? facets.languages : null;
    if (counts) {
      return Object.entries(counts as Record<string, number>)
        .filter(([k, v]) => Boolean(k) && typeof v === "number")
        .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k.toLowerCase());
    }
    return Object.keys(LANGUAGE_LABELS);
  }, [facets]);

  const explainFilters = useMemo<ExplainFilter[]>(() => {
    const filters: ExplainFilter[] = [];
    if (selectedFormats.length > 0) {
      const labels = selectedFormats.map((v) => FORMAT_FILTERS.find((f) => f.value === v)?.label || v).filter(Boolean);
      if (labels.length > 0) filters.push({ label: "Format", value: labels.join(", ") });
    }
    if (selectedAudiences.length > 0) {
      const labels = selectedAudiences.map((v) => AUDIENCE_FILTERS.find((a) => a.value === v)?.label || v).filter(Boolean);
      if (labels.length > 0) filters.push({ label: "Audience", value: labels.join(", ") });
    }
    if (selectedLanguages.length > 0) {
      const labels = selectedLanguages.map((code) => LANGUAGE_LABELS[code] || code);
      filters.push({ label: "Language", value: labels.join(", ") });
    }
    if (pubdateFrom || pubdateTo) filters.push({ label: "Publication year", value: `${pubdateFrom || "\u2026"}\u2013${pubdateTo || "\u2026"}` });
    if (available) filters.push({ label: "Availability", value: "Available now" });
    if (location) {
      const locName = library?.locations?.find((loc) => String(loc.id) === String(location))?.name || `Location #${location}`;
      filters.push({ label: "Location", value: locName });
    }
    return filters;
  }, [available, library?.locations, location, pubdateFrom, pubdateTo, selectedAudiences, selectedFormats, selectedLanguages]);

  const handleToggleAiSearch = useCallback(() => {
    setAiSmartSearchOn((prev) => { const next = !prev; storeAiSearchEnabled(next); return next; });
  }, []);

  const performSearch = useCallback(async () => {
    const hasBrowseIntent = Boolean(format) || Boolean(audience) || Boolean(language) || Boolean(pubdateFrom) || Boolean(pubdateTo) || available || Boolean(location) || sort !== "relevance";
    if (!query && !hasBrowseIntent) return;

    try {
      setIsLoading(true); setError(null); setAiDecomposedInfo(null);

      if (aiSmartSearchOn && query) {
        const aiParams = new URLSearchParams();
        aiParams.set("q", query); aiParams.set("limit", pageSize.toString()); aiParams.set("offset", ((page - 1) * pageSize).toString());
        const aiResponse = await fetchWithAuth(`/api/evergreen/ai-search?${aiParams.toString()}`);
        if (!aiResponse.ok) { const errData = await aiResponse.json().catch(() => ({})); throw new Error(errData.error || "AI search failed. Please try again."); }
        const aiData = await aiResponse.json();
        if (aiData.ok === false) throw new Error(aiData.error || "AI search failed");
        setAiDecomposedInfo(aiData.decomposed || null);
        const transformedResults = (aiData.records || []).map((record: any) => ({
          id: record.id, title: record.title || "Unknown Title", author: record.author, coverUrl: record.coverUrl,
          publicationYear: record.pubdate, summary: record.summary, subjects: record.subjects || [], isbn: record.isbn,
          formats: record.formats || [{ type: "book" as const, available: 0, total: 0 }],
          availableCopies: record.availability?.available || 0, totalCopies: record.availability?.total || 0,
          holdCount: record.hold_count || 0, rankingReason: record.ranking?.semanticReason || undefined,
          rankingScore: record.ranking?.semanticScore ?? undefined, aiExplanation: record.aiExplanation || undefined,
        }));
        setResults(transformedResults); setTotalResults(parseInt(aiData.count, 10) || transformedResults.length);
        setRankingMode("hybrid"); setFacets(null); return;
      }

      const params = new URLSearchParams();
      if (query) params.set("q", query); if (format) params.set("format", format); if (audience) params.set("audience", audience);
      if (language) params.set("language", language); if (pubdateFrom) params.set("pubdate_from", pubdateFrom);
      if (pubdateTo) params.set("pubdate_to", pubdateTo); if (available) params.set("available", "true");
      if (location) params.set("location", location); params.set("limit", pageSize.toString());
      params.set("offset", ((page - 1) * pageSize).toString());
      if (sort === "smart") { params.set("sort", "relevance"); params.set("semantic", "1"); } else { params.set("sort", sort); }

      const response = await fetchWithAuth(`/api/evergreen/catalog?${params.toString()}`);
      if (!response.ok) throw new Error("Search failed. Please try again.");
      const data = await response.json();
      if (data.ok === false) throw new Error(data.error || "Search failed");
      setFacets(data.facets || null);

      const transformedResults = (data.records || []).map((record: any) => ({
        id: record.id || record.record_id, title: record.title || record.simple_record?.title || "Unknown Title",
        author: record.author || record.simple_record?.author, coverUrl: getCoverUrl(record),
        publicationYear: record.pubdate || record.simple_record?.pubdate, summary: record.summary || record.simple_record?.abstract,
        subjects: record.subjects || [], isbn: record.isbn || record.simple_record?.isbn, formats: extractFormats(record),
        availableCopies: record.availability?.available || 0, totalCopies: record.availability?.total || 0,
        holdCount: record.hold_count || 0, rating: record.rating, reviewCount: record.review_count,
        rankingReason: record.ranking?.semanticReason || undefined,
        rankingScore: typeof record.ranking?.semanticScore === "number" ? record.ranking.semanticScore : undefined,
      }));

      setResults(transformedResults); setTotalResults(parseInt(data.count, 10) || transformedResults.length);
      setRankingMode(data.rankingMode === "hybrid" ? "hybrid" : "keyword");
    } catch (err) {
      clientLogger.error("Search error:", err); setError(err instanceof Error ? err.message : "An error occurred"); setResults([]);
    } finally { setIsLoading(false); }
  }, [query, format, audience, language, pubdateFrom, pubdateTo, available, location, page, sort, aiSmartSearchOn]);

  useEffect(() => { performSearch(); }, [performSearch]);
  useEffect(() => { document.title = query ? `Search: ${query} | Library Catalog` : "Search | Library Catalog"; }, [query]);

  const getCoverUrl = (record: any): string | undefined => {
    const isbn = record.isbn || record.simple_record?.isbn;
    return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : undefined;
  };

  const extractFormats = (record: any): BookFormat[] => {
    const formats: BookFormat[] = [];
    const copyInfo = record.availability || {};
    if (copyInfo.book || record.type === "book") formats.push({ type: "book", available: copyInfo.book?.available || copyInfo.available || 0, total: copyInfo.book?.total || copyInfo.total || 0 });
    if (copyInfo.ebook) formats.push({ type: "ebook", available: copyInfo.ebook.available, total: copyInfo.ebook.total, eContentUrl: record.ebook_url });
    if (copyInfo.audiobook) formats.push({ type: "audiobook", available: copyInfo.audiobook.available, total: copyInfo.audiobook.total });
    if (copyInfo.dvd) formats.push({ type: "dvd", available: copyInfo.dvd.available, total: copyInfo.dvd.total });
    if (formats.length === 0 && (copyInfo.available > 0 || copyInfo.total > 0)) formats.push({ type: "book", available: copyInfo.available || 0, total: copyInfo.total || 0 });
    return formats;
  };

  const updateSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => { if (value === null || value === "") params.delete(key); else params.set(key, value); });
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
    setExpandedFacets((prev) => prev.includes(facetName) ? prev.filter((f) => f !== facetName) : [...prev, facetName]);
  };

  const handlePlaceHold = async (recordId: number) => {
    const holdUrl = `/opac/record/${recordId}?hold=1`;
    if (!isLoggedIn) { router.push(`/opac/login?redirect=${encodeURIComponent(holdUrl)}`); return; }
    router.push(holdUrl);
  };

  const handleSaveToList = useCallback((record: { id: number; title?: string }) => {
    if (!featureFlags.opacLists) return;
    if (!isLoggedIn) { router.push(`/opac/login?redirect=${encodeURIComponent(`/opac/record/${record.id}`)}`); return; }
    setSaveTarget({ bibId: record.id, title: record.title });
  }, [isLoggedIn, router]);

  const totalPages = Math.ceil(totalResults / pageSize);

  const clearAllFilters = () => updateSearchParams({ format: null, audience: null, language: null, pubdate_from: null, pubdate_to: null, available: null, location: null });

  return (
    <div className="min-h-screen bg-muted/30">
      {featureFlags.opacLists && saveTarget ? (
        <AddToListDialog open={Boolean(saveTarget)} onOpenChange={(open) => { if (!open) setSaveTarget(null); }} bibId={saveTarget.bibId} title={saveTarget.title} />
      ) : null}

      {/* Mobile filters drawer */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="left" className="lg:hidden p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{t("filtersTitle")}</SheetTitle>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />{t("updatingResults")}&hellip;
              </div>
            ) : null}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <SearchFiltersPanel formatFilters={FORMAT_FILTERS} audienceFilters={AUDIENCE_FILTERS} languageLabels={LANGUAGE_LABELS} languageOptions={languageOptions} facets={facets} selectedFormats={selectedFormats} selectedAudiences={selectedAudiences} selectedLanguages={selectedLanguages} pubdateFrom={pubdateFrom} pubdateTo={pubdateTo} available={available} location={location} locations={library?.locations} expandedFacets={expandedFacets} onToggleFacet={toggleFacet} onToggleCsvParam={toggleCsvParamValue} onUpdateSearchParams={updateSearchParams} t={t} />
          </div>
          <SheetFooter className="border-t border-border flex-row gap-3">
            <button type="button" onClick={clearAllFilters} className="flex-1 py-2 rounded-lg border border-border text-foreground/80 hover:bg-muted/30 transition-colors">Clear all</button>
            <button type="button" onClick={() => setShowFilters(false)} className="flex-1 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors">Show results</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Search header */}
      <div className="bg-card border-b border-border sticky top-[73px] z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <form onSubmit={(e) => { e.preventDefault(); const formData = new FormData(e.currentTarget); updateSearchParams({ q: formData.get("q") as string }); }} className="flex gap-2">
            <div className="relative flex-1">
              <input type="text" name="q" defaultValue={query} placeholder={aiSmartSearchOn ? t("searchPlaceholderAI") : t("searchPlaceholder")} className={`w-full pl-4 pr-10 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${aiSmartSearchOn ? "border-purple-300 bg-purple-50/30" : "border-border"}`} />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"><Search className="h-5 w-5" /></button>
            </div>
            <button type="button" onClick={handleToggleAiSearch} className={`px-4 py-3 border rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${aiSmartSearchOn ? "bg-purple-100 border-purple-300 text-purple-700" : "border-border text-foreground/80 hover:bg-muted/30"}`} title={aiSmartSearchOn ? "AI Smart Search is ON" : "Enable AI Smart Search"}>
              <Sparkles className="h-5 w-5" /><span className="hidden sm:inline">{t("aiSearch")}</span>
            </button>
            <button type="button" onClick={() => setShowFilters(!showFilters)} className={`px-4 py-3 border rounded-lg flex items-center gap-2 transition-colors ${showFilters ? "bg-primary-50 border-primary-300 text-primary-700" : "border-border text-foreground/80 hover:bg-muted/30"}`}>
              <SlidersHorizontal className="h-5 w-5" /><span className="hidden sm:inline">{t("filters")}</span>
            </button>
          </form>

          {aiSmartSearchOn && (
            <div className="mt-2 flex items-start gap-2 text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>AI-powered search results. Results are suggestions and may not be perfectly accurate.</span>
            </div>
          )}

          {aiSmartSearchOn && aiDecomposedInfo && !isLoading && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-purple-700">
              <span className="font-medium">{t("aiUnderstood")}</span>
              {aiDecomposedInfo.keywords && aiDecomposedInfo.keywords.length > 0 && <span className="px-2 py-0.5 bg-purple-100 rounded-full">Keywords: {aiDecomposedInfo.keywords.join(", ")}</span>}
              {aiDecomposedInfo.subjects && aiDecomposedInfo.subjects.length > 0 && <span className="px-2 py-0.5 bg-purple-100 rounded-full">Subjects: {aiDecomposedInfo.subjects.join(", ")}</span>}
              {aiDecomposedInfo.audience && <span className="px-2 py-0.5 bg-purple-100 rounded-full">Audience: {aiDecomposedInfo.audience}</span>}
              {aiDecomposedInfo.format && <span className="px-2 py-0.5 bg-purple-100 rounded-full">Format: {aiDecomposedInfo.format}</span>}
            </div>
          )}

          <ActiveFilterChips selectedFormats={selectedFormats} selectedAudiences={selectedAudiences} selectedLanguages={selectedLanguages} pubdateFrom={pubdateFrom} pubdateTo={pubdateTo} available={available} location={location} locations={library?.locations} formatFilters={FORMAT_FILTERS} audienceFilters={AUDIENCE_FILTERS} languageLabels={LANGUAGE_LABELS} onToggleCsvParam={toggleCsvParamValue} onUpdateSearchParams={updateSearchParams} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {showFilters ? (
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="bg-card rounded-lg shadow-sm border border-border p-4 sticky top-[200px]">
                <h2 className="font-semibold text-foreground mb-4">{t("filtersTitle")}</h2>
                <SearchFiltersPanel formatFilters={FORMAT_FILTERS} audienceFilters={AUDIENCE_FILTERS} languageLabels={LANGUAGE_LABELS} languageOptions={languageOptions} facets={facets} selectedFormats={selectedFormats} selectedAudiences={selectedAudiences} selectedLanguages={selectedLanguages} pubdateFrom={pubdateFrom} pubdateTo={pubdateTo} available={available} location={location} locations={library?.locations} expandedFacets={expandedFacets} onToggleFacet={toggleFacet} onToggleCsvParam={toggleCsvParamValue} onUpdateSearchParams={updateSearchParams} t={t} />
              </div>
            </aside>
          ) : null}

          <div className="flex-1">
            {/* Results header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                {isLoading ? (
                  <p className="text-muted-foreground">{aiSmartSearchOn ? t("aiSearching") : t("searching")}</p>
                ) : (
                  <p className="text-foreground/80">
                    {totalResults > 0 ? (
                      <><span className="font-semibold">{totalResults.toLocaleString()}</span>{` ${t("results")}`}{query && <>{` for "`}<span className="font-medium">{query}</span>{`"`}</>}{aiSmartSearchOn && <span className="ml-2 inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full"><Sparkles className="h-3 w-3" />AI-powered</span>}</>
                    ) : query ? t("noResultsFor", { query }) : t("enterSearchTerm")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground/70" />
                  <select value={sort} onChange={(e) => updateSearchParams({ sort: e.target.value })} className="border-0 bg-transparent text-sm font-medium text-foreground/80 focus:outline-none focus:ring-0 cursor-pointer">
                    {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                  <button type="button" onClick={() => setViewMode("grid")} className={`p-2 ${viewMode === "grid" ? "bg-primary-100 text-primary-700" : "text-muted-foreground hover:bg-muted/50"}`} aria-label={t("gridView")}><Grid className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setViewMode("list")} className={`p-2 ${viewMode === "list" ? "bg-primary-100 text-primary-700" : "text-muted-foreground hover:bg-muted/50"}`} aria-label={t("listView")}><List className="h-4 w-4" /></button>
                </div>
              </div>
            </div>

            <SearchResultsList results={results} isLoading={isLoading} error={error} query={query} viewMode={viewMode} sort={sort} rankingMode={rankingMode} aiSmartSearchOn={aiSmartSearchOn} explainFilters={explainFilters} totalResults={totalResults} totalPages={totalPages} page={page} onPlaceHold={handlePlaceHold} onSaveToList={handleSaveToList} onToggleAiSearch={handleToggleAiSearch} onUpdateSearchParams={updateSearchParams} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OPACSearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/30 flex items-center justify-center"><Loader2 className="h-8 w-8 text-primary-600 animate-spin" /></div>}>
      <SearchContent />
    </Suspense>
  );
}
