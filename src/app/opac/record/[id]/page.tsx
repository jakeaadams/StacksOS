"use client";
import { clientLogger } from "@/lib/client-logger";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLibrary } from "@/hooks/use-library";
import { usePatronSession } from "@/hooks/use-patron-session";
import { BookCard } from "@/components/opac/book-card";
import { AddToListDialog } from "@/components/opac/add-to-list-dialog";
import { featureFlags } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BookOpen,
  Headphones,
  Smartphone,
  MonitorPlay,
  MapPin,
  Calendar,
  Building,
  CheckCircle,
  Clock,
  AlertCircle,
  Share2,
  ChevronDown,
  ChevronUp,
  Star,
  ArrowLeft,
  Loader2,
  Plus,
  Check,
  Heart,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface CopyInfo {
  id: number;
  barcode: string;
  location: string;
  locationId: number;
  callNumber: string;
  status: string;
  statusCode: number;
  dueDate?: string;
  holdable: boolean;
}

function getStatusName(statusCode: number): string {
  const statuses: Record<number, string> = {
    0: "Available",
    1: "Checked Out",
    2: "Bindery",
    3: "Lost",
    4: "Missing",
    5: "In Process",
    6: "In Transit",
    7: "Reshelving",
    8: "On Holds Shelf",
    9: "On Order",
    10: "ILL",
    11: "Cataloging",
    12: "Reserves",
    13: "Discard/Weed",
    14: "Damaged",
  };
  return statuses[statusCode] || "Unknown";
}

function transformCopies(copies: any[]): CopyInfo[] {
  return copies.map((copy) => ({
    id: copy.id,
    barcode: copy.barcode,
    location: copy.location_name || copy.circ_lib_name || "Unknown",
    locationId: copy.circ_lib || copy.location_id,
    callNumber: copy.call_number || copy.label || "",
    status: copy.status_name || getStatusName(copy.status),
    statusCode: copy.status,
    dueDate: copy.due_date,
    holdable: copy.holdable !== false,
  }));
}

interface RecordDetail {
  id: number;
  title: string;
  author?: string;
  contributors?: string[];
  coverUrl?: string;
  summary?: string;
  subjects?: string[];
  isbn?: string;
  publisher?: string;
  publicationDate?: string;
  edition?: string;
  physicalDescription?: string;
  language?: string;
  series?: string;
  seriesNumber?: number;
  format: string;
  copies: CopyInfo[];
  totalCopies: number;
  availableCopies: number;
  holdCount: number;
  // Enhanced StacksOS features
  rating?: number;
  reviewCount?: number;
  reviews?: { author: string; rating: number; text: string; date: string }[];
  relatedTitles?: { id: number; title: string; author: string; coverUrl?: string }[];
  lexileLevel?: string;
  arLevel?: string;
  awards?: string[];
}

const formatIcons: Record<string, React.ElementType> = {
  book: BookOpen,
  ebook: Smartphone,
  audiobook: Headphones,
  dvd: MonitorPlay,
};

export default function RecordDetailPage() {
  const t = useTranslations("recordPage");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { library } = useLibrary();
  const { patron, isLoggedIn, placeHold } = usePatronSession();

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllCopies, setShowAllCopies] = useState(false);
  const [selectedPickupLocation, setSelectedPickupLocation] = useState<number | null>(null);
  const [isPlacingHold, setIsPlacingHold] = useState(false);
  const [holdSuccess, setHoldSuccess] = useState(false);
  const [holdError, setHoldError] = useState<{
    message: string;
    nextSteps?: string[];
    code?: string;
  } | null>(null);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [googleRating, setGoogleRating] = useState<{ rating: number; count: number } | null>(null);
  const [similar, setSimilar] = useState<
    Array<{ id: number; title: string; author?: string; coverUrl?: string; reason?: string }>
  >([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  const recordId = params.id as string;
  const requestedHold = searchParams.get("hold") === "1";

  useEffect(() => {
    if (!requestedHold) return;
    setShowHoldModal(true);
  }, [requestedHold]);

  // Fetch Google Books rating if available
  useEffect(() => {
    if (!record?.isbn || record?.rating) return;
    const cleanIsbn = record.isbn.replace(/-/g, "");
    if (cleanIsbn.length < 10) return;
    fetch(`/api/google-books?isbn=${cleanIsbn}`)
      .then((res) => res.json())
      .then((result) => {
        const data = result?.ok ? result.data : null;
        if (data && typeof data.averageRating === "number" && data.averageRating > 0) {
          setGoogleRating({ rating: data.averageRating, count: data.ratingsCount || 0 });
        }
      })
      .catch((error) => {
        clientLogger.warn("OPAC record rating lookup failed", error);
      });
  }, [record?.isbn, record?.rating]);

  const fetchRecordDetail = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const scopeParams = new URLSearchParams();
      const scope = searchParams.get("search_scope");
      const depth = searchParams.get("copy_depth");
      const scopeOrg = searchParams.get("scope_org");
      if (scope) scopeParams.set("search_scope", scope);
      if (depth) scopeParams.set("copy_depth", depth);
      if (scopeOrg) scopeParams.set("scope_org", scopeOrg);

      const response = await fetch(
        scopeParams.size > 0
          ? `/api/evergreen/catalog/${recordId}?${scopeParams.toString()}`
          : `/api/evergreen/catalog/${recordId}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(t("recordNotFound"));
        }
        throw new Error(t("errorLoading"));
      }

      const data = await response.json();

      // API returns record nested under 'record' key
      const rec = data.record || data;

      // Transform the data
      const transformedRecord: RecordDetail = {
        id: rec.id || parseInt(recordId),
        title: rec.title || rec.simple_record?.title || "Unknown Title",
        author: rec.author || rec.simple_record?.author,
        contributors: rec.contributors || [],
        coverUrl: getCoverUrl(rec),
        summary: rec.summary || rec.simple_record?.abstract,
        subjects: rec.subjects || [],
        isbn: rec.isbn || rec.simple_record?.isbn,
        publisher: rec.publisher || rec.simple_record?.publisher,
        publicationDate: rec.pubdate || rec.simple_record?.pubdate,
        edition: rec.edition,
        physicalDescription: rec.physical_description || rec.physicalDescription,
        language: rec.language,
        series: rec.series,
        seriesNumber: rec.series_number,
        format: rec.format || "book",
        copies: transformCopies(data.copies || rec.copies || data.holdings || []),
        totalCopies: data.copy_counts?.total || rec.copyCounts?.total || data.copies?.length || 0,
        availableCopies:
          data.copy_counts?.available ||
          rec.copyCounts?.available ||
          data.copies?.filter((c: any) => c.status === 0 || c.status === 7)?.length ||
          0,
        holdCount: data.hold_count || rec.holdCount || 0,
        rating: rec.rating,
        reviewCount: rec.review_count,
        reviews: rec.reviews || [],
        relatedTitles: rec.related || [],
        lexileLevel: rec.lexile,
        arLevel: rec.ar_level,
        awards: rec.awards || [],
      };

      try {
        const coverRes = await fetch(
          `/api/save-cover?recordId=${encodeURIComponent(String(transformedRecord.id))}`,
          { cache: "no-store" }
        );
        if (coverRes.ok) {
          const coverData = await coverRes.json();
          if (coverData?.success && typeof coverData.coverUrl === "string") {
            transformedRecord.coverUrl = coverData.coverUrl;
          }
        }
      } catch (coverError) {
        clientLogger.warn("Failed to load custom cover for OPAC record", coverError);
      }

      setRecord(transformedRecord);
    } catch (err) {
      clientLogger.error("Error fetching record:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [recordId, searchParams, t]);

  useEffect(() => {
    void fetchRecordDetail();
  }, [fetchRecordDetail]);

  const handleShare = useCallback(async () => {
    if (!record?.id) return;
    const url = `${window.location.origin}/opac/record/${record.id}`;
    const text = record.title || "Library item";

    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url });
        toast.success("Shared");
        return;
      }
    } catch {
      // Fall back to clipboard.
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }, [record?.id, record?.title]);

  const handleSave = useCallback(() => {
    if (!record?.id) return;
    if (!featureFlags.opacLists) return;
    if (!isLoggedIn) {
      router.push(`/opac/login?redirect=${encodeURIComponent(`/opac/record/${record.id}`)}`);
      return;
    }
    setSaveOpen(true);
  }, [isLoggedIn, record?.id, router]);

  useEffect(() => {
    if (selectedPickupLocation) return;
    const locations = library?.locations;
    if (!locations || locations.length === 0) return;
    const pickupLocations = locations.filter((l) => l.isPickupLocation);
    if (pickupLocations.length > 0) {
      const storedRaw = featureFlags.opacHoldsUXV2
        ? (() => {
            try {
              return localStorage.getItem("stacksos:last_pickup_location");
            } catch {
              return null;
            }
          })()
        : null;
      const storedId = storedRaw ? parseInt(storedRaw, 10) : null;
      const preferred =
        (Number.isFinite(storedId) && pickupLocations.some((l) => l.id === storedId)
          ? storedId
          : null) ??
        (featureFlags.opacHoldsUXV2 &&
        typeof patron?.defaultPickupLocation === "number" &&
        pickupLocations.some((l) => l.id === patron.defaultPickupLocation)
          ? patron.defaultPickupLocation
          : null) ??
        pickupLocations[0]!.id;

      setSelectedPickupLocation(preferred);
    }
  }, [library?.locations, patron?.defaultPickupLocation, selectedPickupLocation]);

  useEffect(() => {
    if (!record?.id) return;
    let cancelled = false;
    setSimilarLoading(true);
    void fetch(`/api/opac/recommendations?type=similar&bibId=${record.id}&limit=8`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const recs = Array.isArray(data?.recommendations) ? data.recommendations : [];
        setSimilar(
          recs
            .filter((r: any) => r && typeof r.id === "number")
            .map((r: any) => ({
              id: r.id,
              title: r.title || "Untitled",
              author: r.author || undefined,
              coverUrl: r.coverUrl || undefined,
              reason: r.reason || undefined,
            }))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSimilar([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSimilarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [record?.id]);

  const getCoverUrl = (data: any): string | undefined => {
    const isbn = data.isbn || data.simple_record?.isbn;
    if (isbn) {
      return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    }
    return undefined;
  };

  const handlePlaceHold = async () => {
    if (!isLoggedIn) {
      router.push(`/opac/login?redirect=/opac/record/${recordId}`);
      return;
    }

    if (!selectedPickupLocation) {
      setHoldError({ message: "Please select a pickup location." });
      return;
    }

    setIsPlacingHold(true);
    setHoldError(null);

    try {
      const result = await placeHold(parseInt(recordId), selectedPickupLocation);

      if (result.success) {
        setHoldSuccess(true);
        setShowHoldModal(false);
        setTimeout(() => setHoldSuccess(false), 5000);
      } else {
        setHoldError({
          message: result.message,
          nextSteps: result.details?.nextSteps,
          code: result.details?.code,
        });
      }
    } catch {
      setHoldError({ message: "Failed to place hold. Please try again." });
    } finally {
      setIsPlacingHold(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen app-shell flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen app-shell flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {error || t("recordNotFound")}
          </h2>
          <Link href="/opac" className="text-primary-600 hover:text-primary-700 font-medium">
            Return to catalog
          </Link>
        </div>
      </div>
    );
  }

  const FormatIcon = formatIcons[record.format] || BookOpen;
  const displayedCopies = showAllCopies ? record.copies : record.copies.slice(0, 5);

  return (
    <div className="min-h-screen app-shell">
      {/* Back button */}
      <div className="border-b border-border/70 bg-card/86 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            className="flex items-center gap-2 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to results
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {featureFlags.opacLists ? (
          <AddToListDialog
            open={saveOpen}
            onOpenChange={setSaveOpen}
            bibId={record.id}
            title={record.title}
          />
        ) : null}
        {/* Success message */}
        {holdSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-green-800 font-medium">Hold placed successfully!</p>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-7">
          {/* Left column - Cover and actions */}
          <div className="lg:col-span-1 lg:sticky lg:top-24 self-start">
            <div className="stx-surface rounded-xl overflow-hidden">
              {/* Cover image */}
              <div className="aspect-[2/3] bg-muted/50 relative">
                {record.coverUrl && !imageError ? (
                  <Image
                    src={record.coverUrl}
                    alt={`Cover of ${record.title}`}
                    fill
                    sizes="320px"
                    className="object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-300 via-primary-400 to-primary-500 p-8">
                    <div className="text-center text-white">
                      <FormatIcon className="h-16 w-16 mx-auto mb-4" />
                      <p className="font-semibold text-lg">{record.title}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 space-y-3">
                {/* Availability badge */}
                <div className="flex items-center justify-center">
                  {record.availableCopies > 0 ? (
                    <span
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 border border-green-300/70
                                   text-green-800 rounded-full font-medium"
                    >
                      <CheckCircle className="h-5 w-5" />
                      {record.availableCopies} of {record.totalCopies} available
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 border border-amber-300/70
                                   text-amber-800 rounded-full font-medium"
                    >
                      <Clock className="h-5 w-5" />
                      {record.holdCount} holds on {record.totalCopies} copies
                    </span>
                  )}
                </div>

                {/* Place hold button */}
                <Button
                  type="button"
                  onClick={() => setShowHoldModal(true)}
                  disabled={holdSuccess}
                  className="w-full bg-[linear-gradient(125deg,hsl(var(--brand-1))_0%,hsl(var(--brand-3))_88%)] text-white
                           hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {holdSuccess ? (
                    <>
                      <Check className="h-5 w-5" />
                      Hold Placed
                    </>
                  ) : (
                    <>
                      <Plus className="h-5 w-5" />
                      Place Hold
                    </>
                  )}
                </Button>

                {/* Secondary actions */}
                <div className="flex gap-2">
                  {featureFlags.opacLists ? (
                    <Button
                      type="button"
                      onClick={handleSave}
                      variant="outline"
                      className="flex-1 text-foreground/80 hover:bg-muted/30 flex items-center justify-center gap-2"
                    >
                      <Heart className="h-4 w-4" />
                      Save
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => void handleShare()}
                    variant="outline"
                    className="flex-1 text-foreground/80 hover:bg-muted/30 flex items-center justify-center gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>
            </div>

            {/* Reading level info */}
            {(record.lexileLevel || record.arLevel) && (
              <div className="mt-4 stx-surface rounded-xl p-4">
                <h3 className="font-semibold text-foreground mb-3">{t("readingLevel")}</h3>
                <div className="space-y-2">
                  {record.lexileLevel && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lexile</span>
                      <span className="font-medium">{record.lexileLevel}</span>
                    </div>
                  )}
                  {record.arLevel && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">AR Level</span>
                      <span className="font-medium">{record.arLevel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title and basic info */}
            <div className="stx-surface rounded-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <FormatIcon className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">{record.title}</h1>
                  {record.author && (
                    <p className="text-lg text-muted-foreground mt-1">
                      by{" "}
                      <Link
                        href={`/opac/search?q=${encodeURIComponent(record.author)}&type=author`}
                        className="text-primary-600 hover:underline"
                      >
                        {record.author}
                      </Link>
                    </p>
                  )}
                </div>
              </div>

              {/* Rating */}
              {(record.rating || googleRating?.rating) && (
                <div className="flex items-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 ${star <= (record.rating || googleRating?.rating)! ? "text-yellow-400 fill-current" : "text-muted-foreground/50"}`}
                    />
                  ))}
                  <span className="text-muted-foreground">
                    {(record.rating || googleRating?.rating || 0).toFixed(1)} (
                    {(record.reviewCount || googleRating?.count || 0).toLocaleString()} reviews)
                  </span>
                </div>
              )}

              {/* Metadata grid */}
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                {record.publisher && (
                  <div className="flex items-start gap-2">
                    <Building className="h-4 w-4 text-muted-foreground/70 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground">{t("publisher")}</span>
                      <p className="text-foreground">{record.publisher}</p>
                    </div>
                  </div>
                )}
                {record.publicationDate && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground/70 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground">{t("publicationDate")}</span>
                      <p className="text-foreground">{record.publicationDate}</p>
                    </div>
                  </div>
                )}
                {record.isbn && (
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground/70 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground">{t("isbn")}</span>
                      <p className="text-foreground">{record.isbn}</p>
                    </div>
                  </div>
                )}
                {record.physicalDescription && (
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground/70 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground">Description</span>
                      <p className="text-foreground">{record.physicalDescription}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Series info */}
              {record.series && (
                <div className="mt-4 p-3 bg-primary-50 rounded-lg">
                  <p className="text-primary-800">
                    Part of the{" "}
                    <Link
                      href={`/opac/search?q=${encodeURIComponent(record.series)}&type=series`}
                      className="font-medium hover:underline"
                    >
                      {record.series}
                    </Link>{" "}
                    series
                    {record.seriesNumber && ` (#${record.seriesNumber})`}
                  </p>
                </div>
              )}
            </div>

            {/* Summary */}
            {record.summary && (
              <div className="stx-surface rounded-xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">Summary</h2>
                <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
                  {record.summary}
                </p>
              </div>
            )}

            {/* Subjects */}
            {record.subjects && record.subjects.length > 0 && (
              <div className="stx-surface rounded-xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">{t("subjects")}</h2>
                <div className="flex flex-wrap gap-2">
                  {record.subjects.map((subject, i) => (
                    <Link
                      key={i}
                      href={`/opac/search?q=${encodeURIComponent(subject)}&type=subject`}
                      className="px-3 py-1 bg-muted/50 hover:bg-muted rounded-full text-sm 
                               text-foreground/80 transition-colors"
                    >
                      {subject}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Copy availability */}
            <div className="stx-surface rounded-xl p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Availability ({record.availableCopies} of {record.totalCopies} available)
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/80">
                      <th scope="col" className="text-left py-2 font-medium text-muted-foreground">
                        {t("location")}
                      </th>
                      <th scope="col" className="text-left py-2 font-medium text-muted-foreground">
                        Call Number
                      </th>
                      <th scope="col" className="text-left py-2 font-medium text-muted-foreground">
                        {t("status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedCopies.map((copy) => (
                      <tr key={copy.id} className="border-b border-border/50 hover:bg-muted/25">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground/70" />
                            {copy.location}
                          </div>
                        </td>
                        <td className="py-3 font-mono text-xs">{copy.callNumber}</td>
                        <td className="py-3">
                          {copy.statusCode === 0 || copy.statusCode === 7 ? (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <CheckCircle className="h-4 w-4" />
                              {copy.statusCode === 7 ? "Available (Reshelving)" : "Available"}
                            </span>
                          ) : copy.statusCode === 1 ? (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <Clock className="h-4 w-4" />
                              Due {copy.dueDate || "Unknown"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{copy.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {record.copies.length > 5 && (
                <Button
                  type="button"
                  onClick={() => setShowAllCopies(!showAllCopies)}
                  variant="ghost"
                  className="mt-4 flex items-center gap-1 px-0 font-medium text-primary-600 hover:bg-transparent hover:text-primary-700"
                >
                  {showAllCopies ? (
                    <>
                      Show less <ChevronUp className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Show all {record.copies.length} copies <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Related titles */}
            {record.relatedTitles && record.relatedTitles.length > 0 && (
              <div className="stx-surface rounded-xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">You May Also Like</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {record.relatedTitles.slice(0, 4).map((related) => (
                    <BookCard
                      key={related.id}
                      id={related.id}
                      title={related.title}
                      author={related.author}
                      coverUrl={related.coverUrl}
                      variant="grid"
                      showFormats={false}
                      showRating={false}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* More like this (metadata-only) */}
            {!similarLoading && similar.length > 0 && (
              <div className="stx-surface rounded-xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">More Like This</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {similar.slice(0, 8).map((rec) => (
                    <div key={rec.id} className="space-y-2">
                      <BookCard
                        id={rec.id}
                        title={rec.title}
                        author={rec.author}
                        coverUrl={rec.coverUrl}
                        variant="grid"
                        showFormats={false}
                        showRating={false}
                      />
                      {rec.reason ? (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {rec.reason}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Write a Review */}
            <ReviewForm recordId={record.id} isLoggedIn={isLoggedIn} />
          </div>
        </div>
      </div>

      {/* Hold modal */}
      <Dialog
        open={showHoldModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowHoldModal(false);
            setHoldError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Place Hold</DialogTitle>
            <DialogDescription>
              <strong>{record.title}</strong>
              {record.author && <> by {record.author}</>}
            </DialogDescription>
          </DialogHeader>

          {record.availableCopies === 0 && (
            <p className="text-amber-600 text-sm">
              All copies are currently checked out. You will be #{record.holdCount + 1} in the
              queue.
            </p>
          )}

          <div>
            <label
              htmlFor="pickup-location"
              className="block text-sm font-medium text-foreground/80 mb-2"
            >
              Pickup Location
            </label>
            <Select
              value={selectedPickupLocation ? String(selectedPickupLocation) : "none"}
              onValueChange={(value) =>
                setSelectedPickupLocation(value === "none" ? null : parseInt(value, 10))
              }
            >
              <SelectTrigger id="pickup-location" className="w-full">
                <SelectValue placeholder="Select a location..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a location...</SelectItem>
                {library?.locations
                  .filter((l) => l.isPickupLocation)
                  .map((location) => (
                    <SelectItem key={location.id} value={String(location.id)}>
                      {location.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {holdError ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
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
                <div className="mt-2 text-[11px] text-red-800/80 font-mono">
                  Code: {holdError.code}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="text-foreground/80 hover:bg-muted/30"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handlePlaceHold}
              disabled={isPlacingHold || !selectedPickupLocation}
              className="bg-[linear-gradient(125deg,hsl(var(--brand-1))_0%,hsl(var(--brand-3))_88%)] text-white
                       hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPlacingHold ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Hold"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Inline review form for patrons */
function ReviewForm({ recordId, isLoggedIn }: { recordId: number; isLoggedIn: boolean }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isLoggedIn) {
    return (
      <div className="stx-surface rounded-xl p-6 text-center">
        <h2 className="text-lg font-semibold text-foreground mb-2">Write a Review</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Log in to share your thoughts about this title.
        </p>
        <Link
          href={`/opac/login?redirect=${encodeURIComponent(`/opac/record/${recordId}`)}`}
          className="inline-flex items-center gap-2 rounded-lg bg-[linear-gradient(125deg,hsl(var(--brand-1))_0%,hsl(var(--brand-3))_88%)] px-4 py-2 text-white hover:brightness-110 text-sm font-medium"
        >
          Log in to review
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="stx-surface rounded-xl p-6 text-center">
        <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
        <h2 className="text-lg font-semibold text-foreground mb-1">Thank you!</h2>
        <p className="text-muted-foreground text-sm">Your review has been submitted.</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (rating === 0 || !text.trim()) {
      toast.error("Please provide a rating and review text");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/opac/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bibId: recordId, rating, text: text.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok !== false) {
        setSubmitted(true);
        toast.success("Review submitted!");
      } else {
        toast.error(data?.error || "Failed to submit review");
      }
    } catch {
      toast.error("Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="stx-surface rounded-xl p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Write a Review</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-2">Your Rating</label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 rounded"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
              >
                <Star
                  className={`h-7 w-7 transition-colors ${
                    star <= (hoverRating || rating)
                      ? "text-yellow-400 fill-current"
                      : "text-muted-foreground/30"
                  }`}
                />
              </button>
            ))}
            {rating > 0 && <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>}
          </div>
        </div>

        <div>
          <label
            htmlFor="review-text"
            className="block text-sm font-medium text-foreground/80 mb-2"
          >
            Your Review
          </label>
          <textarea
            id="review-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What did you think of this title?"
            rows={4}
            maxLength={2000}
            className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          <div className="text-xs text-muted-foreground text-right mt-1">{text.length}/2000</div>
        </div>

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || rating === 0 || !text.trim()}
          className="bg-[linear-gradient(125deg,hsl(var(--brand-1))_0%,hsl(var(--brand-3))_88%)] text-white hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            "Submit Review"
          )}
        </Button>
      </div>
    </div>
  );
}
