"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";
import { useKidsParentGate } from "@/contexts/kids-parent-gate-context";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePatronSession, type PatronCheckout } from "@/hooks/use-patron-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  Plus,
  Calendar,
  Clock,
  Star,
  ChevronLeft,
  Check,
  Search,
  Flame,
  X,
  Loader2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface ReadingEntry {
  id: number;
  bibId: number | null;
  title: string;
  author?: string | null;
  isbn?: string | null;
  readAt: string; // YYYY-MM-DD
  minutesRead: number;
  pagesRead?: number | null;
  rating?: number | null;
  notes?: string | null;
}

interface BookSearchResult {
  id: number;
  title: string;
  author: string;
  isbn?: string;
  coverUrl?: string;
}

function toLocalISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatRelativeDate(isoDate: string): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const key = isoDate.slice(0, 10);
  if (key === toLocalISODate(today)) return "Today";
  if (key === toLocalISODate(yesterday)) return "Yesterday";

  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function computeCurrentStreak(entries: ReadingEntry[]): number {
  const days = new Set(entries.map((e) => e.readAt.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = toLocalISODate(cursor);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function ReadingLogPage() {
  const _t = useTranslations("kidsReadingLog");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, checkouts } = usePatronSession();
  const gate = useKidsParentGate();
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [prefillBook, setPrefillBook] = useState<BookSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);

  // Stats
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [totalBooks, setTotalBooks] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);

  const loadReadingLog = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetchWithAuth("/api/opac/kids/reading-log?limit=200");
      const data = await response.json();
      const raw = Array.isArray(data?.entries) ? data.entries : [];
      const normalized: ReadingEntry[] = raw
        .filter((e: any) => e && typeof e.id === "number")
        .map((e: any) => ({
          id: e.id,
          bibId: typeof e.bibId === "number" ? e.bibId : null,
          title: String(e.title || "Untitled"),
          author: e.author ? String(e.author) : null,
          isbn: e.isbn ? String(e.isbn) : null,
          readAt: String(e.readAt || e.read_at || toLocalISODate(new Date())),
          minutesRead: typeof e.minutesRead === "number" ? e.minutesRead : 0,
          pagesRead: typeof e.pagesRead === "number" ? e.pagesRead : null,
          rating: typeof e.rating === "number" ? e.rating : null,
          notes: e.notes ? String(e.notes) : null,
        }));

      setEntries(normalized);
      setTotalMinutes(normalized.reduce((sum, e) => sum + e.minutesRead, 0));
      setTotalBooks(new Set(normalized.map((e) => e.bibId ?? e.title)).size);
      setCurrentStreak(computeCurrentStreak(normalized));
    } catch (err) {
      clientLogger.error("Failed to load reading log:", err);
      setEntries([]);
      setTotalMinutes(0);
      setTotalBooks(0);
      setCurrentStreak(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/opac/login?redirect=/opac/kids/account/reading-log");
      return;
    }
    if (!featureFlags.kidsEngagementV1) {
      setIsLoading(false);
      return;
    }
    loadReadingLog();
  }, [isLoggedIn, loadReadingLog, router]);

  useEffect(() => {
    if (!isLoggedIn || !featureFlags.kidsEngagementV1) return;
    const bibIdRaw = searchParams.get("bibId");
    if (!bibIdRaw) return;

    const bibId = parseInt(bibIdRaw, 10);
    if (!Number.isFinite(bibId) || bibId <= 0) return;

    const title = searchParams.get("title") || "";
    const author = searchParams.get("author") || "";
    const isbn = searchParams.get("isbn") || "";
    const cleanIsbn = isbn.replace(/[^0-9Xx]/g, "");
    const coverUrl = cleanIsbn
      ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-S.jpg`
      : undefined;

    setPrefillBook({
      id: bibId,
      title: title || "Untitled",
      author: author || "",
      isbn: cleanIsbn || undefined,
      coverUrl,
    });
    setShowAddModal(true);
    router.replace("/opac/kids/account/reading-log");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, searchParams]);

  if (!isLoggedIn) {
    return null;
  }

  if (!featureFlags.kidsEngagementV1) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Reading Log is disabled</h1>
        <p className="text-muted-foreground mb-6">
          Kids engagement features are still rolling out. Check back soon.
        </p>
        <Button
          type="button"
          onClick={() => router.push("/opac/kids/account")}
          variant="outline"
          className="border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
        >
          Back to My Stuff
        </Button>
      </div>
    );
  }

  const handleDelete = async (entryId: number) => {
    const ok = await gate.requestUnlock({ reason: "Delete a reading log entry" });
    if (!ok) return;
    if (!confirm("Delete this reading log entry?")) return;
    setDeleteLoading(entryId);
    try {
      const res = await fetchWithAuth("/api/opac/kids/reading-log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Delete failed");
      }
      const next = entries.filter((e) => e.id !== entryId);
      setEntries(next);
      setTotalMinutes(next.reduce((sum, e) => sum + e.minutesRead, 0));
      setTotalBooks(new Set(next.map((e) => e.bibId ?? e.title)).size);
      setCurrentStreak(computeCurrentStreak(next));
    } catch (err) {
      clientLogger.error("Delete failed:", err);
    } finally {
      setDeleteLoading(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-foreground/80"
          aria-label="Go back"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reading Log</h1>
          <p className="text-muted-foreground">Track your reading and earn rewards!</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className="h-5 w-5 text-blue-500" />
            <span className="text-2xl font-bold text-blue-700">{totalMinutes}</span>
          </div>
          <p className="text-sm text-blue-600">Minutes Read</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <BookOpen className="h-5 w-5 text-green-500" />
            <span className="text-2xl font-bold text-green-700">{totalBooks}</span>
          </div>
          <p className="text-sm text-green-600">Books</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="text-2xl font-bold text-orange-700">{currentStreak}</span>
          </div>
          <p className="text-sm text-orange-600">Day Streak</p>
        </div>
      </div>

      {/* Add reading button */}
      <Button
        type="button"
        onClick={() => setShowAddModal(true)}
        className="mb-8 w-full rounded-2xl bg-[linear-gradient(125deg,hsl(var(--brand-1))_0%,hsl(var(--brand-3))_88%)] py-6 text-lg font-bold text-white shadow-lg hover:brightness-110"
      >
        <Plus className="h-6 w-6" />
        Log Reading
      </Button>

      {/* Reading entries */}
      <section>
        <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary-600" />
          Recent Reading
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
          </div>
        ) : entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((entry) => (
              <ReadingEntryCard
                key={entry.id}
                entry={entry}
                onDelete={() => handleDelete(entry.id)}
                deleteLoading={deleteLoading === entry.id}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-card rounded-2xl">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No reading logged yet!</p>
            <Button
              type="button"
              onClick={() => setShowAddModal(true)}
              variant="outline"
              className="inline-flex items-center gap-2 border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
            >
              <Plus className="h-5 w-5" />
              Log Your First Book
            </Button>
          </div>
        )}
      </section>

      {/* Add Reading Modal */}
      {showAddModal && (
        <AddReadingModal
          onClose={() => {
            setShowAddModal(false);
            setPrefillBook(null);
          }}
          checkouts={checkouts || []}
          initialBook={prefillBook}
          onAdd={(entry) => {
            const next = [entry, ...entries];
            setEntries(next);
            setTotalMinutes(next.reduce((sum, e) => sum + e.minutesRead, 0));
            setTotalBooks(new Set(next.map((e) => e.bibId ?? e.title)).size);
            setCurrentStreak(computeCurrentStreak(next));
            setShowAddModal(false);
            setPrefillBook(null);
          }}
        />
      )}
    </div>
  );
}

function ReadingEntryCard({
  entry,
  onDelete,
  deleteLoading,
}: {
  entry: ReadingEntry;
  onDelete: () => void;
  deleteLoading: boolean;
}) {
  const cleanIsbn = entry.isbn ? entry.isbn.replace(/[^0-9Xx]/g, "") : "";
  const coverUrl = cleanIsbn
    ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-S.jpg`
    : undefined;

  return (
    <div className="flex gap-4 p-4 bg-card rounded-2xl shadow-sm">
      {/* Book cover placeholder */}
      <div
        className="w-16 h-20 rounded-lg bg-gradient-to-br from-primary-100 to-primary-50 
                    flex items-center justify-center shrink-0"
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={entry.title || "Book cover"}
            className="h-full w-full object-cover rounded-lg"
          />
        ) : (
          <BookOpen className="h-6 w-6 text-primary-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-foreground line-clamp-1">{entry.title}</h3>
            {entry.author && <p className="text-sm text-muted-foreground">{entry.author}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-muted-foreground/70">
              {formatRelativeDate(entry.readAt)}
            </span>
            <Button
              type="button"
              onClick={onDelete}
              disabled={deleteLoading}
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground/70 hover:bg-muted/40 hover:text-destructive disabled:opacity-50"
              aria-label="Delete entry"
            >
              {deleteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-sm text-blue-600">
            <Clock className="h-4 w-4" />
            <span>{entry.minutesRead} min</span>
          </div>
          {entry.pagesRead && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <BookOpen className="h-4 w-4" />
              <span>{entry.pagesRead} pages</span>
            </div>
          )}
          {entry.rating && (
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${
                    i < entry.rating! ? "text-yellow-400 fill-current" : "text-muted-foreground/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddReadingModal({
  onClose,
  checkouts,
  initialBook,
  onAdd,
}: {
  onClose: () => void;
  checkouts: PatronCheckout[];
  initialBook?: BookSearchResult | null;
  onAdd: (entry: ReadingEntry) => void;
}) {
  const [step, setStep] = useState<"book" | "details">("book");
  const [selectedBook, setSelectedBook] = useState<BookSearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [minutesRead, setMinutesRead] = useState(15);
  const [pagesRead, setPagesRead] = useState<number | undefined>();
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // Show current checkouts as suggestions
    if (checkouts.length > 0) {
      setSearchResults(
        checkouts
          .filter((c) => typeof c.recordId === "number" && c.recordId > 0)
          .map((c) => ({
            id: c.recordId!,
            title: c.title,
            author: c.author,
            isbn: c.isbn || undefined,
            coverUrl: c.isbn ? `https://covers.openlibrary.org/b/isbn/${c.isbn}-S.jpg` : c.coverUrl,
          }))
      );
    }
  }, [checkouts]);

  useEffect(() => {
    if (!initialBook) return;
    setSelectedBook(initialBook);
    setStep("details");
  }, [initialBook]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetchWithAuth(
        `/api/evergreen/catalog?q=${encodeURIComponent(searchQuery)}&audience=juvenile&limit=10`
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(
          (data.records || []).map((r: any) => ({
            id: r.id || r.record_id,
            title: r.title || r.simple_record?.title,
            author: r.author || r.simple_record?.author,
            isbn: r.isbn || r.simple_record?.isbn,
            coverUrl:
              r.isbn || r.simple_record?.isbn
                ? `https://covers.openlibrary.org/b/isbn/${r.isbn || r.simple_record?.isbn}-S.jpg`
                : undefined,
          }))
        );
      }
    } catch (err) {
      clientLogger.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = () => {
    if (!selectedBook) return;

    void (async () => {
      try {
        const res = await fetchWithAuth("/api/opac/kids/reading-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bibId: selectedBook.id,
            title: selectedBook.title,
            author: selectedBook.author,
            isbn: selectedBook.isbn,
            minutesRead,
            pagesRead,
            rating: rating > 0 ? rating : undefined,
            notes: notes || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || "Failed to save reading log entry");
        }

        const saved = data.entry;
        const entry: ReadingEntry = {
          id: saved.id,
          bibId: typeof saved.bibId === "number" ? saved.bibId : null,
          title: String(saved.title || selectedBook.title),
          author: saved.author ? String(saved.author) : selectedBook.author,
          isbn: saved.isbn ? String(saved.isbn) : selectedBook.isbn,
          readAt: String(saved.readAt || toLocalISODate(new Date())),
          minutesRead: typeof saved.minutesRead === "number" ? saved.minutesRead : minutesRead,
          pagesRead: typeof saved.pagesRead === "number" ? saved.pagesRead : (pagesRead ?? null),
          rating: typeof saved.rating === "number" ? saved.rating : rating || null,
          notes: saved.notes ? String(saved.notes) : notes || null,
        };

        onAdd(entry);
      } catch (err) {
        clientLogger.error("Failed to save reading log entry:", err);
      }
    })();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="text-xl font-bold text-foreground">
            {step === "book" ? "What did you read?" : "How much did you read?"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full text-muted-foreground/70 hover:bg-muted/50 hover:text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {step === "book" ? (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search for a book..."
                  className="h-12 rounded-xl border-2 pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleSearch}
                  className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground/70 hover:text-primary-600"
                  aria-label="Search"
                >
                  <Search className="h-5 w-5" />
                </Button>
              </div>

              {/* Book list */}
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
                </div>
              ) : (
                <>
                  {searchResults.length > 0 && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {checkouts.length > 0 && !searchQuery
                        ? "Your checked out books:"
                        : "Search results:"}
                    </p>
                  )}
                  <div className="space-y-2">
                    {searchResults.map((book) => (
                      <Button
                        type="button"
                        key={book.id}
                        onClick={() => {
                          setSelectedBook(book);
                          setStep("details");
                        }}
                        variant="ghost"
                        className={`h-auto w-full justify-start gap-3 rounded-xl border-2 p-3 text-left
                                 transition-colors hover:border-primary-400 hover:bg-primary-50/40
                                 ${
                                   selectedBook?.id === book.id
                                     ? "border-primary-400 bg-primary-50/40"
                                     : "border-border"
                                 }`}
                      >
                        <div className="w-10 h-14 rounded bg-muted/50 flex items-center justify-center shrink-0">
                          <BookOpen className="h-5 w-5 text-muted-foreground/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground line-clamp-1">{book.title}</p>
                          {book.author && (
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {book.author}
                            </p>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Selected book */}
              <div className="mb-6 flex items-center gap-3 rounded-xl bg-primary-50/60 p-3">
                <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-primary-100">
                  <BookOpen className="h-5 w-5 text-primary-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{selectedBook?.title}</p>
                  {selectedBook?.author && (
                    <p className="text-sm text-muted-foreground">{selectedBook.author}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("book")}
                  className="text-primary-700"
                >
                  Change
                </Button>
              </div>

              {/* Minutes */}
              <div className="mb-6">
                <label
                  htmlFor="how-many-minutes-did-you-read"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  How many minutes did you read?
                </label>
                <div className="flex items-center gap-3">
                  {[10, 15, 20, 30, 45, 60].map((mins) => (
                    <Button
                      type="button"
                      key={mins}
                      onClick={() => setMinutesRead(mins)}
                      variant={minutesRead === mins ? "default" : "outline"}
                      className={`rounded-xl font-medium transition-colors
                               ${
                                 minutesRead === mins
                                   ? "stx-action-primary text-white"
                                   : "bg-muted/50 text-foreground/80 hover:bg-muted"
                               }`}
                    >
                      {mins}
                    </Button>
                  ))}
                </div>
                <Input
                  id="how-many-minutes-did-you-read"
                  type="number"
                  value={minutesRead}
                  onChange={(e) => setMinutesRead(parseInt(e.target.value) || 0)}
                  className="mt-2 h-11 rounded-xl border-2"
                  placeholder="Or type a number..."
                />
              </div>

              {/* Pages (optional) */}
              <div className="mb-6">
                <label
                  htmlFor="how-many-pages"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  How many pages? (optional)
                </label>
                <Input
                  id="how-many-pages"
                  type="number"
                  value={pagesRead || ""}
                  onChange={(e) => setPagesRead(parseInt(e.target.value) || undefined)}
                  className="h-11 rounded-xl border-2"
                  placeholder="Enter pages read..."
                />
              </div>

              {/* Rating */}
              <div className="mb-6">
                <label
                  htmlFor="rate-this-book"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  Rate this book (optional)
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 p-1"
                      type="button"
                      key={star}
                      onClick={() => setRating(rating === star ? 0 : star)}
                      aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${
                          star <= rating
                            ? "text-yellow-400 fill-current"
                            : "text-muted-foreground/50 hover:text-yellow-300"
                        }`}
                      />
                    </Button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="mb-6">
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  Notes (optional)
                </label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="What did you like? Any new words? Favorite part?"
                  className="rounded-xl border-2"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/50">
          {step === "details" && (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedBook || minutesRead <= 0}
              className="w-full rounded-xl bg-[linear-gradient(125deg,hsl(var(--brand-1))_0%,hsl(var(--brand-3))_88%)] py-6 font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              <Check className="h-5 w-5" />
              Log Reading
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
