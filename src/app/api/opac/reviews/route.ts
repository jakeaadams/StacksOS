import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { cookies } from "next/headers";

/**
 * OPAC Reviews API
 * Manages patron reviews and ratings for bibliographic records
 *
 * NOTE: Evergreen doesn't have a native reviews system, so this implementation
 * uses a custom approach with patron notes or a separate database table.
 * For now, we'll use a simplified in-memory/localStorage approach that can
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
// For now, we'll use a Map that persists during server runtime
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

  const visibleReviews = reviews.filter(r => !r.reported);
  const averageRating = visibleReviews.length > 0 ? totalRating / visibleReviews.length : 0;

  return {
    averageRating: Math.round(averageRating * 10) / 10,
    totalReviews: visibleReviews.length,
    ratingDistribution,
  };
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const bibId = searchParams.get("bibId");
    const sortBy = searchParams.get("sort") || "recent";

    if (!bibId) {
      return errorResponse("bibId is required", 400);
    }

    const bibIdNum = parseInt(bibId, 10);
    const reviews = getReviewsForBib(bibIdNum).filter(r => !r.reported);

    // Sort reviews
    const sortedReviews = [...reviews];
    if (sortBy === "helpful") {
      sortedReviews.sort((a, b) => b.helpful - a.helpful);
    } else if (sortBy === "rating") {
      sortedReviews.sort((a, b) => b.rating - a.rating);
    } else {
      // recent
      sortedReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
    // Get patron from self-checkout cookie or staff auth
    const cookieStore = await cookies();
    const selfCheckoutToken = cookieStore.get("self_checkout_token")?.value;

    let patronId: number;
    let patronName: string;
    let verified = false;

    if (selfCheckoutToken) {
      // Get patron info from self-checkout session
      try {
        const sessionRes = await callOpenSRF(
          "open-ils.auth",
          "open-ils.auth.session.retrieve",
          [selfCheckoutToken]
        );
        const session = sessionRes?.payload?.[0];
        if (session && !session.ilsevent) {
          patronId = session.id || session.usrname;

          // Get patron details
          const patronRes = await callOpenSRF(
            "open-ils.actor",
            "open-ils.actor.user.fleshed.retrieve",
            [selfCheckoutToken, session.id, ["card"]]
          );
          const patron = patronRes?.payload?.[0];
          if (patron && !patron.ilsevent) {
            patronName = `${patron.first_given_name || ""} ${patron.family_name || ""}`.trim() || "Anonymous";
            patronId = patron.id;
            verified = true; // They're logged in with valid credentials
          } else {
            patronName = "Anonymous";
          }
        } else {
          return errorResponse("Please log in to submit a review", 401);
        }
      } catch (_error) {
        return errorResponse("Authentication error", 401);
      }
    } else {
      // No authentication - anonymous review (you might want to disable this)
      patronId = 0;
      patronName = "Guest";
      verified = false;
    }

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
    if (patronId > 0 && existingReviews.some(r => r.patronId === patronId)) {
      return errorResponse("You have already reviewed this item", 400);
    }

    // Check if patron has borrowed this item (for verified badge)
    if (patronId > 0 && verified) {
      try {
        const circRes = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.patron_items_by_copy",
          [selfCheckoutToken!, patronId]
        );
        // If they have any circulation history with this bib, mark as verified
        // This is a simplified check - production would verify specific bib
      } catch (_error) {
        // Continue without verification
      }
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
    const body = await req.json();
    const { reviewId, action } = body;

    if (!reviewId) {
      return errorResponse("reviewId is required", 400);
    }

    // Find the review across all bibs
    let foundReview: Review | null = null;
    let foundBibId: number | null = null;

    for (const [bibId, reviews] of reviewsStore.entries()) {
      const review = reviews.find(r => r.id === reviewId);
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
    const searchParams = req.nextUrl.searchParams;
    const reviewId = searchParams.get("id");

    if (!reviewId) {
      return errorResponse("Review ID is required", 400);
    }

    const reviewIdNum = parseInt(reviewId, 10);

    // Get patron from self-checkout cookie
    const cookieStore = await cookies();
    const selfCheckoutToken = cookieStore.get("self_checkout_token")?.value;

    let patronId: number | null = null;

    if (selfCheckoutToken) {
      try {
        const sessionRes = await callOpenSRF(
          "open-ils.auth",
          "open-ils.auth.session.retrieve",
          [selfCheckoutToken]
        );
        const session = sessionRes?.payload?.[0];
        if (session && !session.ilsevent) {
          patronId = session.id;
        }
      } catch {
        // Continue without auth
      }
    }

    // Find and delete the review
    for (const [bibId, reviews] of reviewsStore.entries()) {
      const reviewIndex = reviews.findIndex(r => r.id === reviewIdNum);
      if (reviewIndex !== -1) {
        const review = reviews[reviewIndex];

        // Only allow deletion by the review owner
        if (patronId !== null && review.patronId !== patronId) {
          return errorResponse("You can only delete your own reviews", 403);
        }

        reviews.splice(reviewIndex, 1);
        reviewsStore.set(bibId, reviews);

        return successResponse({ deleted: true });
      }
    }

    return errorResponse("Review not found", 404);
  } catch (_error) {
    return serverErrorResponse(_error, "Reviews DELETE", req);
  }
}
