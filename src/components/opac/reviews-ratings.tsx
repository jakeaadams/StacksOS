"use client";

import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";
import {
  Star,
  StarHalf,
  MessageSquare,
  ThumbsUp,
  Flag,
  Loader2,
  Edit2,
  Trash2,
  CheckCircle,
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
  helpful: number;
  verified: boolean;
}

interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
}

interface ReviewsRatingsProps {
  recordId: number;
  title: string;
  currentPatronId?: number;
}

function StarRating({
  rating,
  size = "md",
  interactive = false,
  onRate,
}: {
  rating: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRate?: (rating: number) => void;
}) {
  const [hoverRating, setHoverRating] = useState(0);

  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const displayRating = hoverRating || rating;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.floor(displayRating);
        const half = !filled && star - 0.5 <= displayRating;

        return (
          <Button
            type="button"
            key={star}
            variant="ghost"
            size="icon"
            disabled={!interactive}
            aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
            className={`h-auto w-auto p-0.5 ${interactive ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            onClick={() => interactive && onRate?.(star)}
          >
            {filled ? (
              <Star className={`${sizeClasses[size]} fill-yellow-400 text-yellow-400`} />
            ) : half ? (
              <StarHalf className={`${sizeClasses[size]} fill-yellow-400 text-yellow-400`} />
            ) : (
              <Star className={`${sizeClasses[size]} text-muted-foreground/50`} />
            )}
          </Button>
        );
      })}
    </div>
  );
}

function RatingBreakdown({ stats }: { stats: ReviewStats }) {
  const { averageRating, totalReviews, ratingDistribution } = stats;

  const breakdown = [5, 4, 3, 2, 1].map((rating) => {
    const count = ratingDistribution[rating] || 0;
    const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
    return { rating, count, percentage };
  });

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-4xl font-bold">{averageRating.toFixed(1)}</div>
        <StarRating rating={averageRating} size="md" />
        <div className="text-sm text-muted-foreground mt-1">
          {totalReviews} review{totalReviews !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="space-y-1.5">
        {breakdown.map(({ rating, count, percentage }) => (
          <div key={rating} className="flex items-center gap-2 text-sm">
            <span className="w-3">{rating}</span>
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <Progress className="h-2 flex-1 bg-muted" value={percentage} />
            <span className="w-8 text-muted-foreground text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewCard({
  review,
  isOwn,
  onHelpful,
  onDelete,
  onReport,
}: {
  review: Review;
  isOwn: boolean;
  onHelpful?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
}) {
  const initials = review.patronName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const formattedDate = new Date(review.createdAt).toLocaleDateString();

  return (
    <div className="py-4">
      <div className="flex items-start gap-4">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="text-sm">{initials || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{review.patronName}</span>
            {review.verified && (
              <Badge variant="secondary" className="text-xs gap-1">
                <CheckCircle className="h-3 w-3" />
                Verified Borrower
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StarRating rating={review.rating} size="sm" />
            <span className="text-sm text-muted-foreground">{formattedDate}</span>
          </div>
          {review.title && <h4 className="font-medium mt-2">{review.title}</h4>}
          {review.text && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{review.text}</p>
          )}
          <div className="flex items-center gap-4 mt-3">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onHelpful}>
              <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
              Helpful ({review.helpful})
            </Button>
            {isOwn ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onReport}>
                <Flag className="h-3.5 w-3.5 mr-1.5" />
                Report
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReviewsRatings({ recordId, title, currentPatronId }: ReviewsRatingsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats>({
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "helpful" | "rating">("recent");

  // Fetch reviews from API
  const fetchReviews = useCallback(async () => {
    try {
      const response = await fetch(`/api/opac/reviews?bibId=${recordId}&sort=${sortBy}`);
      const data = await response.json();

      if (data.ok) {
        setReviews(data.reviews || []);
        setStats(
          data.stats || {
            averageRating: 0,
            totalReviews: 0,
            ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          }
        );
      }
    } catch (err) {
      clientLogger.error("Error fetching reviews:", err);
    } finally {
      setIsLoading(false);
    }
  }, [recordId, sortBy]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const hasReviewed = currentPatronId ? reviews.some((r) => r.patronId === currentPatronId) : false;

  const submitReview = async () => {
    if (newRating === 0) {
      toast.error("Please select a rating");
      return;
    }
    if (!newContent.trim() && !newTitle.trim()) {
      toast.error("Please add a title or review text");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetchWithAuth("/api/opac/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bibId: recordId,
          rating: newRating,
          title: newTitle.trim(),
          text: newContent.trim(),
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setIsWriteOpen(false);
        setNewRating(0);
        setNewTitle("");
        setNewContent("");
        fetchReviews(); // Refresh reviews
        toast.success("Review submitted!");
      } else {
        toast.error(data.error || "Failed to submit review");
      }
    } catch (err) {
      clientLogger.error("Error submitting review:", err);
      toast.error("Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  const markHelpful = async (reviewId: number) => {
    try {
      const response = await fetchWithAuth("/api/opac/reviews", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, action: "helpful" }),
      });

      if (response.ok) {
        setReviews(reviews.map((r) => (r.id === reviewId ? { ...r, helpful: r.helpful + 1 } : r)));
        toast.success("Marked as helpful");
      }
    } catch (_error) {
      toast.error("Failed to mark as helpful");
    }
  };

  const deleteReview = async (reviewId: number) => {
    try {
      const response = await fetchWithAuth(`/api/opac/reviews?id=${reviewId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setReviews(reviews.filter((r) => r.id !== reviewId));
        fetchReviews(); // Refresh stats
        toast.success("Review deleted");
      }
    } catch (_error) {
      toast.error("Failed to delete review");
    }
  };

  const reportReview = async (reviewId: number) => {
    try {
      await fetchWithAuth("/api/opac/reviews", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, action: "report" }),
      });
      toast.success("Review reported. Our team will review it.");
    } catch (_error) {
      toast.error("Failed to report review");
    }
  };

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortBy === "helpful") return b.helpful - a.helpful;
    if (sortBy === "rating") return b.rating - a.rating;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Reviews & Ratings
          </CardTitle>
          {currentPatronId && !hasReviewed && (
            <Dialog open={isWriteOpen} onOpenChange={setIsWriteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Write a Review
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Write a Review</DialogTitle>
                  <DialogDescription>Share your thoughts about {`"${title}"`}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Your Rating</Label>
                    <div className="flex items-center gap-3">
                      <StarRating rating={newRating} size="lg" interactive onRate={setNewRating} />
                      {newRating > 0 && (
                        <span className="text-sm text-muted-foreground">
                          {newRating === 5
                            ? "Excellent!"
                            : newRating === 4
                              ? "Good"
                              : newRating === 3
                                ? "Average"
                                : newRating === 2
                                  ? "Below Average"
                                  : "Poor"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="review-title" className="text-sm font-medium">
                      Review Title (optional)
                    </Label>
                    <Input
                      id="review-title"
                      type="text"
                      placeholder="Summarize your review"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="review-content" className="text-sm font-medium">
                      Your Review
                    </Label>
                    <Textarea
                      id="review-content"
                      placeholder="What did you like or dislike? Would you recommend this to others?"
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      rows={4}
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {newContent.length}/2000
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsWriteOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={submitReview} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Review"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {hasReviewed && (
            <Badge variant="secondary">
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              You reviewed this
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <RatingBreakdown stats={stats} />

          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                  <SelectTrigger className="h-8 w-[160px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Most Recent</SelectItem>
                    <SelectItem value="helpful">Most Helpful</SelectItem>
                    <SelectItem value="rating">Highest Rated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="divide-y">
                {sortedReviews.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No reviews yet</p>
                    <p className="text-sm mt-1">Be the first to review this item</p>
                  </div>
                ) : (
                  sortedReviews.map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      isOwn={review.patronId === currentPatronId}
                      onHelpful={() => markHelpful(review.id)}
                      onDelete={() => deleteReview(review.id)}
                      onReport={() => reportReview(review.id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ReviewsRatings;
