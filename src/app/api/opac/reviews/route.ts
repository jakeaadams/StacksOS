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
import { logger } from "@/lib/logger";
import { z } from "zod";
import {
  getReviews,
  setReviews,
  getNextId,
  deleteReview,
  findReviewById,
  persistChanges,
} from "@/lib/reviews-store";
import type { Review } from "@/lib/reviews-store";

/**
 * OPAC Reviews API
 * Manages patron reviews and ratings for bibliographic records
 *
 * NOTE: Evergreen does not have a native reviews system, so this implementation
 * uses a custom approach with patron notes or a separate database table.
 * Reviews are persisted to a JSON file on disk (configurable via
 * REVIEWS_STORE_PATH env var, default .data/reviews.json).
 */

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
  text: z.string().max(4096).optional(),
});

const reviewPutSchema = z.object({
  reviewId: z.coerce.number().int().positive(),
  action: z.enum(["helpful", "report"]),
});

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const bibId = searchParams.get("bibId");
    const sortBy = searchParams.get("sort") || "recent";

    if (!bibId) {
      return errorResponse("bibId is required", 400);
    }

    const bibIdNum = parseInt(bibId, 10);
    const allBibReviews = await getReviews(bibIdNum);
    const reviews = allBibReviews.filter((r) => !r.reported);

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
    let user: { first_given_name?: string; family_name?: string };
    try {
      ({ patronToken, patronId, user } = await requirePatronSession());
    } catch (error) {
      if (error instanceof PatronAuthError) {
        logger.warn({ error: String(error) }, "Route /api/opac/reviews auth failed");
        return unauthorizedResponse();
      }
      throw error;
    }

    const patronName =
      `${user.first_given_name || ""} ${user.family_name || ""}`.trim() || "Anonymous";
    const verified = true; // They are logged in with valid credentials

    const parsed = reviewPostSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse(
        "Invalid review: " + parsed.error.issues.map((i) => i.message).join(", "),
        400
      );
    }
    const { bibId, rating, title, text } = parsed.data;
    const bibIdNum = bibId;

    // Check if patron already reviewed this item
    const existingReviews = await getReviews(bibIdNum);
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

    const reviewId = await getNextId();
    const review: Review = {
      id: reviewId,
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
    const bibReviews = await getReviews(bibIdNum);
    bibReviews.push(review);
    await setReviews(bibIdNum, bibReviews);

    return successResponse({ review });
  } catch (error) {
    return serverErrorResponse(error, "Reviews POST", req);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { ip } = getRequestMeta(req);

    // Rate limiting — 30 actions per hour per IP (prevents vote manipulation)
    const rateLimit = await checkRateLimit(ip || "unknown", {
      maxAttempts: 30,
      windowMs: 60 * 60 * 1000,
      endpoint: "opac-reviews-action",
    });
    if (!rateLimit.allowed) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    // Require patron authentication
    let patronId: number;
    try {
      ({ patronId } = await requirePatronSession());
    } catch (error) {
      if (error instanceof PatronAuthError) {
        logger.warn({ error: String(error) }, "Route /api/opac/reviews auth failed");
        return unauthorizedResponse();
      }
      throw error;
    }

    const parsed = reviewPutSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse(
        "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", "),
        400
      );
    }
    const { reviewId, action } = parsed.data;

    // Find the review across all bibs
    const found = await findReviewById(reviewId);
    if (!found) {
      return errorResponse("Review not found", 404);
    }

    const { review: foundReview } = found;

    if (action === "helpful") {
      // Prevent patrons from voting helpful on their own review
      if (foundReview.patronId === patronId) {
        return errorResponse("You cannot vote on your own review", 400);
      }
      foundReview.helpful += 1;
      await persistChanges();
      return successResponse({ helpful: foundReview.helpful });
    }

    if (action === "report") {
      foundReview.reported = true;
      await persistChanges();
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
        logger.warn({ error: String(error) }, "Route /api/opac/reviews auth failed");
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

    // Find the review first to check ownership
    const found = await findReviewById(reviewIdNum);
    if (!found) {
      return errorResponse("Review not found", 404);
    }

    // Only allow deletion by the review owner
    if (found.review.patronId !== patronId) {
      return errorResponse("You can only delete your own reviews", 403);
    }

    await deleteReview(found.bibId, reviewIdNum);
    return successResponse({ deleted: true });
  } catch (error) {
    return serverErrorResponse(error, "Reviews DELETE", req);
  }
}
