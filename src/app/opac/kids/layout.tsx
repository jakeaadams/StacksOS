"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLibrary } from "@/hooks/useLibrary";
import { usePatronSession } from "@/hooks/usePatronSession";
import { useAccessibilityPrefs } from "@/hooks/useAccessibilityPrefs";
import { featureFlags } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { KidsParentGateProvider } from "@/contexts/kids-parent-gate-context";
import {
  Search,
  Home,
  Star,
  BookOpen,
  Trophy,
  Menu,
  X,
  Sparkles,
  LogIn,
  LogOut,
} from "lucide-react";

interface KidsLayoutProps {
  children: ReactNode;
}

export default function KidsLayout({ children }: KidsLayoutProps) {
  const pathname = usePathname();
  const { library } = useLibrary();
  const { patron, isLoggedIn, logout } = usePatronSession();
  const { dyslexiaFriendly } = useAccessibilityPrefs();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!featureFlags.opacKids) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6 py-16">
        <div className="max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">Kids Catalog is disabled</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This module is still being integrated. Return to the main catalog to continue browsing.
          </p>
          <div className="mt-4">
            <Link href="/opac" className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Back to OPAC
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/opac/kids", label: "Home", icon: Home, color: "text-pink-500" },
    { href: "/opac/kids/browse", label: "Browse", icon: BookOpen, color: "text-blue-500" },
    { href: "/opac/kids/challenges", label: "Challenges", icon: Trophy, color: "text-yellow-500" },
    { href: "/opac/kids/account", label: "My Stuff", icon: Star, color: "text-purple-500" },
  ];

  const isActive = (href: string) => {
    if (href === "/opac/kids") return pathname === href;
    return pathname.startsWith(href);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/opac/kids/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <KidsParentGateProvider>
      <div
        className={cn(
          "min-h-screen bg-gradient-to-b from-sky-50 via-background to-background",
          dyslexiaFriendly ? "stacksos-dyslexia" : ""
        )}
      >
      {/* Skip link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0
                 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2
                 focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Fun background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-20 left-10 w-32 h-32 bg-yellow-300/20 rounded-full blur-3xl" />
        <div className="absolute top-40 right-20 w-40 h-40 bg-pink-300/20 rounded-full blur-3xl" />
        <div className="absolute bottom-40 left-1/4 w-48 h-48 bg-blue-300/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-1/3 w-36 h-36 bg-green-300/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link href="/opac/kids" className="flex items-center gap-2 group">
              <div className="relative">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-pink-400 via-purple-400 to-blue-400 
                              rounded-2xl flex items-center justify-center shadow-lg 
                              group-hover:scale-110 transition-transform">
                  <BookOpen className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-yellow-400 animate-pulse" />
              </div>
              <div className="hidden sm:block">
                <span className="font-bold text-xl md:text-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 
                               bg-clip-text text-transparent">
                  Kids Zone
                </span>
                {library?.name && (
                  <p className="text-xs text-muted-foreground -mt-1">{library.name}</p>
                )}
              </div>
            </Link>

            {/* Search - Desktop */}
            <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-md mx-8">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for books..."
                  className="w-full pl-5 pr-12 py-3 rounded-full border-2 border-purple-200 
                           text-foreground placeholder:text-muted-foreground/70 text-lg
                           focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100
                           transition-all"
                />
                <button type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r 
                           from-purple-500 to-pink-500 text-white rounded-full 
                           hover:from-purple-600 hover:to-pink-600 transition-colors shadow-md"
                >
                  <Search className="h-5 w-5" />
                </button>
              </div>
            </form>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all
                            ${isActive(item.href)
                              ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 shadow-sm"
                              : "text-muted-foreground hover:bg-muted/50"
                            }`}
                >
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                  <span>{item.label}</span>
                </Link>
              ))}

              {/* User menu */}
              {isLoggedIn && patron ? (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 
                                flex items-center justify-center text-white font-bold shadow-md">
                    {patron.firstName?.[0] || "K"}
                  </div>
                  <button type="button"
                    onClick={() => logout()}
                    className="p-2 text-muted-foreground hover:text-foreground/80 hover:bg-muted/50 rounded-lg"
                    title="Log out"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <Link
                  href="/opac/login?redirect=/opac/kids"
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 
                           text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-600 
                           transition-colors shadow-md ml-2"
                >
                  <LogIn className="h-5 w-5" />
                  <span>Log In</span>
                </Link>
              )}
            </nav>

            {/* Mobile menu button */}
            <button type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:bg-muted/50 rounded-xl"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile Search */}
          <div className="md:hidden pb-3">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for books..."
                  className="w-full pl-4 pr-12 py-2.5 rounded-full border-2 border-purple-200 
                           text-foreground placeholder:text-muted-foreground/70
                           focus:outline-none focus:border-purple-400"
                />
                <button type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r 
                           from-purple-500 to-pink-500 text-white rounded-full"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Mobile Nav Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-card border-t border-border py-4 px-4">
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all
                            ${isActive(item.href)
                              ? "bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700"
                              : "text-muted-foreground hover:bg-muted/50"
                            }`}
                >
                  <item.icon className={`h-6 w-6 ${item.color}`} />
                  <span className="text-lg">{item.label}</span>
                </Link>
              ))}

              {isLoggedIn && patron ? (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 
                                  flex items-center justify-center text-white font-bold">
                      {patron.firstName?.[0] || "K"}
                    </div>
                    <span className="font-medium">{patron.firstName}</span>
                  </div>
                  <button type="button"
                    onClick={() => { logout(); setMobileMenuOpen(false); }}
                    className="px-4 py-2 text-muted-foreground hover:bg-muted/50 rounded-lg"
                  >
                    Log Out
                  </button>
                </div>
              ) : (
                <Link
                  href="/opac/login?redirect=/opac/kids"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 px-4 py-3 mt-2 bg-gradient-to-r 
                           from-green-500 to-emerald-500 text-white rounded-xl font-medium"
                >
                  <LogIn className="h-5 w-5" />
                  <span>Log In</span>
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main content */}
      <main id="main-content" className="relative z-10" role="main">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-12 border-t border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-purple-500" />
              <span className="font-bold text-lg text-foreground">
                {library?.name || "Library"} Kids Zone
              </span>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/opac" className="hover:text-purple-600 transition-colors">
                Adult Catalog
              </Link>
              <Link href="/opac/kids/help" className="hover:text-purple-600 transition-colors">
                Help
              </Link>
              <Link href="/opac/kids/parents" className="hover:text-purple-600 transition-colors">
                For Parents
              </Link>
            </div>

            <p className="text-sm text-muted-foreground">
              Powered by StacksOS
            </p>
          </div>
        </div>
      </footer>
      </div>
    </KidsParentGateProvider>
  );
}
