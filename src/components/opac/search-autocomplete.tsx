"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { DEBOUNCE_DELAY_MS } from "@/lib/constants";
import {
  Search,
  BookOpen,
  User,
  Tag,
  Loader2,
  TrendingUp,
  Clock,
  Smartphone,
  Headphones,
  MonitorPlay,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchScope = "keyword" | "title" | "author" | "subject" | "isbn";

interface Suggestion {
  id: number;
  title: string;
  author?: string;
  format?: string;
  coverUrl?: string;
  matchType: "title" | "author" | "subject" | "general";
}

interface SuggestionGroup {
  label: string;
  icon: React.ElementType;
  items: Suggestion[];
}

interface SearchAutocompleteProps {
  /** Initial search query value */
  initialQuery?: string;
  /** Current search scope */
  scope?: SearchScope;
  /** Called when the scope changes */
  onScopeChange?: (scope: SearchScope) => void;
  /** Show the scope selector inline */
  showScopeSelector?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Visual variant */
  variant?: "hero" | "header" | "page";
  /** Called on form submit (instead of default navigation) */
  onSearch?: (query: string, scope: SearchScope) => void;
  /** Additional className for the wrapper */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POPULAR_SEARCHES = [
  "New York Times bestsellers",
  "Children\u0027s picture books",
  "Mystery novels",
  "Cookbooks",
  "Local history",
  "Science fiction",
  "Biography",
  "Graphic novels",
];

const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: "keyword", label: "All Fields" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "subject", label: "Subject" },
  { value: "isbn", label: "ISBN" },
];

function getFormatIcon(format?: string) {
  if (!format) return BookOpen;
  const f = format.toLowerCase();
  if (f.includes("ebook") || f.includes("electronic")) return Smartphone;
  if (f.includes("audio")) return Headphones;
  if (f.includes("dvd") || f.includes("video") || f.includes("blu")) return MonitorPlay;
  return BookOpen;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchAutocomplete({
  initialQuery = "",
  scope: controlledScope,
  onScopeChange,
  showScopeSelector = true,
  placeholder,
  variant = "hero",
  onSearch,
  className = "",
}: SearchAutocompleteProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [internalScope, setInternalScope] = useState<SearchScope>("keyword");
  const scope = controlledScope ?? internalScope;
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showPopular, setShowPopular] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, DEBOUNCE_DELAY_MS);

  const handleScopeChange = useCallback(
    (newScope: SearchScope) => {
      if (onScopeChange) {
        onScopeChange(newScope);
      } else {
        setInternalScope(newScope);
      }
    },
    [onScopeChange]
  );

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    const controller = new AbortController();

    async function fetchSuggestions() {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) {
        setSuggestions([]);
        if (!debouncedQuery || debouncedQuery.trim().length === 0) {
          setIsOpen(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          limit: "5",
        });
        if (scope !== "keyword") {
          params.set("type", scope);
        }

        const res = await fetch(`/api/evergreen/catalog?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();
        const records = data.records || [];

        const mapped: Suggestion[] = records.map((r: any) => {
          let matchType: Suggestion["matchType"] = "general";
          const q = debouncedQuery.toLowerCase();
          const title = (r.title || "").toLowerCase();
          const author = (r.author || "").toLowerCase();
          const subjects: string[] = (r.subjects || []).map((s: string) => s.toLowerCase());

          if (scope === "title" || title.includes(q)) {
            matchType = "title";
          } else if (scope === "author" || author.includes(q)) {
            matchType = "author";
          } else if (scope === "subject" || subjects.some((s: string) => s.includes(q))) {
            matchType = "subject";
          }

          return {
            id: r.id,
            title: r.title || "Unknown Title",
            author: r.author,
            format: r.format,
            coverUrl:
              r.coverUrl ||
              (r.isbn ? `https://covers.openlibrary.org/b/isbn/${r.isbn}-S.jpg` : undefined),
            matchType,
          };
        });

        setSuggestions(mapped);
        setIsOpen(mapped.length > 0);
        setActiveIndex(-1);
        setShowPopular(false);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchSuggestions();
    return () => controller.abort();
  }, [debouncedQuery, scope]);

  // Group suggestions by match type
  const grouped: SuggestionGroup[] = (() => {
    if (showPopular && suggestions.length === 0 && !query.trim()) {
      return [
        {
          label: "Popular Searches",
          icon: TrendingUp,
          items: POPULAR_SEARCHES.map((s, i) => ({
            id: -(i + 1),
            title: s,
            matchType: "general" as const,
          })),
        },
      ];
    }

    const groups: SuggestionGroup[] = [];
    const titleMatches = suggestions.filter((s) => s.matchType === "title");
    const authorMatches = suggestions.filter((s) => s.matchType === "author");
    const subjectMatches = suggestions.filter((s) => s.matchType === "subject");
    const generalMatches = suggestions.filter((s) => s.matchType === "general");

    if (titleMatches.length > 0) {
      groups.push({ label: "Titles", icon: BookOpen, items: titleMatches });
    }
    if (authorMatches.length > 0) {
      groups.push({ label: "Authors", icon: User, items: authorMatches });
    }
    if (subjectMatches.length > 0) {
      groups.push({ label: "Subjects", icon: Tag, items: subjectMatches });
    }
    if (generalMatches.length > 0) {
      groups.push({ label: "Results", icon: Search, items: generalMatches });
    }

    if (groups.length === 0 && suggestions.length > 0) {
      groups.push({ label: "Results", icon: Search, items: suggestions });
    }

    return groups;
  })();

  const flatItems = grouped.flatMap((g) => g.items);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowPopular(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-suggestion-item]");
      items[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsOpen(false);
    setShowPopular(false);

    if (onSearch) {
      onSearch(trimmed, scope);
    } else {
      const params = new URLSearchParams({ q: trimmed });
      if (scope !== "keyword") {
        params.set("searchType", scope);
      }
      router.push(`/opac/search?${params.toString()}`);
    }
  };

  const handleSelectSuggestion = (item: Suggestion) => {
    setIsOpen(false);
    setShowPopular(false);

    if (item.id < 0) {
      setQuery(item.title);
      const params = new URLSearchParams({ q: item.title });
      if (scope !== "keyword") {
        params.set("searchType", scope);
      }
      router.push(`/opac/search?${params.toString()}`);
      return;
    }

    router.push(`/opac/record/${item.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isDropdownVisible = isOpen || showPopular;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isDropdownVisible && query.trim().length === 0) {
        setShowPopular(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < flatItems.length) {
        e.preventDefault();
        handleSelectSuggestion(flatItems[activeIndex]!);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setShowPopular(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    } else if (!query.trim()) {
      setShowPopular(true);
    }
  };

  const isHero = variant === "hero";
  const isPage = variant === "page";

  const wrapperClass = isHero ? `relative max-w-2xl mx-auto ${className}` : `relative ${className}`;

  const inputClass = isHero
    ? "w-full py-4 md:py-5 text-lg rounded-full border-0 text-foreground placeholder:text-muted-foreground shadow-xl focus:outline-none focus:ring-4 focus:ring-white/30"
    : isPage
      ? "w-full py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-foreground placeholder:text-muted-foreground"
      : "w-full py-3 border border-border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-foreground placeholder:text-muted-foreground";

  const buttonClass = isHero
    ? "absolute right-2 top-1/2 -translate-y-1/2 p-3 md:p-4 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors shadow-lg"
    : "absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors";

  const dropdownClass =
    "absolute top-full left-0 right-0 mt-2 bg-card rounded-xl shadow-lg border border-border overflow-hidden z-50 max-h-[400px] overflow-y-auto";

  const showDropdown = isOpen || showPopular;
  const hasDropdownContent = flatItems.length > 0;

  const hasScopeSelector = showScopeSelector && !isPage;
  const inputPl = hasScopeSelector ? "pl-[140px]" : isHero ? "pl-6" : "pl-4";

  return (
    <div ref={containerRef} className={wrapperClass}>
      <form onSubmit={handleSubmit} className="relative">
        {hasScopeSelector && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10">
            <select
              value={scope}
              onChange={(e) => handleScopeChange(e.target.value as SearchScope)}
              className={`appearance-none bg-primary-50 text-primary-700 font-medium text-sm
                         rounded-full px-3 cursor-pointer border-0
                         focus:outline-none focus:ring-2 focus:ring-primary-300
                         ${isHero ? "py-2.5 md:py-3" : "py-2"}`}
              aria-label="Search scope"
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ||
            (scope === "title"
              ? "Search by title..."
              : scope === "author"
                ? "Search by author..."
                : scope === "subject"
                  ? "Search by subject..."
                  : scope === "isbn"
                    ? "Search by ISBN..."
                    : "Search by title, author, subject, or keyword...")
          }
          className={`${inputClass} ${inputPl} pr-14`}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown && hasDropdownContent}
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
        />

        <button type="submit" className={buttonClass} aria-label="Search">
          {isLoading ? (
            <Loader2 className={`${isHero ? "h-5 w-5 md:h-6 md:w-6" : "h-5 w-5"} animate-spin`} />
          ) : (
            <Search className={isHero ? "h-5 w-5 md:h-6 md:w-6" : "h-5 w-5"} />
          )}
        </button>
      </form>

      {showDropdown && hasDropdownContent && (
        <div ref={listRef} id="search-suggestions" role="listbox" className={dropdownClass}>
          {grouped.map((group) => {
            const GroupIcon = group.icon;
            return (
              <div key={group.label}>
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border/50">
                  <GroupIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>

                {group.items.map((item) => {
                  const itemIndex = flatItems.indexOf(item);
                  const isActive = itemIndex === activeIndex;
                  const FormatIcon = getFormatIcon(item.format);

                  if (item.id < 0) {
                    return (
                      <button
                        type="button"
                        key={item.id}
                        data-suggestion-item
                        id={`suggestion-${itemIndex}`}
                        role="option"
                        aria-selected={isActive}
                        onClick={() => handleSelectSuggestion(item)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                                   ${isActive ? "bg-primary-50 text-primary-900" : "hover:bg-muted/30"}`}
                      >
                        <Clock className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        <span className="text-sm text-foreground">{item.title}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      type="button"
                      key={item.id}
                      data-suggestion-item
                      id={`suggestion-${itemIndex}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleSelectSuggestion(item)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                                 border-b border-border/30 last:border-0
                                 ${isActive ? "bg-primary-50 text-primary-900" : "hover:bg-muted/30"}`}
                    >
                      <div className="w-8 h-8 rounded bg-muted/60 flex items-center justify-center shrink-0">
                        <FormatIcon className="h-4 w-4 text-muted-foreground/70" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                        {item.author && (
                          <p className="text-xs text-muted-foreground truncate">{item.author}</p>
                        )}
                      </div>
                      {item.format && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 shrink-0">
                          {item.format}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {query.trim() && suggestions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                const params = new URLSearchParams({ q: query.trim() });
                if (scope !== "keyword") params.set("searchType", scope);
                router.push(`/opac/search?${params.toString()}`);
              }}
              className="block w-full p-3 text-center text-primary hover:bg-muted/30
                         font-medium text-sm border-t border-border/50"
            >
              See all results for &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchAutocomplete;
