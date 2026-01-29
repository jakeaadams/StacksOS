"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { 
  Book, 
  Headphones, 
  MonitorPlay, 
  Smartphone,
  CheckCircle,
  Clock,
  AlertCircle,
  Heart,
  Plus,
  Star,
} from "lucide-react";

export interface BookFormat {
  type: "book" | "ebook" | "audiobook" | "dvd" | "music" | "magazine";
  available: number;
  total: number;
  eContentUrl?: string;
}

export interface BookCardProps {
  id: number;
  title: string;
  author?: string;
  coverUrl?: string;
  isbn?: string;
  formats?: BookFormat[];
  rating?: number;
  reviewCount?: number;
  publicationYear?: number;
  summary?: string;
  subjects?: string[];
  // Availability
  availableNow?: boolean;
  totalCopies?: number;
  availableCopies?: number;
  holdCount?: number;
  // Display options
  variant?: "grid" | "list" | "compact";
  showFormats?: boolean;
  showRating?: boolean;
  showSummary?: boolean;
  isKidsMode?: boolean;
  fetchGoogleRating?: boolean;
  // Actions
  onAddToList?: () => void;
  onPlaceHold?: () => void;
}

const formatIcons: Record<string, React.ElementType> = {
  book: Book,
  ebook: Smartphone,
  audiobook: Headphones,
  dvd: MonitorPlay,
  music: MonitorPlay,
  magazine: Book,
};

const formatLabels: Record<string, string> = {
  book: "Book",
  ebook: "eBook",
  audiobook: "Audiobook",
  dvd: "DVD",
  music: "CD",
  magazine: "Magazine",
};

export function BookCard({
  id,
  title,
  author,
  coverUrl,
  isbn,
  formats = [],
  rating: propRating,
  reviewCount: propReviewCount,
  publicationYear,
  summary,
  availableNow = false,
  totalCopies = 0,
  availableCopies = 0,
  holdCount = 0,
  variant = "grid",
  showFormats = true,
  showRating = true,
  showSummary = false,
  isKidsMode = false,
  fetchGoogleRating = true,
  onAddToList,
  onPlaceHold,
}: BookCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [googleRating, setGoogleRating] = useState<{ rating: number; count: number } | null>(null);

  // Fetch Google Books rating if isbn provided and no rating passed
  useEffect(() => {
    if (!isbn || propRating || !fetchGoogleRating || !showRating) return;
    
    const cleanIsbn = isbn.replace(/-/g, "");
    if (cleanIsbn.length < 10) return;

    fetch(`/api/google-books?isbn=${cleanIsbn}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.averageRating) {
          setGoogleRating({
            rating: data.averageRating,
            count: data.ratingsCount || 0,
          });
        }
      })
      .catch(() => {});
  }, [isbn, propRating, fetchGoogleRating, showRating]);

  // Use prop rating if provided, otherwise Google rating
  const rating = propRating || googleRating?.rating;
  const reviewCount = propReviewCount || googleRating?.count;

  // Generate a placeholder color based on title
  const placeholderColor = `hsl(${(title.charCodeAt(0) * 137) % 360}, 60%, 75%)`;

  const AvailabilityBadge = () => {
    if (availableCopies > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 
                       text-xs font-medium rounded-full">
          <CheckCircle className="h-3 w-3" />
          Available
        </span>
      );
    }
    if (holdCount > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 
                       text-xs font-medium rounded-full">
          <Clock className="h-3 w-3" />
          {holdCount} {holdCount === 1 ? "hold" : "holds"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted/50 text-muted-foreground 
                     text-xs font-medium rounded-full">
        <AlertCircle className="h-3 w-3" />
        Checked out
      </span>
    );
  };

  const StarRating = () => {
    if (!rating) return null;
    const ratingText = `${rating.toFixed(1)} out of 5 stars${reviewCount ? `, ${reviewCount} reviews` : ""}`;
    return (
      <div className="flex items-center gap-1" role="img" aria-label={ratingText}>
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = rating >= star;
          const partial = !filled && rating > star - 1;
          return (
            <div key={star} className="relative">
              <Star className="h-4 w-4 text-muted-foreground/50" fill="currentColor" />
              {(filled || partial) && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: filled ? "100%" : `${(rating - (star - 1)) * 100}%` }}
                >
                  <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
                </div>
              )}
            </div>
          );
        })}
        <span className="text-xs text-muted-foreground font-medium ml-1">{rating.toFixed(1)}</span>
        {reviewCount && reviewCount > 0 && (
          <span className="text-xs text-muted-foreground/70">({reviewCount.toLocaleString()})</span>
        )}
      </div>
    );
  };

  // Grid variant (default)
  if (variant === "grid") {
    return (
      <div
        className={`group relative bg-card rounded-xl shadow-sm border border-border 
                   overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary-300
                   ${isKidsMode ? "rounded-2xl" : ""}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Link href={isKidsMode ? `/opac/kids/record/${id}` : `/opac/record/${id}`}>
          {/* Cover image */}
          <div className={`relative aspect-[2/3] bg-muted/50 overflow-hidden
                         ${isKidsMode ? "aspect-square" : ""}`}>
            {coverUrl && !imageError ? (
              <img
                src={coverUrl}
                alt={`Cover of ${title}`}
                className="w-full h-full object-cover transition-transform duration-300 
                         group-hover:scale-105"
                onError={() => setImageError(true)}
              />
            ) : (
              <div 
                className="w-full h-full flex items-center justify-center p-4"
                style={{ backgroundColor: placeholderColor }}
              >
                <div className="text-center text-white">
                  <Book className={`mx-auto mb-2 ${isKidsMode ? "h-12 w-12" : "h-8 w-8"}`} />
                  <p className={`font-medium leading-tight line-clamp-3
                               ${isKidsMode ? "text-lg" : "text-sm"}`}>
                    {title}
                  </p>
                </div>
              </div>
            )}

            {/* Availability badge overlay */}
            <div className="absolute top-2 left-2">
              <AvailabilityBadge />
            </div>

            {/* Quick actions on hover */}
            {isHovered && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2 
                            opacity-0 group-hover:opacity-100 transition-opacity">
                {onAddToList && (
                  <button type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onAddToList();
                    }}
                    className="p-2 bg-card rounded-full shadow-lg hover:bg-muted/50 transition-colors"
                    aria-label="Add to list"
                  >
                    <Heart className="h-5 w-5 text-foreground/80" />
                  </button>
                )}
                {onPlaceHold && (
                  <button type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onPlaceHold();
                    }}
                    className="p-2 bg-primary-600 rounded-full shadow-lg hover:bg-primary-700 
                             transition-colors"
                    aria-label="Place hold"
                  >
                    <Plus className="h-5 w-5 text-white" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className={`p-3 ${isKidsMode ? "p-4" : ""}`}>
            <h3 className={`font-semibold text-foreground line-clamp-2 leading-tight mb-1
                          ${isKidsMode ? "text-lg" : "text-sm"}`}>
              {title}
            </h3>
            {author && (
              <p className={`text-muted-foreground line-clamp-1 ${isKidsMode ? "text-base" : "text-xs"}`}>
                {author}
              </p>
            )}
            
            {showRating && (
              <div className="mt-2">
                <StarRating />
              </div>
            )}

            {showFormats && formats.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {formats.map((format) => {
                  const Icon = formatIcons[format.type] || Book;
                  return (
                    <span
                      key={format.type}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                                ${format.available > 0 
                                  ? "bg-green-50 text-green-700" 
                                  : "bg-muted/50 text-muted-foreground"}`}
                    >
                      <Icon className="h-3 w-3" />
                      {formatLabels[format.type]}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </Link>
      </div>
    );
  }

  // List variant
  if (variant === "list") {
    return (
      <div className="group flex gap-4 p-4 bg-card rounded-xl shadow-sm border border-border 
                     hover:shadow-md hover:border-primary-300 transition-all">
        <Link 
          href={isKidsMode ? `/opac/kids/record/${id}` : `/opac/record/${id}`}
          className="shrink-0"
        >
          <div className="relative w-24 h-36 bg-muted/50 rounded-lg overflow-hidden">
            {coverUrl && !imageError ? (
              <img
                src={coverUrl}
                alt={`Cover of ${title}`}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div 
                className="w-full h-full flex items-center justify-center p-2"
                style={{ backgroundColor: placeholderColor }}
              >
                <Book className="h-8 w-8 text-white" />
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <Link href={isKidsMode ? `/opac/kids/record/${id}` : `/opac/record/${id}`}>
            <h3 className="font-semibold text-foreground hover:text-primary-600 transition-colors 
                         line-clamp-2 text-lg">
              {title}
            </h3>
          </Link>
          
          {author && (
            <p className="text-muted-foreground mt-1">{author}</p>
          )}
          
          {publicationYear && (
            <p className="text-muted-foreground text-sm">{publicationYear}</p>
          )}

          {showRating && (
            <div className="mt-2">
              <StarRating />
            </div>
          )}

          {showSummary && summary && (
            <p className="text-muted-foreground text-sm mt-2 line-clamp-2">{summary}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <AvailabilityBadge />
            
            {showFormats && formats.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {formats.map((format) => {
                  const Icon = formatIcons[format.type] || Book;
                  return (
                    <span
                      key={format.type}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                                ${format.available > 0 
                                  ? "bg-green-50 text-green-700" 
                                  : "bg-muted/50 text-muted-foreground"}`}
                    >
                      <Icon className="h-3 w-3" />
                      {formatLabels[format.type]}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {onPlaceHold && (
            <button type="button"
              onClick={onPlaceHold}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 
                       transition-colors text-sm font-medium"
            >
              Place Hold
            </button>
          )}
          {onAddToList && (
            <button type="button"
              onClick={onAddToList}
              className="px-4 py-2 border border-border text-foreground/80 rounded-lg 
                       hover:bg-muted/30 transition-colors text-sm font-medium"
            >
              Add to List
            </button>
          )}
        </div>
      </div>
    );
  }

  // Compact variant
  return (
    <Link
      href={isKidsMode ? `/opac/kids/record/${id}` : `/opac/record/${id}`}
      className="flex items-center gap-3 p-2 hover:bg-muted/30 rounded-lg transition-colors"
    >
      <div className="relative w-12 h-16 bg-muted/50 rounded overflow-hidden shrink-0">
        {coverUrl && !imageError ? (
          <img
            src={coverUrl}
            alt={`Cover of ${title}`}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: placeholderColor }}
          >
            <Book className="h-4 w-4 text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-foreground text-sm line-clamp-1">{title}</h4>
        {author && (
          <p className="text-muted-foreground text-xs line-clamp-1">{author}</p>
        )}
        {showRating && rating && (
          <div className="flex items-center gap-1 mt-1">
            <Star className="h-3 w-3 text-amber-400" fill="currentColor" />
            <span className="text-xs text-muted-foreground">{rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <AvailabilityBadge />
    </Link>
  );
}

export default BookCard;
