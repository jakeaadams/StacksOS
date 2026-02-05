"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";

interface BookRatingProps {
  isbn?: string | null;
  showCount?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

interface GoogleBookData {
  averageRating: number | null;
  ratingsCount: number | null;
}

export function BookRating({
  isbn,
  showCount = true,
  size = "md",
  className = "",
}: BookRatingProps) {
  const [data, setData] = useState<GoogleBookData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isbn) return;

    const cleanIsbn = isbn.replace(/-/g, "");
    if (cleanIsbn.length < 10) return;

    setLoading(true);
    fetch(`/api/google-books?isbn=${cleanIsbn}`)
      .then((res) => res.json())
      .then((result) => {
        const data = result?.ok ? result.data : null;
        if (data && typeof data.averageRating === "number" && data.averageRating > 0) {
          setData(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isbn]);

  if (!isbn || loading || !data?.averageRating) {
    return null;
  }

  const rating = data.averageRating;
  const count = data.ratingsCount;

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const starSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <div className={`flex items-center gap-1 ${sizeClasses[size]} ${className}`}>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = rating >= star;
          const partial = !filled && rating > star - 1;
          
          return (
            <div key={star} className="relative">
              <Star
                className={`${starSizes[size]} text-muted-foreground/50`}
                fill="currentColor"
              />
              {(filled || partial) && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: filled ? "100%" : `${(rating - (star - 1)) * 100}%` }}
                >
                  <Star
                    className={`${starSizes[size]} text-amber-400`}
                    fill="currentColor"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-muted-foreground font-medium">{rating.toFixed(1)}</span>
      {showCount && count && (
        <span className="text-muted-foreground/70">({count.toLocaleString()})</span>
      )}
    </div>
  );
}

// Hook for batch loading ratings (for search results)
export function useBookRatings(isbns: string[]) {
  const [ratings, setRatings] = useState<Record<string, GoogleBookData | null>>({});
  const [loading, setLoading] = useState(false);

  const isbnsKey = useMemo(() => {
    return isbns
      .filter(Boolean)
      .map((i) => i.replace(/-/g, ""))
      .filter((i) => i.length >= 10)
      .join(",");
  }, [isbns]);

  useEffect(() => {
    if (!isbnsKey) return;

    setLoading(true);
    fetch(`/api/google-books?isbns=${encodeURIComponent(isbnsKey)}`)
      .then((res) => res.json())
      .then((result) => {
        const results = result?.ok ? result.results : null;
        if (results && typeof results === "object") {
          setRatings(results);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isbnsKey]);

  return { ratings, loading };
}

// Compact rating display for search results
export function CompactRating({ 
  rating, 
  count,
  size = "sm" 
}: { 
  rating: number | null; 
  count?: number | null;
  size?: "sm" | "md";
}) {
  if (!rating) return null;

  const starSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div className={`flex items-center gap-1 ${textSize}`}>
      <Star className={`${starSize} text-amber-400`} fill="currentColor" />
      <span className="text-muted-foreground">{rating.toFixed(1)}</span>
      {count && <span className="text-muted-foreground/70">({count.toLocaleString()})</span>}
    </div>
  );
}
