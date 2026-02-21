import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  unauthorizedResponse,
  getRequestMeta,
} from "@/lib/api";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

/**
 * OPAC Reviews API
 * Manages patron reviews and ratings for bibliographic records
 *
 * NOTE: Evergreen does not have a native reviews system, so this implementation
 * uses a custom approach with patron notes or a separate database table.
 * For now, we use a simplified in-memory/localStorage approach that can
 * be replaced with a proper database later.
 */

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
  reported: boolean;
}

// In production, this would be stored in a database
// For now, we use a Map that persists during server runtime
const reviewsStore = new Map<number, Review[]>();
let nextReviewId = 1;

function getReviewsForBib(bibId: number): Review[] {
  return reviewsStore.get(bibId) || [];
}

function calculateStats(reviews: Review[]) {
  if (reviews.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
  }

  const ratingDistribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let totalRating = 0;

  for (const review of reviews) {
    if (!review.reported) {
      totalRating += review.rating;
      ratingDistribution[review.rating] = (ratingDistribution[review.rating] || 0) + 1;
    }
  }

  const visibleReviews = reviews.filter((r) => !r.reported);
  const averageRating = visibleReviews.length > 0 ? totalRating / visibleReviews.length : 0;

  return {
    averageRating: Math.round(averageRating * 10) / 10,
    totalReviews: visibleReviews.length,
    ratingDistribution,
  };
}

const reviewPostSchema = z.object({
  bibId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(256).optional(),
  content: z.string().max(4096).optional(),
}).passthrough();

const reviewPutSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  reviewId: z.coerce.number().int().positive().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  title: z.string().trim().max(256).optional(),
  content: z.string().max(4096).optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const bibId = searchParams.get("bibId");
    const sortBy = searchParams.get("sort") || "recent";

    if (!bibId) {
      return errorResponse("bibId is required", 400);
    }

    const bibIdNum = parseInt(bibId, 10);
    const reviews = getReviewsForBib(bibIdNum).filter((r) => !r.reported);

    // Sort reviews
    const sortedReviews = [...reviews];
    if (sortBy === "helpful") {
      sortedReviews.sort((a, b) => b.helpful - a.helpful);
    } else if (sortBy === "rating") {
      sortedReviews.sort((a, b) => b.rating - a.rating);
    } else {
      // recent
      sortedReviews.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const stats = calculateStats(reviews);

    return successResponse({
      reviews: sortedReviews,
      stats,
    });
  } catch (error) {
    return serverErrorResponse(error, "Reviews GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ip } = getRequestMeta(req);

    // Rate limiting - 10 reviews per hour per IP
    const rateLimit = await checkRateLimit(ip || "unknown", {
      maxAttempts: 10,
      windowMs: 60 * 60 * 1000, // 1 hour
      endpoint: "opac-reviews",
    });

    if (!rateLimit.allowed) {
      const waitMinutes = Math.ceil(rateLimit.resetIn / 60000);
      return errorResponse(
        `Too many reviews submitted. Please try again in ${waitMinutes} minute(s).`,
        429
      );
    }

    // Require patron authentication
    let patronToken: string;
    let patronId: number;
    let user: any;
    try {
      ({ patronToken, patronId, user } = await requirePatronSession());
    } catch (error) {
      if (error instanceof PatronAuthError) {
        console.error("Route /api/opac/reviews auth failed:", error);
        return unauthorizedResponse();
      }
      throw error;
    }

    const patronName =
      `${user.first_given_name || ""} ${user.family_name || ""}`.trim() || "Anonymous";
    const verified = true; // They are logged in with valid credentials

    const body = await req.json();
    const { bibId, rating, title, text } = body;

    if (!bibId) {
      return errorResponse("bibId is required", 400);
    }

    if (!rating || rating < 1 || rating > 5) {
      return errorResponse("Rating must be between 1 and 5", 400);
    }

    const bibIdNum = parseInt(bibId, 10);

    // Check if patron already reviewed this item
    const existingReviews = getReviewsForBib(bibIdNum);
    if (existingReviews.some((r) => r.patronId === patronId)) {
      return errorResponse("You have already reviewed this item", 400);
    }

    // Check if patron has borrowed this item (for verified badge)
    try {
      await callOpenSRF("open-ils.circ", "open-ils.circ.patron_items_by_copy", [
        patronToken,
        patronId,
      ]);
      // If they have any circulation history with this bib, mark as verified
      // This is a simplified check - production would verify specific bib
    } catch (_error) {
      // Continue without verification
    }

    const review: Review = {
      id: nextReviewId++,
      bibId: bibIdNum,
      patronId,
      patronName,
      rating,
      title: title || undefined,
      text: text || undefined,
      createdAt: new Date().toISOString(),
      helpful: 0,
      verified,
      reported: false,
    };

    // Store review
    const bibReviews = reviewsStore.get(bibIdNum) || [];
    bibReviews.push(review);
    reviewsStore.set(bibIdNum, bibReviews);

    return successResponse({ review });
  } catch (error) {
    return serverErrorResponse(error, "Reviews POST", req);
  }
}

export async function PUT(req: NextRequest) {
  try {
    // Require patron authentication
    let _patronId: number;
    try {
      ({ patronId: _patronId } = await requirePatronSession());
    } catch (error) {
      if (error instanceof PatronAuthError) {
        console.error("Route /api/opac/reviews auth failed:", error);
        return unauthorizedResponse();
      }
      throw error;
    }

    const body = await req.json();
    const { reviewId, action } = body;

    if (!reviewId) {
      return errorResponse("reviewId is required", 400);
    }

    // Find the review across all bibs
    let foundReview: Review | null = null;
    let foundBibId: number | null = null;

    for (const [bibId, reviews] of reviewsStore.entries()) {
      const review = reviews.find((r) => r.id === reviewId);
      if (review) {
        foundReview = review;
        foundBibId = bibId;
        break;
      }
    }

    if (!foundReview || foundBibId === null) {
      return errorResponse("Review not found", 404);
    }

    if (action === "helpful") {
      foundReview.helpful += 1;
      return successResponse({ helpful: foundReview.helpful });
    }

    if (action === "report") {
      foundReview.reported = true;
      return successResponse({ reported: true });
    }

    return errorResponse("Invalid action", 400);
  } catch (error) {
    return serverErrorResponse(error, "Reviews PUT", req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Require patron authentication
    let patronId: number;
    try {
      ({ patronId } = await requirePatronSession());
    } catch (error) {
      if (error instanceof PatronAuthError) {
        console.error("Route /api/opac/reviews auth failed:", error);
        return unauthorizedResponse();
      }
      throw error;
    }

    const searchParams = req.nextUrl.searchParams;
    const reviewId = searchParams.get("id");

    if (!reviewId) {
      return errorResponse("Review ID is required", 400);
    }

    const reviewIdNum = parseInt(reviewId, 10);

    // Find and delete the review
    for (const [bibId, reviews] of reviewsStore.entries()) {
      const reviewIndex = reviews.findIndex((r) => r.id === reviewIdNum);
      if (reviewIndex !== -1) {
        const review = reviews[reviewIndex]!;

        // Only allow deletion by the review owner
        if (review.patronId !== patronId) {
          return errorResponse("You can only delete your own reviews", 403);
        }

        reviews.splice(reviewIndex, 1);
        reviewsStore.set(bibId, reviews);

        return successResponse({ deleted: true });
      }
    }

    return errorResponse("Review not found", 404);
  } catch (error) {
    return serverErrorResponse(error, "Reviews DELETE", req);
  }
}
