"use client";
import { clientLogger } from "@/lib/client-logger";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLibrary } from "@/hooks/useLibrary";
import { usePatronSession } from "@/hooks/usePatronSession";
import { BookCard } from "@/components/opac/BookCard";
import { AddToListDialog } from "@/components/opac/AddToListDialog";
import { featureFlags } from "@/lib/feature-flags";
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
  return copies.map((copy: any) => ({
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
  const [holdError, setHoldError] = useState<{ message: string; nextSteps?: string[]; code?: string } | null>(null);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [googleRating, setGoogleRating] = useState<{ rating: number; count: number } | null>(null);
  const [similar, setSimilar] = useState<Array<{ id: number; title: string; author?: string; coverUrl?: string; reason?: string }>>([]);
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
      .then((data) => {
        if (data?.averageRating) {
          setGoogleRating({ rating: data.averageRating, count: data.ratingsCount || 0 });
        }
      })
	      .catch(() => {});
	  }, [record?.isbn, record?.rating]);

	  const fetchRecordDetail = useCallback(async () => {
	    try {
	      setIsLoading(true);
	      setError(null);

	      const response = await fetch(`/api/evergreen/catalog/${recordId}`, { credentials: "include" });
	      
	      if (!response.ok) {
	        if (response.status === 404) {
	          throw new Error("Record not found");
	        }
	        throw new Error("Failed to load record details");
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
	        availableCopies: data.copy_counts?.available || rec.copyCounts?.available || (data.copies?.filter((c: any) => c.status === 0 || c.status === 7)?.length) || 0,
	        holdCount: data.hold_count || rec.holdCount || 0,
	        rating: rec.rating,
	        reviewCount: rec.review_count,
	        reviews: rec.reviews || [],
	        relatedTitles: rec.related || [],
	        lexileLevel: rec.lexile,
	        arLevel: rec.ar_level,
	        awards: rec.awards || [],
	      };

	      setRecord(transformedRecord);
	    } catch (err) {
	      clientLogger.error("Error fetching record:", err);
	      setError(err instanceof Error ? err.message : "An error occurred");
	    } finally {
	      setIsLoading(false);
	    }
	  }, [recordId]);

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
          (Number.isFinite(storedId) && pickupLocations.some((l) => l.id === storedId) ? storedId : null) ??
          (featureFlags.opacHoldsUXV2 &&
          typeof patron?.defaultPickupLocation === "number" &&
          pickupLocations.some((l) => l.id === patron.defaultPickupLocation)
            ? patron.defaultPickupLocation
            : null) ??
          pickupLocations[0].id;

        setSelectedPickupLocation(preferred);
	    }
	  }, [library?.locations, patron?.defaultPickupLocation, selectedPickupLocation]);

  useEffect(() => {
    if (!record?.id) return;
    let cancelled = false;
    setSimilarLoading(true);
    void fetch(`/api/opac/recommendations?type=similar&bibId=${record.id}&limit=8`, { credentials: "include" })
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

  const placeholderColor = record 
    ? `hsl(${(record.title.charCodeAt(0) * 137) % 360}, 60%, 75%)`
    : "#e5e7eb";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {error || "Record not found"}
          </h2>
          <Link
            href="/opac"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Return to catalog
          </Link>
        </div>
      </div>
    );
	  }

	  const FormatIcon = formatIcons[record.format] || BookOpen;
	  const displayedCopies = showAllCopies ? record.copies : record.copies.slice(0, 5);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Back button */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <button type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to results
          </button>
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

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column - Cover and actions */}
          <div className="lg:col-span-1">
	            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
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
                  <div 
                    className="w-full h-full flex items-center justify-center p-8"
                    style={{ backgroundColor: placeholderColor }}
                  >
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
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 
                                   text-green-800 rounded-full font-medium">
                      <CheckCircle className="h-5 w-5" />
                      {record.availableCopies} of {record.totalCopies} available
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 
                                   text-amber-800 rounded-full font-medium">
                      <Clock className="h-5 w-5" />
                      {record.holdCount} holds on {record.totalCopies} copies
                    </span>
                  )}
                </div>

                {/* Place hold button */}
                <button type="button"
                  onClick={() => setShowHoldModal(true)}
                  disabled={holdSuccess}
                  className="w-full py-3 bg-primary-600 text-white rounded-lg font-medium
                           hover:bg-primary-700 transition-colors disabled:opacity-50 
                           disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                </button>

	                {/* Secondary actions */}
	                <div className="flex gap-2">
	                  {featureFlags.opacLists ? (
	                    <button
	                      type="button"
	                      onClick={handleSave}
	                      className="flex-1 py-2 border border-border rounded-lg text-foreground/80
	                                   hover:bg-muted/30 transition-colors flex items-center justify-center gap-2"
	                    >
	                      <Heart className="h-4 w-4" />
	                      Save
	                    </button>
	                  ) : null}
	                  <button
	                    type="button"
	                    onClick={() => void handleShare()}
	                    className="flex-1 py-2 border border-border rounded-lg text-foreground/80
	                                   hover:bg-muted/30 transition-colors flex items-center justify-center gap-2"
	                  >
	                    <Share2 className="h-4 w-4" />
	                    Share
	                  </button>
	                </div>
              </div>
            </div>

            {/* Reading level info */}
            {(record.lexileLevel || record.arLevel) && (
              <div className="mt-4 bg-card rounded-xl shadow-sm border border-border p-4">
                <h3 className="font-semibold text-foreground mb-3">Reading Level</h3>
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
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <FormatIcon className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                    {record.title}
                  </h1>
                  {record.author && (
                    <p className="text-lg text-muted-foreground mt-1">
                      by <Link href={`/opac/search?q=author:${encodeURIComponent(record.author)}`}
                             className="text-primary-600 hover:underline">{record.author}</Link>
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
                    {(record.rating || googleRating?.rating || 0).toFixed(1)} ({(record.reviewCount || googleRating?.count || 0).toLocaleString()} reviews)
                  </span>
                </div>
              )}

              {/* Metadata grid */}
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                {record.publisher && (
                  <div className="flex items-start gap-2">
                    <Building className="h-4 w-4 text-muted-foreground/70 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground">Publisher</span>
                      <p className="text-foreground">{record.publisher}</p>
                    </div>
                  </div>
                )}
                {record.publicationDate && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground/70 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground">Publication Date</span>
                      <p className="text-foreground">{record.publicationDate}</p>
                    </div>
                  </div>
                )}
                {record.isbn && (
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground/70 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground">ISBN</span>
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
                    Part of the <Link href={`/opac/search?q=series:${encodeURIComponent(record.series)}`}
                                     className="font-medium hover:underline">{record.series}</Link> series
                    {record.seriesNumber && ` (#${record.seriesNumber})`}
                  </p>
                </div>
              )}
            </div>

            {/* Summary */}
            {record.summary && (
              <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">Summary</h2>
                <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
                  {record.summary}
                </p>
              </div>
            )}

            {/* Subjects */}
            {record.subjects && record.subjects.length > 0 && (
              <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">Subjects</h2>
                <div className="flex flex-wrap gap-2">
                  {record.subjects.map((subject, i) => (
                    <Link
                      key={i}
                      href={`/opac/search?q=subject:${encodeURIComponent(subject)}`}
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
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Availability ({record.availableCopies} of {record.totalCopies} available)
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-medium text-muted-foreground">Location</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Call Number</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedCopies.map((copy) => (
                      <tr key={copy.id} className="border-b border-border/50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground/70" />
                            {copy.location}
                          </div>
                        </td>
                        <td className="py-3 font-mono text-xs">{copy.callNumber}</td>
                        <td className="py-3">
                          {copy.statusCode === 0 ? (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <CheckCircle className="h-4 w-4" />
                              Available
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
                <button type="button"
                  onClick={() => setShowAllCopies(!showAllCopies)}
                  className="mt-4 text-primary-600 hover:text-primary-700 font-medium 
                           flex items-center gap-1"
                >
                  {showAllCopies ? (
                    <>Show less <ChevronUp className="h-4 w-4" /></>
                  ) : (
                    <>Show all {record.copies.length} copies <ChevronDown className="h-4 w-4" /></>
                  )}
                </button>
              )}
            </div>

            {/* Related titles */}
            {record.relatedTitles && record.relatedTitles.length > 0 && (
              <div className="bg-card rounded-xl shadow-sm border border-border p-6">
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
              <div className="bg-card rounded-xl shadow-sm border border-border p-6">
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
                        <div className="text-xs text-muted-foreground line-clamp-2">{rec.reason}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hold modal */}
      {showHoldModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-foreground mb-4">Place Hold</h3>
            
            <div className="mb-4">
              <p className="text-muted-foreground mb-2">
                <strong>{record.title}</strong>
                {record.author && <> by {record.author}</>}
              </p>
              {record.availableCopies === 0 && (
                <p className="text-amber-600 text-sm">
                  All copies are currently checked out. You will be #{record.holdCount + 1} in the queue.
                </p>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground/80 mb-2">
                Pickup Location
              </label>
              <select
                value={selectedPickupLocation || ""}
                onChange={(e) => setSelectedPickupLocation(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none 
                         focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select a location...</option>
                {library?.locations
                  .filter(l => l.isPickupLocation)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </div>

	            {holdError ? (
	              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
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

            <div className="flex gap-3">
              <button type="button"
                onClick={() => {
                  setShowHoldModal(false);
                  setHoldError(null);
                }}
                className="flex-1 py-2 border border-border rounded-lg text-foreground/80 
                         hover:bg-muted/30 transition-colors"
              >
                Cancel
              </button>
              <button type="button"
                onClick={handlePlaceHold}
                disabled={isPlacingHold || !selectedPickupLocation}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium
                         hover:bg-primary-700 transition-colors disabled:opacity-50 
                         disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPlacingHold ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Confirm Hold"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
