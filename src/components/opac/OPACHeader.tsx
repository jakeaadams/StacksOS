"use client";
import { clientLogger } from "@/lib/client-logger";
import { DEBOUNCE_DELAY_MS } from "@/lib/constants";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useLibrary } from "@/hooks/useLibrary";
import { usePatronSession } from "@/hooks/usePatronSession";
import { useDebounce } from "@/hooks/use-debounce";
import { featureFlags } from "@/lib/feature-flags";
import {
  Moon,
  Sun,
  Search,
  Menu,
  X,
  User,
  BookOpen,
  Heart,
  Clock,
  Phone,
  LogOut,
  ChevronDown,
  Loader2
} from "lucide-react";

interface SearchResult {
  id: number;
  title: string;
  author?: string;
  coverUrl?: string;
  format?: string;
}

const passthroughLoader = ({ src }: { src: string }) => src;

export function OPACHeader() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const { library, isLoading: libraryLoading } = useLibrary();
  const { patron, isLoggedIn, logout } = usePatronSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mounted, setMounted] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(searchQuery, DEBOUNCE_DELAY_MS);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const doSearch = async () => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/evergreen/catalog?q=${encodeURIComponent(debouncedQuery)}&limit=6`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          const records = data.records || [];
          setSearchResults(
            records.map((r: any) => ({
              id: r.id,
              title: r.title || "Unknown Title",
              author: r.author,
              coverUrl: r.coverUrl || (r.isbn ? `https://covers.openlibrary.org/b/isbn/${r.isbn}-S.jpg` : undefined),
              format: r.format,
            }))
          );
          setShowResults(true);
        }
      } catch (err) {
        clientLogger.error("Search error:", err);
      } finally {
        setIsSearching(false);
      }
    };
    doSearch();
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowResults(false);
      router.push(`/opac/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleResultClick = (id: number) => {
    setShowResults(false);
    setSearchQuery("");
    router.push(`/opac/record/${id}`);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && accountMenuOpen) {
        setAccountMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (accountMenuOpen && accountMenuRef.current) {
      const focusableElements = accountMenuRef.current.querySelectorAll(
        "a[href], button:not([disabled])");
      if (focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus();
      }
    }
  }, [accountMenuOpen]);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="bg-primary text-primary-foreground px-4 py-2 text-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {library?.phone ? (
              <a
                href={`tel:${library.phone}`}
                className="hidden sm:inline-flex items-center gap-2 hover:underline"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                <span>{library.phone}</span>
              </a>
            ) : null}
            {library?.hours ? (
              <span className="hidden md:inline-flex items-center gap-2">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span>{library.hours}</span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-4">
            {library?.locations && library.locations.length > 1 ? (
              <Link href="/opac/locations" className="hover:underline">
                {library.locations.length} Locations
              </Link>
            ) : null}
            {featureFlags.opacKids ? (
              <Link href="/opac/kids" className="hover:underline font-medium">
                Kids
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
	          <Link href="/opac" className="flex items-center gap-3 shrink-0">
	            {library?.logoUrl ? (
	              <Image
	                src={library.logoUrl}
	                alt=""
	                width={160}
	                height={40}
	                className="h-10 w-auto"
	                unoptimized
	                loader={passthroughLoader}
	                aria-hidden="true"
	              />
	            ) : (
	              <div className="h-10 w-10 bg-primary-600 rounded-lg flex items-center justify-center" aria-hidden="true">
	                <BookOpen className="h-6 w-6 text-white" />
	              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="font-bold text-lg text-foreground leading-tight">
                {libraryLoading ? "Loading..." : (library?.name || "Library Catalog")}
              </h1>
              {library?.tagline && <p className="text-xs text-muted-foreground">{library.tagline}</p>}
            </div>
          </Link>

          <div ref={searchContainerRef} className="hidden md:flex flex-1 max-w-2xl relative" role="search">
            <form onSubmit={handleSearchSubmit} className="w-full">
              <div className="relative">
                <input
                  type="text"
                  id="desktop-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  placeholder="Search books, movies, music..."
                  className="w-full pl-4 pr-12 py-3 border border-border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-foreground placeholder:text-muted-foreground"
                  autoComplete="off"
                />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors" aria-label="Search">
                  {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                </button>
              </div>
            </form>

            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card rounded-xl shadow-lg border border-border overflow-hidden z-50">
	                {searchResults.map((result) => (
	                  <button type="button" key={result.id} onClick={() => handleResultClick(result.id)} className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 text-left border-b border-border/50 last:border-0">
	                    {result.coverUrl ? (
	                      <Image
	                        src={result.coverUrl}
	                        alt=""
	                        width={40}
	                        height={56}
	                        className="object-cover rounded"
	                        aria-hidden="true"
	                      />
	                    ) : (
	                      <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
	                        <BookOpen className="h-5 w-5 text-muted-foreground/70" />
	                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{result.title}</p>
                      {result.author && <p className="text-sm text-muted-foreground truncate">{result.author}</p>}
                    </div>
                  </button>
                ))}
                <Link href={`/opac/search?q=${encodeURIComponent(searchQuery)}`} onClick={() => setShowResults(false)} className="block p-3 text-center text-primary hover:bg-muted/30 font-medium text-sm">
                  See all results for &quot;{searchQuery}&quot;
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleTheme} className="p-2 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" aria-label={mounted && resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {mounted && resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {isLoggedIn ? (
              <div className="relative">
                <button type="button" ref={accountButtonRef} onClick={() => setAccountMenuOpen(!accountMenuOpen)} aria-expanded={accountMenuOpen} className="flex items-center gap-2 px-4 py-2 rounded-full border border-border hover:bg-muted/30 transition-colors">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <span className="hidden sm:inline text-sm font-medium text-foreground/80">{patron?.firstName || "My Account"}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
                </button>

                {accountMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAccountMenuOpen(false)} />
                    <div ref={accountMenuRef} className="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-lg border border-border py-2 z-20">
                      <div className="px-4 py-2 border-b border-border/50">
                        <p className="font-medium text-foreground">{patron?.firstName} {patron?.lastName}</p>
                        <p className="text-sm text-muted-foreground">{patron?.cardNumber}</p>
                      </div>
                      <Link href="/opac/account" className="flex items-center gap-3 px-4 py-2 text-foreground/80 hover:bg-muted/30" onClick={() => setAccountMenuOpen(false)}>
                        <User className="h-4 w-4" /> My Account
                      </Link>
                      <Link href="/opac/account/checkouts" className="flex items-center gap-3 px-4 py-2 text-foreground/80 hover:bg-muted/30" onClick={() => setAccountMenuOpen(false)}>
                        <BookOpen className="h-4 w-4" /> Checkouts
                        {(patron?.checkoutCount ?? 0) > 0 && <span className="ml-auto bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{patron?.checkoutCount}</span>}
                      </Link>
                      <Link href="/opac/account/holds" className="flex items-center gap-3 px-4 py-2 text-foreground/80 hover:bg-muted/30" onClick={() => setAccountMenuOpen(false)}>
                        <Clock className="h-4 w-4" /> Holds
                        {(patron?.holdCount ?? 0) > 0 && <span className="ml-auto bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{patron?.holdCount}</span>}
                      </Link>
                      <Link href="/opac/account/lists" className="flex items-center gap-3 px-4 py-2 text-foreground/80 hover:bg-muted/30" onClick={() => setAccountMenuOpen(false)}>
                        <Heart className="h-4 w-4" /> My Lists
                      </Link>
                      <div className="border-t border-border/50 mt-2 pt-2">
                        <button type="button" onClick={() => { logout(); setAccountMenuOpen(false); }} className="flex items-center gap-3 px-4 py-2 text-destructive hover:bg-destructive/10 w-full">
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/opac/login" className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors font-medium">
                <User className="h-5 w-5" /><span className="hidden sm:inline">Sign In</span>
              </Link>
            )}

            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-muted-foreground hover:bg-muted/50 rounded-lg" aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        <div className="md:hidden mt-4 relative" role="search">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <input type="text" id="mobile-search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => searchResults.length > 0 && setShowResults(true)} placeholder="Search books, movies, music..." className="w-full pl-4 pr-12 py-3 border border-border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary-500 text-foreground placeholder:text-muted-foreground" autoComplete="off" />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors" aria-label="Search">
                {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              </button>
            </div>
          </form>

          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card rounded-xl shadow-lg border border-border overflow-hidden z-50">
              {searchResults.slice(0, 4).map((result) => (
                <button type="button" key={result.id} onClick={() => handleResultClick(result.id)} className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 text-left border-b border-border/50 last:border-0">
                  <div className="w-8 h-12 bg-muted rounded flex items-center justify-center shrink-0"><BookOpen className="h-4 w-4 text-muted-foreground/70" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-sm">{result.title}</p>
                    {result.author && <p className="text-xs text-muted-foreground truncate">{result.author}</p>}
                  </div>
                </button>
              ))}
              <Link href={`/opac/search?q=${encodeURIComponent(searchQuery)}`} onClick={() => setShowResults(false)} className="block p-3 text-center text-primary hover:bg-muted/30 font-medium text-sm">See all results</Link>
            </div>
          )}
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <nav className="px-4 py-4 space-y-2">
            <Link href="/opac" className="block px-4 py-2 text-foreground/80 hover:bg-muted/30 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link href="/opac/search" className="block px-4 py-2 text-foreground/80 hover:bg-muted/30 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Browse Catalog</Link>
            {featureFlags.opacKids ? (
              <Link href="/opac/kids" className="block px-4 py-2 text-foreground/80 hover:bg-muted/30 rounded-lg" onClick={() => setMobileMenuOpen(false)}>👶 Kids Catalog</Link>
            ) : null}
            <button type="button" onClick={() => { toggleTheme(); setMobileMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-foreground/80 hover:bg-muted/30 rounded-lg">
              {mounted && resolvedTheme === "dark" ? <><Sun className="h-4 w-4" /> Light Mode</> : <><Moon className="h-4 w-4" /> Dark Mode</>}
            </button>
            {isLoggedIn && (
              <>
                <div className="border-t border-border my-2" />
                <Link href="/opac/account/checkouts" className="block px-4 py-2 text-foreground/80 hover:bg-muted/30 rounded-lg" onClick={() => setMobileMenuOpen(false)}>My Checkouts</Link>
                <Link href="/opac/account/holds" className="block px-4 py-2 text-foreground/80 hover:bg-muted/30 rounded-lg" onClick={() => setMobileMenuOpen(false)}>My Holds</Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
