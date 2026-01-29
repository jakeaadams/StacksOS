"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePatronSession } from "@/hooks/usePatronSession";
import {
  BookOpen,
  Plus,
  Calendar,
  Clock,
  Star,
  ChevronLeft,
  Check,
  Search,
  Sparkles,
  Flame,
  X,
  Loader2,
} from "lucide-react";

interface ReadingEntry {
  id: string;
  bookId: number;
  bookTitle: string;
  bookAuthor?: string;
  coverUrl?: string;
  date: string;
  minutesRead: number;
  pagesRead?: number;
  rating?: number;
  notes?: string;
}

interface BookSearchResult {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
}

export default function ReadingLogPage() {
  const router = useRouter();
  const { patron, isLoggedIn, checkouts } = usePatronSession();
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Stats
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [totalBooks, setTotalBooks] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);

  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/opac/login?redirect=/opac/kids/account/reading-log");
      return;
    }
    loadReadingLog();
  }, [isLoggedIn]);

  const loadReadingLog = async () => {
    setIsLoading(true);
    
    // In a real implementation, this would fetch from StacksOS API
    // For now, show sample data
    const sampleEntries: ReadingEntry[] = [
      {
        id: "1",
        bookId: 101,
        bookTitle: "Harry Potter and the Sorcerer is Stone",
        bookAuthor: "J.K. Rowling",
        date: "Today",
        minutesRead: 30,
        pagesRead: 25,
        rating: 5,
      },
      {
        id: "2",
        bookId: 102,
        bookTitle: "Diary of a Wimpy Kid",
        bookAuthor: "Jeff Kinney",
        date: "Yesterday",
        minutesRead: 20,
        pagesRead: 40,
        rating: 4,
      },
      {
        id: "3",
        bookId: 103,
        bookTitle: "Dog Man",
        bookAuthor: "Dav Pilkey",
        date: "Jan 20",
        minutesRead: 15,
        pagesRead: 50,
        rating: 5,
      },
    ];

    setEntries(sampleEntries);
    setTotalMinutes(sampleEntries.reduce((sum, e) => sum + e.minutesRead, 0));
    setTotalBooks(new Set(sampleEntries.map((e) => e.bookId)).size);
    setCurrentStreak(7);
    setIsLoading(false);
  };

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button type="button"
          onClick={() => router.back()}
          className="p-2 text-muted-foreground hover:text-foreground/80 hover:bg-muted/50 rounded-xl"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
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
      <button type="button"
        onClick={() => setShowAddModal(true)}
        className="w-full flex items-center justify-center gap-2 p-4 mb-8 bg-gradient-to-r 
                 from-purple-500 to-pink-500 text-white rounded-2xl font-bold text-lg
                 hover:from-purple-600 hover:to-pink-600 transition-colors shadow-lg"
      >
        <Plus className="h-6 w-6" />
        Log Reading
      </button>

      {/* Reading entries */}
      <section>
        <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-purple-500" />
          Recent Reading
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
          </div>
        ) : entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((entry) => (
              <ReadingEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-card rounded-2xl">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No reading logged yet!</p>
            <button type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-purple-100 text-purple-700 
                       rounded-xl font-medium hover:bg-purple-200"
            >
              <Plus className="h-5 w-5" />
              Log Your First Book
            </button>
          </div>
        )}
      </section>

      {/* Add Reading Modal */}
      {showAddModal && (
        <AddReadingModal
          onClose={() => setShowAddModal(false)}
          checkouts={checkouts || []}
          onAdd={(entry) => {
            setEntries([entry, ...entries]);
            setTotalMinutes((prev) => prev + entry.minutesRead);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function ReadingEntryCard({ entry }: { entry: ReadingEntry }) {
  return (
    <div className="flex gap-4 p-4 bg-card rounded-2xl shadow-sm">
      {/* Book cover placeholder */}
      <div className="w-16 h-20 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 
                    flex items-center justify-center shrink-0">
        <BookOpen className="h-6 w-6 text-purple-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-foreground line-clamp-1">{entry.bookTitle}</h3>
            {entry.bookAuthor && (
              <p className="text-sm text-muted-foreground">{entry.bookAuthor}</p>
            )}
          </div>
          <span className="text-sm text-muted-foreground/70 shrink-0">{entry.date}</span>
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
  onAdd,
}: {
  onClose: () => void;
  checkouts: any[];
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
        checkouts.map((c: any) => ({
          id: c.recordId || c.id,
          title: c.title,
          author: c.author,
          coverUrl: c.isbn
            ? `https://covers.openlibrary.org/b/isbn/${c.isbn}-S.jpg`
            : undefined,
        }))
      );
    }
  }, [checkouts]);

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
            coverUrl: (r.isbn || r.simple_record?.isbn)
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

    const entry: ReadingEntry = {
      id: Date.now().toString(),
      bookId: selectedBook.id,
      bookTitle: selectedBook.title,
      bookAuthor: selectedBook.author,
      coverUrl: selectedBook.coverUrl,
      date: "Today",
      minutesRead,
      pagesRead,
      rating: rating > 0 ? rating : undefined,
      notes: notes || undefined,
    };

    onAdd(entry);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="text-xl font-bold text-foreground">
            {step === "book" ? "What did you read?" : "How much did you read?"}
          </h2>
          <button type="button"
            onClick={onClose}
            className="p-2 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/50 rounded-full"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {step === "book" ? (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search for a book..."
                  className="w-full pl-4 pr-12 py-3 rounded-xl border-2 border-border 
                           focus:border-purple-400 focus:outline-none"
                />
                <button type="button"
                  onClick={handleSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground/70 
                           hover:text-purple-600"
                >
                  <Search className="h-5 w-5" />
                </button>
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
                      <button type="button"
                        key={book.id}
                        onClick={() => {
                          setSelectedBook(book);
                          setStep("details");
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left
                                 transition-colors hover:border-purple-400 hover:bg-purple-50
                                 ${selectedBook?.id === book.id 
                                   ? "border-purple-400 bg-purple-50" 
                                   : "border-border"
                                 }`}
                      >
                        <div className="w-10 h-14 rounded bg-muted/50 flex items-center justify-center shrink-0">
                          <BookOpen className="h-5 w-5 text-muted-foreground/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground line-clamp-1">{book.title}</p>
                          {book.author && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{book.author}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Selected book */}
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl mb-6">
                <div className="w-10 h-14 rounded bg-purple-100 flex items-center justify-center shrink-0">
                  <BookOpen className="h-5 w-5 text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{selectedBook?.title}</p>
                  {selectedBook?.author && (
                    <p className="text-sm text-muted-foreground">{selectedBook.author}</p>
                  )}
                </div>
                <button type="button"
                  onClick={() => setStep("book")}
                  className="text-sm text-purple-600 hover:text-purple-700"
                >
                  Change
                </button>
              </div>

              {/* Minutes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  How many minutes did you read?
                </label>
                <div className="flex items-center gap-3">
                  {[10, 15, 20, 30, 45, 60].map((mins) => (
                    <button type="button"
                      key={mins}
                      onClick={() => setMinutesRead(mins)}
                      className={`px-4 py-2 rounded-xl font-medium transition-colors
                               ${minutesRead === mins
                                 ? "bg-purple-500 text-white"
                                 : "bg-muted/50 text-foreground/80 hover:bg-muted"
                               }`}
                    >
                      {mins}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={minutesRead}
                  onChange={(e) => setMinutesRead(parseInt(e.target.value) || 0)}
                  className="mt-2 w-full px-4 py-2 rounded-xl border-2 border-border 
                           focus:border-purple-400 focus:outline-none"
                  placeholder="Or type a number..."
                />
              </div>

              {/* Pages (optional) */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  How many pages? (optional)
                </label>
                <input
                  type="number"
                  value={pagesRead || ""}
                  onChange={(e) => setPagesRead(parseInt(e.target.value) || undefined)}
                  className="w-full px-4 py-2 rounded-xl border-2 border-border 
                           focus:border-purple-400 focus:outline-none"
                  placeholder="Enter pages read..."
                />
              </div>

              {/* Rating */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Rate this book (optional)
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button type="button"
                      key={star}
                      onClick={() => setRating(rating === star ? 0 : star)}
                      className="p-1"
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${
                          star <= rating
                            ? "text-yellow-400 fill-current"
                            : "text-muted-foreground/50 hover:text-yellow-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/50">
          {step === "details" && (
            <button type="button"
              onClick={handleSubmit}
              disabled={!selectedBook || minutesRead <= 0}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 
                       bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl 
                       font-bold hover:from-purple-600 hover:to-pink-600 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="h-5 w-5" />
              Log Reading
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
