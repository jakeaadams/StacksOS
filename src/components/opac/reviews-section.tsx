"use client";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";
import Link from "next/link";

import { useCallback, useEffect, useState } from "react";
import { usePatronSession } from "@/hooks/use-patron-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Star,
  ThumbsUp,
  MessageSquare,
  Edit3,
  CheckCircle,
  User,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface Review {
  id: number;
  bibId: number;
  patronId: number;
  patronName: string;
  rating: number;
  title?: string;
  text?: string;
  createdAt: string;
  updatedAt: string;
  helpful: number;
  verified: boolean;
}

interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

interface ReviewsSectionProps {
  bibId: number;
  title: string;
}

export function ReviewsSection({ bibId, title }: ReviewsSectionProps) {
  const { isLoggedIn } = usePatronSession();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWriteReview, setShowWriteReview] = useState(false);
  const [sort, setSort] = useState<"recent" | "helpful" | "rating">("recent");
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set());

  // Form state
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/opac/reviews?bibId=${bibId}&sort=${sort}`);
      if (response.ok) {
        const data = await response.json();
        setReviews(data.reviews || []);
        setStats(data.stats);
      }
    } catch (err) {
      clientLogger.error("Error fetching reviews:", err);
    } finally {
      setIsLoading(false);
    }
  }, [bibId, sort]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setSubmitError("Please select a rating");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetchWithAuth("/api/opac/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bibId,
          rating,
          title: reviewTitle,
          text: reviewText,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit review");
      }

      setSubmitSuccess(true);
      setShowWriteReview(false);
      setRating(0);
      setReviewTitle("");
      setReviewText("");
      fetchReviews();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHelpful = async (reviewId: number) => {
    // In production, this would update the helpful count in the database
    setReviews((prev) =>
      prev.map((r) => (r.id === reviewId ? { ...r, helpful: r.helpful + 1 } : r))
    );
  };

  const StarRating = ({
    value,
    onChange,
    readonly = false,
    size = "md",
  }: {
    value: number;
    onChange?: (v: number) => void;
    readonly?: boolean;
    size?: "sm" | "md" | "lg";
  }) => {
    const sizeClasses = {
      sm: "h-4 w-4",
      md: "h-5 w-5",
      lg: "h-6 w-6",
    };

    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Button
            type="button"
            key={star}
            disabled={readonly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readonly && setHoverRating(star)}
            onMouseLeave={() => !readonly && setHoverRating(0)}
            className={
              readonly
                ? "h-auto w-auto p-0 hover:bg-transparent"
                : "h-auto w-auto p-0 transition-transform hover:scale-110 hover:bg-transparent"
            }
            variant="ghost"
          >
            <Star
              className={`${sizeClasses[size]} ${
                star <= (hoverRating || value)
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/50"
              }`}
            />
          </Button>
        ))}
      </div>
    );
  };

  const RatingBar = ({
    rating,
    count,
    total,
  }: {
    rating: number;
    count: number;
    total: number;
  }) => {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="w-3 text-muted-foreground">{rating}</span>
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        <Progress className="h-2 flex-1" value={percentage} />
        <span className="w-8 text-muted-foreground text-right">{count}</span>
      </div>
    );
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary-600" />
        Reviews & Ratings
      </h2>

      {/* Stats summary */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Average rating */}
          <div className="text-center md:text-left">
            <div className="text-5xl font-bold text-foreground">
              {stats?.averageRating.toFixed(1) || "—"}
            </div>
            <div className="mt-2">
              <StarRating value={Math.round(stats?.averageRating || 0)} readonly size="lg" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {stats?.totalReviews || 0} {stats?.totalReviews === 1 ? "review" : "reviews"}
            </p>
          </div>

          {/* Rating distribution */}
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((r) => (
              <RatingBar
                key={r}
                rating={r}
                count={stats?.ratingDistribution[r as keyof typeof stats.ratingDistribution] || 0}
                total={stats?.totalReviews || 0}
              />
            ))}
          </div>

          {/* Write review button */}
          <div className="flex items-center justify-center md:justify-end">
            {isLoggedIn ? (
              <Button
                type="button"
                onClick={() => setShowWriteReview(true)}
                className="stx-action-primary flex items-center gap-2"
              >
                <Edit3 className="h-4 w-4" />
                Write a Review
              </Button>
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Log in to write a review</p>
                <Button
                  asChild
                  variant="outline"
                  className="border-primary-600 text-primary-600 hover:bg-primary-50"
                >
                  <Link href="/opac/login">Log In</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Write review form */}
      {showWriteReview && (
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Write Your Review of &quot;{title}&quot;
          </h3>

          {submitError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-700">{submitError}</p>
            </div>
          )}

          <form onSubmit={handleSubmitReview} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-2">
                Your Rating *
              </label>
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Review Title
              </label>
              <Input
                type="text"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder="Summarize your thoughts..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Your Review
              </label>
              <Textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Tell others what you thought about this book..."
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                onClick={() => setShowWriteReview(false)}
                variant="outline"
                className="text-foreground/80 hover:bg-muted/30"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !rating}
                className="stx-action-primary flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Review"
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Success message */}
      {submitSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <p className="text-green-700">Your review has been submitted. Thank you for sharing!</p>
          <Button
            type="button"
            onClick={() => setSubmitSuccess(false)}
            className="ml-auto h-auto w-auto p-0 text-green-600 hover:bg-transparent hover:text-green-800"
            variant="ghost"
          >
            ×
          </Button>
        </div>
      )}

      {/* Sort controls */}
      {reviews.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Showing {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
          </p>
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as "recent" | "helpful" | "rating")}
          >
            <SelectTrigger className="w-[170px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="helpful">Most Helpful</SelectItem>
              <SelectItem value="rating">Highest Rated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Reviews list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No reviews yet</h3>
          <p className="text-muted-foreground">
            Be the first to share your thoughts about this title!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{review.patronName}</span>
                      {review.verified && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 
                                       text-green-800 text-xs font-medium rounded-full"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Verified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <StarRating value={review.rating} readonly size="sm" />
                      <span>·</span>
                      <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {review.title && (
                <h4 className="font-semibold text-foreground mt-4">{review.title}</h4>
              )}

              {review.text && (
                <p className="text-foreground/80 mt-2 whitespace-pre-wrap">
                  {expandedReviews.has(review.id) || review.text.length <= 300
                    ? review.text
                    : `${review.text.slice(0, 300)}...`}
                </p>
              )}

              {review.text && review.text.length > 300 && (
                <Button
                  type="button"
                  onClick={() => {
                    setExpandedReviews((prev) => {
                      const next = new Set(prev);
                      if (next.has(review.id)) {
                        next.delete(review.id);
                      } else {
                        next.add(review.id);
                      }
                      return next;
                    });
                  }}
                  className="mt-2 h-auto w-auto p-0 text-sm font-medium text-primary-600 hover:bg-transparent hover:underline"
                  variant="ghost"
                >
                  {expandedReviews.has(review.id) ? "Show less" : "Read more"}
                </Button>
              )}

              <div className="mt-4 flex items-center gap-4">
                <Button
                  type="button"
                  onClick={() => handleHelpful(review.id)}
                  className="h-auto p-0 text-sm text-muted-foreground hover:bg-transparent hover:text-foreground/80"
                  variant="ghost"
                >
                  <ThumbsUp className="h-4 w-4" />
                  Helpful ({review.helpful})
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
