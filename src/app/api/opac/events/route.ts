/**
 * OPAC Events API Route
 *
 * GET /api/opac/events - Returns library events
 *
 * Query Parameters:
 *   branch    - Filter by branch name (e.g., "Main Library")
 *   type      - Filter by event type (e.g., "Storytime", "Book Club")
 *   startDate - Filter events on or after this date (YYYY-MM-DD)
 *   endDate   - Filter events on or before this date (YYYY-MM-DD)
 *   limit     - Maximum number of events to return (default: 50)
 *   featured  - If "true", return only featured events
 *
 * LIBCAL INTEGRATION GUIDE:
 * =========================
 * To replace mock data with Springshare LibCal API:
 *
 * 1. Install LibCal OAuth credentials:
 *    - Go to LibCal Admin > API > OAuth Applications
 *    - Create a new application with "Events" scope
 *    - Store LIBCAL_CLIENT_ID and LIBCAL_CLIENT_SECRET in .env
 *
 * 2. Get an access token:
 *    POST https://api2.libcal.com/1.1/oauth/token
 *    Content-Type: application/x-www-form-urlencoded
 *    Body: grant_type=client_credentials&client_id=...&client_secret=...
 *
 * 3. Fetch events:
 *    GET https://api2.libcal.com/1.1/events
 *    Headers: Authorization: Bearer {access_token}
 *    Query: cal_id={calendarId}&days=30&limit=50
 *
 * 4. Response mapping from LibCal to LibraryEvent:
 *    {
 *      id: event.id.toString(),
 *      title: event.title,
 *      description: stripHtml(event.description),
 *      date: event.start.split("T")[0],
 *      startTime: formatTime(event.start),
 *      endTime: formatTime(event.end),
 *      branch: event.location?.name || event.campus?.name || "Main Library",
 *      type: mapCategory(event.category),
 *      ageGroup: mapAgeGroup(event.audience),
 *      registrationRequired: event.registration === true,
 *      registrationUrl: event.url?.public,
 *      spotsAvailable: event.seats ? event.seats.total - event.seats.taken : undefined,
 *      capacity: event.seats?.total,
 *      featured: event.featured === true,
 *    }
 */

import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api";
import {
  getUpcomingEvents,
  getEventBranches,
  getEventTypes,
  type EventType,
} from "@/lib/events-data";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;

    const branch = searchParams.get("branch") || undefined;
    const type = (searchParams.get("type") as EventType) || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const featured = searchParams.get("featured") === "true";

    const events = getUpcomingEvents({
      branch,
      type,
      startDate,
      endDate,
      limit: Math.min(limit, 100),
      featuredOnly: featured,
    });

    return successResponse({
      events,
      total: events.length,
      branches: getEventBranches(),
      types: getEventTypes(),
    });
  } catch (_error) {
    return errorResponse("Failed to fetch events", 500);
  }
}
