"use client";
import { DEBOUNCE_DELAY_QUICK_MS } from "@/lib/constants";
import { clientLogger } from "@/lib/client-logger";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, User, BookOpen, Loader2, ArrowRight, Barcode } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import Image from "next/image";
import {
  searchStaffCatalog,
  searchStaffItemsByBarcode,
  searchStaffPatrons,
  type StaffPatronSearchType,
} from "@/lib/search/staff-search";

interface SearchResult {
  id: string | number;
  type: "patron" | "item" | "catalog";
  title: string;
  subtitle?: string;
  meta?: string;
  href: string;
  coverUrl?: string;
  avatarUrl?: string;
  initials?: string;
}

interface UniversalSearchProps {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  variant?: "default" | "topbar";
}

// Detect input type for smart routing
function detectInputType(query: string): "barcode" | "isbn" | "phone" | "email" | "text" {
  const q = query.trim();
  if (!q) return "text";

  // Email detection
  if (q.includes("@")) return "email";

  // Extract digits only
  const digits = q.replace(/[\s\-]/g, "");
  const isAllDigits = /^\d+$/.test(digits);

  // ISBN-10 or ISBN-13 (may have hyphens)
  if (isAllDigits && (digits.length === 10 || digits.length === 13)) return "isbn";

  // Library barcodes are typically 12-14 digits
  if (isAllDigits && digits.length >= 12) return "barcode";

  // Phone numbers (7-11 digits, may have formatting)
  if (isAllDigits && digits.length >= 7 && digits.length <= 11) return "phone";

  return "text";
}

// Highlight matching text with bold
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className="font-semibold text-foreground">
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}

// Get initials from name
function getInitials(firstName?: string, lastName?: string): string {
  const f = firstName?.charAt(0) || "";
  const l = lastName?.charAt(0) || "";
  return (f + l).toUpperCase() || "?";
}

export function UniversalSearch({
  className,
  placeholder,
  autoFocus,
  variant = "default",
}: UniversalSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const debouncedQuery = useDebounce(query, DEBOUNCE_DELAY_QUICK_MS);
  const inputType = useMemo(() => detectInputType(query), [query]);

  // Fetch search results
  const fetchResults = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const type = detectInputType(searchQuery);
    const allResults: SearchResult[] = [];

    try {
      // Parallel fetch for patrons and catalog
      const promises: Promise<void>[] = [];

      // Patron search (for barcode, email, phone, or text)
      if (type !== "isbn") {
        const patronType: StaffPatronSearchType =
          type === "barcode"
            ? "barcode"
            : type === "email"
              ? "email"
              : type === "phone"
                ? "phone"
                : "name";
        promises.push(
          searchStaffPatrons(searchQuery, patronType, 5)
            .then((patrons) => {
              patrons.forEach((patron) => {
                allResults.push({
                  id: `patron-${patron.id}`,
                  type: "patron",
                  title: `${patron.lastName}, ${patron.firstName}`.trim() || "Unknown",
                  subtitle: patron.barcode,
                  meta: patron.email || patron.phone,
                  href: `/staff/patrons/${patron.id}`,
                  avatarUrl: patron.photoUrl,
                  initials: getInitials(patron.firstName, patron.lastName),
                });
              });
            })
            .catch((error) => {
              clientLogger.warn("UniversalSearch patron lookup failed", error);
            })
        );
      }

      // Catalog search (for text or ISBN)
      if (type === "text" || type === "isbn") {
        const catalogType = type === "isbn" ? "isbn" : "keyword";
        promises.push(
          searchStaffCatalog(searchQuery, catalogType, 5)
            .then((records) => {
              records.forEach((record) => {
                allResults.push({
                  id: `catalog-${record.id}`,
                  type: "catalog",
                  title: record.title || "Untitled",
                  subtitle: record.author,
                  meta: record.isbn || record.format,
                  href: `/staff/catalog/record/${record.id}`,
                  coverUrl: record.coverUrl,
                });
              });
            })
            .catch((error) => {
              clientLogger.warn("UniversalSearch catalog lookup failed", error);
            })
        );
      }

      if (type === "barcode") {
        promises.push(
          searchStaffItemsByBarcode(searchQuery, 1)
            .then((items) => {
              if (items[0]) {
                const item = items[0];
                allResults.unshift({
                  id: `item-${item.id}`,
                  type: "item",
                  title: item.title || "Item",
                  subtitle: `Barcode: ${searchQuery}`,
                  meta: item.status || item.location,
                  href: `/staff/catalog/item-status?barcode=${encodeURIComponent(searchQuery)}`,
                });
              }
            })
            .catch((error) => {
              clientLogger.warn("UniversalSearch item lookup failed", error);
            })
        );
      }

      await Promise.all(promises);

      // Sort: items first, then patrons, then catalog
      allResults.sort((a, b) => {
        const order = { item: 0, patron: 1, catalog: 2 };
        return order[a.type] - order[b.type];
      });

      setResults(allResults.slice(0, 10));
    } catch (err) {
      clientLogger.error("Search error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Trigger search on debounced query change
  useEffect(() => {
    fetchResults(debouncedQuery);
  }, [debouncedQuery, fetchResults]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            router.push(results[selectedIndex].href);
            setIsOpen(false);
            setQuery("");
          } else if (query.trim()) {
            // No results selected - go to full search
            const type = detectInputType(query);
            if (type === "barcode" || type === "email" || type === "phone") {
              router.push(
                `/staff/patrons?q=${encodeURIComponent(query)}&type=${type === "barcode" ? "barcode" : type}`
              );
            } else {
              router.push(`/staff/catalog?q=${encodeURIComponent(query)}&type=keyword`);
            }
            setIsOpen(false);
            setQuery("");
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex, query, router]
  );

  // Navigate to result
  const handleSelect = useCallback(
    (result: SearchResult) => {
      router.push(result.href);
      setIsOpen(false);
      setQuery("");
    },
    [router]
  );

  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "patron":
        return User;
      case "item":
        return Barcode;
      case "catalog":
        return BookOpen;
    }
  };

  // Group results by type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    results.forEach((r) => {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type]!.push(r);
    });
    return groups;
  }, [results]);

  const showDropdown = isOpen && (query.length >= 2 || isLoading);

  return (
    <div
      className={cn(
        "relative w-full",
        variant === "topbar" ? "max-w-none" : "max-w-2xl",
        className
      )}
    >
      <div className="relative">
        <Search
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none",
            variant === "topbar" ? "left-3 h-4 w-4" : "left-4 h-5 w-5"
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // Delay to allow click on results
            setTimeout(() => setIsOpen(false), 200);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Search patrons, items, catalog..."}
          autoFocus={autoFocus}
          className={cn(
            variant === "topbar"
              ? "w-full h-10 pl-10 pr-4 text-sm rounded-full border border-border/70 bg-background/80 backdrop-blur-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              : "w-full h-14 pl-12 pr-4 text-base rounded-2xl border-2 border-border/50 bg-background/80 backdrop-blur-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all duration-200"
          )}
        />
        {isLoading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground animate-spin" />
        )}
        {!isLoading && query && inputType !== "text" && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
            {inputType === "barcode"
              ? "Barcode"
              : inputType === "isbn"
                ? "ISBN"
                : inputType === "email"
                  ? "Email"
                  : "Phone"}
          </span>
        )}
      </div>

      {/* Results Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border/50 rounded-xl shadow-xl overflow-hidden z-50">
          {results.length === 0 && !isLoading && query.length >= 2 && (
            <div className="p-6 text-center text-muted-foreground">
              <p className="text-sm">No results for {`"${query}"`}</p>
              <p className="text-xs mt-1">Press Enter to search anyway</p>
            </div>
          )}

          {results.length === 0 && isLoading && (
            <div className="p-6 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              <p className="text-sm mt-2">Searching...</p>
            </div>
          )}

          {Object.entries(groupedResults).map(([type, items]) => (
            <div key={type}>
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                {type === "patron" ? "Patrons" : type === "item" ? "Items" : "Catalog"}
              </div>
              {items.map((result) => {
                const globalIdx = results.indexOf(result);
                const Icon = getIcon(result.type);
                const isSelected = globalIdx === selectedIndex;

                return (
                  <button
                    type="button"
                    key={result.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(result)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                      "hover:bg-accent",
                      isSelected && "bg-accent"
                    )}
                  >
                    {/* Thumbnail: Cover for catalog, Avatar for patron, Icon for item */}
                    {result.type === "catalog" && result.coverUrl ? (
                      <div className="flex-shrink-0 w-10 h-14 rounded overflow-hidden bg-muted">
                        <Image
                          src={result.coverUrl}
                          alt={`Cover of ${result.title}`}
                          width={40}
                          height={56}
                          className="w-full h-full object-contain"
                          unoptimized
                        />
                      </div>
                    ) : result.type === "patron" ? (
                      result.avatarUrl ? (
                        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-muted">
                          <Image
                            src={result.avatarUrl}
                            alt={`Photo of ${result.title}`}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-medium text-sm">
                          {result.initials}
                        </div>
                      )
                    ) : (
                      <div
                        className={cn(
                          "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",

                          result.type === "item"
                            ? "bg-amber-100 text-amber-600"
                            : "bg-sky-100 text-sky-600"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {highlightMatch(result.title, query)}
                      </div>
                      {result.subtitle && (
                        <div className="text-sm text-muted-foreground truncate">
                          {highlightMatch(result.subtitle, query)}
                        </div>
                      )}
                    </div>
                    {result.meta && (
                      <div className="flex-shrink-0 text-xs text-muted-foreground hidden sm:block">
                        {result.meta}
                      </div>
                    )}
                    <ArrowRight
                      className={cn(
                        "flex-shrink-0 h-4 w-4 text-muted-foreground/50 transition-opacity",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </button>
                );
              })}
            </div>
          ))}

          {results.length > 0 && (
            <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 flex items-center justify-between">
              <span>↑↓ navigate • Enter select • Esc close</span>
              <span className="hidden sm:inline">Press Enter to see all results</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
