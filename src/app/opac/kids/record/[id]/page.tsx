"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/use-patron-session";
import { useKidsParentGate } from "@/contexts/kids-parent-gate-context";
import { LoadingSpinner } from "@/components/shared/loading-state";
import {
  BookOpen,
  User,
  Calendar,
  MapPin,
  Star,
  Heart,
  ChevronLeft,
  Check,
  Clock,
  Sparkles,
  Loader2,
  Share2,
  BookmarkPlus,
  Headphones,
  Smartphone,
  Film,
  AlertCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface BookDetail {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  summary?: string;
  subjects?: string[];
  isbn?: string;
  publisher?: string;
  pubDate?: string;
  format?: string;
  pageCount?: number;
  readingLevel?: string;
  lexile?: number;
  arLevel?: number;
  series?: string;
  holdings: HoldingInfo[];
}

interface HoldingInfo {
  locationId: number;
  locationName: string;
  callNumber: string;
  available: number;
  total: number;
  status: string;
}

interface RelatedBook {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
}

function transformBookDetail(data: any): BookDetail {
  const isbn = data.isbn || data.simple_record?.isbn;
  return {
    id: data.id || data.record_id,
    title: data.title || data.simple_record?.title || "Unknown Title",
    author: data.author || data.simple_record?.author || "",
    coverUrl: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : undefined,
    summary: data.summary || data.abstract,
    subjects: data.subjects || [],
    isbn: isbn,
    publisher: data.publisher,
    pubDate: data.pubdate || data.pub_date,
    format: data.format || data.icon_format,
    pageCount: data.pages || data.page_count,
    readingLevel: data.lexile ? `Lexile ${data.lexile}` : data.ar_level ? `AR ${data.ar_level}` : undefined,
    lexile: data.lexile,
    arLevel: data.ar_level,
    series: data.series,
    holdings: (data.holdings || data.copies || []).map((h: any) => ({
      locationId: h.location_id || h.circ_lib,
      locationName: h.location_name || h.circ_lib_name || "Library",
      callNumber: h.call_number || h.label,
      available: h.available || 0,
      total: h.total || 1,
      status: h.status || (h.available > 0 ? "Available" : "Checked Out"),
    })),
  };
}

export default function KidsRecordDetailPage() {
  const t = useTranslations("kidsRecordPage");
  const params = useParams();
  const router = useRouter();
  const recordId = params.id as string;
  const { patron, isLoggedIn, placeHold } = usePatronSession();
  const gate = useKidsParentGate();

  const [book, setBook] = useState<BookDetail | null>(null);
  const [relatedBooks, setRelatedBooks] = useState<RelatedBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdSuccess, setHoldSuccess] = useState(false);
  const [holdError, setHoldError] = useState<{ message: string; nextSteps?: string[]; code?: string } | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [coverError, setCoverError] = useState(false);

  const fetchRelatedBooks = useCallback(async (subject: string) => {
    try {
      const params = new URLSearchParams({
        q: subject,
        type: "subject",
        audience: "juvenile",
        limit: "6",
        sort: "popularity",
      });
      const response = await fetchWithAuth(`/api/evergreen/catalog?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRelatedBooks(
          (data.records || [])
            .filter((r: any) => (r.id || r.record_id) !== parseInt(recordId))
            .slice(0, 5)
            .map((r: any) => ({
              id: r.id || r.record_id,
              title: r.title || r.simple_record?.title,
              author: r.author || r.simple_record?.author,
              coverUrl: (r.isbn || r.simple_record?.isbn)
                ? `https://covers.openlibrary.org/b/isbn/${r.isbn || r.simple_record?.isbn}-M.jpg`
                : undefined,
            }))
        );
      }
    } catch (err) {
      clientLogger.error("Error fetching related books:", err);
    }
  }, [recordId]);

  const fetchBookDetail = useCallback(async () => {
    if (!recordId) return;
    setIsLoading(true);
    try {
      const response = await fetchWithAuth(`/api/evergreen/catalog/${recordId}`);
      if (response.ok) {
        const data = await response.json();
        setBook(transformBookDetail(data));
        setCoverError(false);

        // Fetch related books based on subject
        if (data.subjects?.length > 0) {
          void fetchRelatedBooks(data.subjects[0]);
        }
      }
    } catch (err) {
      clientLogger.error("Error fetching book:", err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchRelatedBooks, recordId]);

  useEffect(() => {
    void fetchBookDetail();
  }, [fetchBookDetail]);

  const handlePlaceHold = async (pickupLocationId: number) => {
    if (!isLoggedIn || !patron) {
      router.push(`/opac/login?redirect=/opac/kids/record/${recordId}`);
      return;
    }

    const ok = await gate.requestUnlock({ reason: "Place a hold" });
    if (!ok) return;

    setHoldLoading(true);
    setHoldError(null);

    try {
      const res = await placeHold(parseInt(recordId), pickupLocationId);
      if (!res.success) {
        setHoldError({
          message: res.message || t("holdError"),
          nextSteps: res.details?.nextSteps,
          code: res.details?.code,
        });
        return;
      }

      setHoldSuccess(true);
      setTimeout(() => {
        setShowHoldModal(false);
        setHoldSuccess(false);
      }, 2000);
    } catch (err: any) {
      setHoldError({ message: (err instanceof Error ? err.message : String(err)) || t("holdError") });
    } finally {
      setHoldLoading(false);
    }
  };

  const totalAvailable = book?.holdings.reduce((sum, h) => sum + h.available, 0) || 0;
  const totalCopies = book?.holdings.reduce((sum, h) => sum + h.total, 0) || 0;

  const getFormatIcon = (format?: string) => {
    switch (format?.toLowerCase()) {
      case "ebook": return Smartphone;
      case "audiobook": return Headphones;
      case "dvd": return Film;
      default: return BookOpen;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <LoadingSpinner message={t("loadingBookDetails")} size="lg" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
          <AlertCircle className="h-10 w-10 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{t("bookNotFound")}</h2>
        <p className="text-muted-foreground mb-6">{t("bookNotFoundDesc")}</p>
        <Link
          href="/opac/kids"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 
                   text-white rounded-full font-medium"
        >
          <ChevronLeft className="h-5 w-5" />
          Back to Kids Zone
        </Link>
      </div>
    );
  }

  const FormatIcon = getFormatIcon(book.format);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Back button */}
      <button type="button"
        onClick={() => router.back()}
        className="flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6"
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="font-medium">{t("back")}</span>
      </button>

      {/* Main content */}
      <div className="bg-card rounded-3xl shadow-lg overflow-hidden">
        <div className="md:flex">
          {/* Cover image */}
          <div className="md:w-1/3 p-6 md:p-8 bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
            <div className="aspect-[2/3] relative rounded-2xl overflow-hidden shadow-xl mx-auto max-w-[250px]">
              {book.coverUrl && !coverError ? (
                <Image
                  src={book.coverUrl}
                  alt={book.title}
                  fill
                  sizes="250px"
                  className="object-cover"
                  onError={() => setCoverError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-200 to-pink-200">
                  <FormatIcon className="h-20 w-20 text-purple-400" />
                </div>
              )}
            </div>

            {/* Reading level badges */}
            {(book.lexile || book.arLevel) && (
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {book.lexile && (
                  <span className="px-3 py-1 bg-card/80 rounded-full text-sm font-medium text-purple-700">
                    Lexile {book.lexile}
                  </span>
                )}
                {book.arLevel && (
                  <span className="px-3 py-1 bg-card/80 rounded-full text-sm font-medium text-blue-700">
                    AR Level {book.arLevel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="md:w-2/3 p-6 md:p-8">
            {/* Title and author */}
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                {book.title}
              </h1>
              {book.author && (
                <p className="text-lg text-muted-foreground flex items-center gap-2">
                  <User className="h-5 w-5 text-muted-foreground/70" />
                  {book.author}
                </p>
              )}
              {book.series && (
                <p className="text-sm text-purple-600 mt-1">
                  {t("partOfSeries")} <span className="font-medium">{book.series}</span> {t("series")}
                </p>
              )}
            </div>

            {/* Availability */}
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border-2 border-green-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {totalAvailable > 0 ? (
                    <>
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <Check className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-bold text-green-700 text-lg">{t("available")}</p>
                        <p className="text-sm text-green-600">
                          {t("copiesReady", { available: totalAvailable, total: totalCopies })}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                        <Clock className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-bold text-orange-700 text-lg">{t("allCheckedOut")}</p>
                        <p className="text-sm text-orange-600">{t("placeHoldNext")}</p>
                      </div>
                    </>
                  )}
                </div>
                
                <button type="button"
                  onClick={() => setShowHoldModal(true)}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white 
                           rounded-full font-bold hover:from-purple-600 hover:to-pink-600 
                           transition-colors shadow-lg"
                >
                  {totalAvailable > 0 ? "Get This Book" : "Place Hold"}
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-6">
              <button type="button"
                onClick={() => setIsFavorite(!isFavorite)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-colors
                         ${isFavorite 
                           ? "border-pink-400 bg-pink-50 text-pink-600" 
                           : "border-border text-muted-foreground hover:border-pink-200"
                         }`}
              >
                <Heart className={`h-5 w-5 ${isFavorite ? "fill-current" : ""}`} />
                <span>{isFavorite ? t("saved") : t("save")}</span>
              </button>
              
              <button type="button"
                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-border 
                         text-muted-foreground hover:border-purple-200"
              >
                <BookmarkPlus className="h-5 w-5" />
                <span>{t("addToList")}</span>
              </button>
              
              <button type="button"
                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-border 
                         text-muted-foreground hover:border-purple-200"
              >
                <Share2 className="h-5 w-5" />
                <span>{t("share")}</span>
              </button>
            </div>

            {/* Summary */}
            {book.summary && (
              <div className="mb-6">
                <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-500" />
                  About This Book
                </h3>
                <p className="text-muted-foreground leading-relaxed">{book.summary}</p>
              </div>
            )}

            {/* Subjects */}
            {book.subjects && book.subjects.length > 0 && (
              <div className="mb-6">
                <h3 className="font-bold text-foreground mb-2">{t("topics")}</h3>
                <div className="flex flex-wrap gap-2">
                  {book.subjects.slice(0, 8).map((subject, i) => (
                    <Link
                      key={i}
                      href={`/opac/kids/search?subject=${encodeURIComponent(subject)}`}
                      className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm 
                               hover:bg-purple-200 transition-colors"
                    >
                      {subject}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {book.format && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FormatIcon className="h-4 w-4 text-muted-foreground/70" />
                  <span>{book.format}</span>
                </div>
              )}
              {book.pageCount && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BookOpen className="h-4 w-4 text-muted-foreground/70" />
                  <span>{book.pageCount} pages</span>
                </div>
              )}
              {book.pubDate && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 text-muted-foreground/70" />
                  <span>{book.pubDate}</span>
                </div>
              )}
              {book.publisher && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-muted-foreground/70">Publisher:</span>
                  <span>{book.publisher}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Holdings by location */}
        {book.holdings.length > 0 && (
          <div className="border-t border-border/50 p-6 md:p-8">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-500" />
              Where to Find It
            </h3>
            <div className="space-y-3">
              {book.holdings.map((holding, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-xl"
                >
                  <div>
                    <p className="font-medium text-foreground">{holding.locationName}</p>
                    <p className="text-sm text-muted-foreground">{holding.callNumber}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium
                                ${holding.available > 0 
                                  ? "bg-green-100 text-green-700" 
                                  : "bg-orange-100 text-orange-700"
                                }`}>
                    {holding.available > 0 
                      ? t("holdingAvailable", { count: holding.available }) 
                      : t("checkedOut")
                    }
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Related books */}
      {relatedBooks.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            You Might Also Like
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {relatedBooks.map((related) => (
              <RelatedBookCard key={related.id} book={related} />
            ))}
          </div>
        </section>
      )}

      {/* Hold Modal */}
      {showHoldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-3xl max-w-md w-full p-6 shadow-2xl">
            {holdSuccess ? (
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                  <Check className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">{t("holdPlaced")}</h3>
                <p className="text-muted-foreground">{t("holdPlacedDesc")}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-foreground">{t("placeAHold")}</h3>
                  <button type="button"
                    onClick={() => setShowHoldModal(false)}
                    className="p-2 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/50 rounded-full"
                  >
                    <span className="sr-only">Close</span>
                    ✕
                  </button>
                </div>

                {!isLoggedIn ? (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground mb-4">{t("loginToPlaceHold")}</p>
                    <Link
                      href={`/opac/login?redirect=/opac/kids/record/${recordId}`}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 
                               text-white rounded-full font-bold"
                    >
                      Log In
                    </Link>
                  </div>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-4">
                      {t("choosePickup")} <strong>{book.title}</strong>:
                    </p>

                    {holdError ? (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        <div className="font-medium">{holdError.message}</div>
                        {holdError.nextSteps && holdError.nextSteps.length > 0 ? (
                          <div className="mt-2">
                            <div className="text-xs font-medium text-red-800/90">Next steps</div>
                            <ul className="mt-1 list-disc pl-5 space-y-1">
                              {holdError.nextSteps.map((step) => (
                                <li key={step} className="text-sm text-red-700">
                                  {step}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {holdError.code ? (
                          <div className="mt-2 text-[11px] text-red-800/80 font-mono">Code: {holdError.code}</div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2 mb-6">
                      {book.holdings.map((holding) => (
                        <button type="button"
                          key={holding.locationId}
                          onClick={() => handlePlaceHold(holding.locationId)}
                          disabled={holdLoading}
                          className="w-full p-4 text-left rounded-xl border-2 border-border 
                                   hover:border-purple-400 hover:bg-purple-50 transition-colors
                                   disabled:opacity-50"
                        >
                          <p className="font-medium text-foreground">{holding.locationName}</p>
                        </button>
                      ))}
                    </div>

                    {holdLoading && (
                      <div className="flex items-center justify-center gap-2 text-purple-600">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>{t("placingHold")}</span>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RelatedBookCard({ book }: { book: RelatedBook }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Link href={`/opac/kids/record/${book.id}`} className="group block">
      <div className="aspect-[2/3] relative rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-pink-100 
                    shadow-md group-hover:shadow-lg transition-all group-hover:-translate-y-1">
        {book.coverUrl && !imageError ? (
          <Image
            src={book.coverUrl}
            alt={book.title}
            fill
            sizes="200px"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="h-10 w-10 text-purple-300" />
          </div>
        )}
      </div>
      <div className="mt-2">
        <h4 className="font-medium text-foreground text-sm line-clamp-2 group-hover:text-purple-600">
          {book.title}
        </h4>
        {book.author && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
        )}
      </div>
    </Link>
  );
}
