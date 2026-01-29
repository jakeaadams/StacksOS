"use client";
import { clientLogger } from "@/lib/client-logger";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/usePatronSession";
import {
  History,
  BookOpen,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Search,
  TrendingUp,
  Clock,
  Star,
} from "lucide-react";

interface HistoryItem {
  id: number;
  bibId: number;
  title: string;
  author: string;
  coverUrl?: string;
  checkoutDate: string;
  returnDate?: string;
  dueDate: string;
  renewalCount: number;
  format?: string;
}

interface ReadingStats {
  totalBooksRead: number;
  totalThisYear: number;
  totalThisMonth: number;
  averagePerMonth: number;
  favoriteGenre?: string;
  favoriteAuthor?: string;
  longestStreak: number;
}

export default function ReadingHistoryPage() {
  const router = useRouter();
  const { isLoggedIn, patron } = usePatronSession();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [sortBy, setSortBy] = useState<"date" | "title" | "author">("date");
  const itemsPerPage = 20;

  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/history");
      return;
    }
    fetchHistory();
  }, [isLoggedIn, page, filterYear, sortBy]);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        limit: String(itemsPerPage),
        sort: sortBy,
      });
      if (filterYear) params.set("year", filterYear);
      if (searchQuery) params.set("q", searchQuery);

      const response = await fetch(`/api/opac/history?${params}`, { credentials: "include" });

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/opac/login?redirect=/opac/account/history");
          return;
        }
        throw new Error("Failed to fetch history");
      }

      const data = await response.json();
      setHistory(data.history || []);
      setStats(data.stats);
      setTotalPages(Math.ceil((data.total || 0) / itemsPerPage));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchHistory();
  };

  const exportHistory = async (format: "csv" | "json") => {
    try {
      const response = await fetch(`/api/opac/history/export?format=${format}`, { credentials: "include" });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reading-history.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) {
      clientLogger.error("Export failed:", err);
    }
  };

  // Get list of years for filter
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/opac/account"
            className="inline-flex items-center gap-1 text-primary-600 hover:underline mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary-100 rounded-xl">
                <History className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Reading History</h1>
                <p className="text-muted-foreground">Track your library journey</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => exportHistory("csv")}
                className="flex items-center gap-2 px-4 py-2 border border-border text-foreground/80
                         rounded-lg hover:bg-muted/30 transition-colors text-sm"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalBooksRead}</p>
                  <p className="text-sm text-muted-foreground">Total Books</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalThisYear}</p>
                  <p className="text-sm text-muted-foreground">This Year</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.averagePerMonth}</p>
                  <p className="text-sm text-muted-foreground">Avg/Month</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Star className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground truncate">{stats.favoriteAuthor || "—"}</p>
                  <p className="text-sm text-muted-foreground">Top Author</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-card rounded-xl border border-border p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search your history..."
                  className="w-full pl-14 pr-4 py-2 border border-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </form>
            <select
              value={filterYear}
              onChange={(e) => {
                setFilterYear(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Years</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="date">Sort by Date</option>
              <option value="title">Sort by Title</option>
              <option value="author">Sort by Author</option>
            </select>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <History className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              No reading history yet
            </h2>
            <p className="text-muted-foreground mb-6">
              {filterYear || searchQuery
                ? "No items match your filters. Try adjusting your search."
                : "Your reading history will appear here once you return items."}
            </p>
            <Link
              href="/opac"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white
                       rounded-lg font-medium hover:bg-primary-700 transition-colors"
            >
              <Search className="h-4 w-4" />
              Browse Catalog
            </Link>
          </div>
        ) : (
          <>
            {/* History list */}
            <div className="space-y-4">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="bg-card rounded-xl border border-border p-4 flex gap-4"
                >
                  {/* Cover */}
                  <div className="w-16 h-24 bg-muted/50 rounded-lg shrink-0 overflow-hidden">
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="h-6 w-6 text-muted-foreground/70" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/opac/record/${item.bibId}`}
                      className="font-semibold text-foreground hover:text-primary-600 line-clamp-1"
                    >
                      {item.title}
                    </Link>
                    {item.author && (
                      <p className="text-sm text-muted-foreground">{item.author}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Checked out: {new Date(item.checkoutDate).toLocaleDateString()}
                      </span>
                      {item.returnDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Returned: {new Date(item.returnDate).toLocaleDateString()}
                        </span>
                      )}
                      {item.renewalCount > 0 && (
                        <span className="text-primary-600">
                          Renewed {item.renewalCount}x
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0">
                    <Link
                      href={`/opac/record/${item.bibId}`}
                      className="px-3 py-1 text-sm text-primary-600 border border-primary-200
                               rounded-lg hover:bg-primary-50 transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border border-border rounded-lg disabled:opacity-50 
                           disabled:cursor-not-allowed hover:bg-muted/30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="px-4 py-2 text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <button type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 border border-border rounded-lg disabled:opacity-50 
                           disabled:cursor-not-allowed hover:bg-muted/30"
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
