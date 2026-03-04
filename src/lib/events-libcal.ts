/**
 * LibCal (Springshare) Events Integration
 *
 * OAuth2 client credentials + Events API.
 * In-memory cache with 5-minute TTL.
 */

import { logger } from "@/lib/logger";
import type { LibraryEvent, EventType, AgeGroup } from "./events-data";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getLibCalConfig() {
  return {
    clientId: process.env.LIBCAL_CLIENT_ID || "",
    clientSecret: process.env.LIBCAL_CLIENT_SECRET || "",
    calendarId: process.env.LIBCAL_CALENDAR_ID || "",
  };
}

// ---------------------------------------------------------------------------
// OAuth2 token caching — singleton promise to avoid races
// ---------------------------------------------------------------------------

let _cachedToken: { token: string; expiresAt: number } | null = null;
let _tokenPromise: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.token;
  }

  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    try {
      const config = getLibCalConfig();
      const response = await fetch("https://api2.libcal.com/1.1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }).toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LibCal OAuth error: ${response.status} - ${text}`);
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };
      _cachedToken = {
        token: data.access_token,
        expiresAt: now + data.expires_in * 1000,
      };
      return data.access_token;
    } finally {
      _tokenPromise = null;
    }
  })();

  return _tokenPromise;
}

// ---------------------------------------------------------------------------
// Events cache
// ---------------------------------------------------------------------------

let _eventsCache: { events: LibraryEvent[]; expiresAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// HTML → plain text
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function formatDate(isoString: string): string {
  try {
    return isoString.split("T")[0] || "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Category → EventType mapping
// ---------------------------------------------------------------------------

function mapCategory(categoryName: string): EventType {
  const lower = (categoryName || "").toLowerCase();
  if (lower.includes("story")) return "Storytime";
  if (lower.includes("book club")) return "Book Club";
  if (lower.includes("tech") || lower.includes("computer")) return "Tech Help";
  if (lower.includes("workshop") || lower.includes("class")) return "Workshop";
  if (lower.includes("author")) return "Author Visit";
  if (lower.includes("teen") || lower.includes("ya")) return "Teen";
  if (lower.includes("kid") || lower.includes("child") || lower.includes("family")) return "Kids";
  return "Adult";
}

function mapAgeGroup(categoryName: string): AgeGroup {
  const lower = (categoryName || "").toLowerCase();
  if (lower.includes("teen") || lower.includes("ya")) return "Teens";
  if (
    lower.includes("kid") ||
    lower.includes("child") ||
    lower.includes("baby") ||
    lower.includes("toddler")
  )
    return "Kids";
  if (lower.includes("senior") || lower.includes("elder")) return "Seniors";
  if (lower.includes("all age") || lower.includes("family")) return "All Ages";
  return "Adults";
}

// ---------------------------------------------------------------------------
// LibCal API response types
// ---------------------------------------------------------------------------

interface LibCalEvent {
  id: number;
  title: string;
  description?: string;
  start: string;
  end: string;
  allday?: boolean;
  location?: { name?: string };
  category?: Array<{ name?: string }>;
  registration?: boolean;
  url?: { public?: string };
  seats?: { taken?: number; total?: number };
  featured?: boolean;
}

// ---------------------------------------------------------------------------
// Fetch and map events
// ---------------------------------------------------------------------------

export async function fetchLibCalEvents(): Promise<LibraryEvent[]> {
  const now = Date.now();

  // Return from cache if fresh
  if (_eventsCache && _eventsCache.expiresAt > now) {
    return _eventsCache.events;
  }

  try {
    const config = getLibCalConfig();
    if (!config.clientId || !config.clientSecret || !config.calendarId) {
      logger.warn({ component: "events-libcal" }, "LibCal not fully configured");
      return [];
    }

    const token = await getAccessToken();

    const url = new URL("https://api2.libcal.com/1.1/events");
    url.searchParams.set("cal_id", config.calendarId);
    url.searchParams.set("limit", "50");
    url.searchParams.set("days", "60"); // Next 60 days

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LibCal events API error: ${response.status} - ${text}`);
    }

    const data = (await response.json()) as { events?: LibCalEvent[] };
    const rawEvents = data.events || [];

    const events: LibraryEvent[] = rawEvents.map((ev) => {
      const categoryName = ev.category?.[0]?.name || "";
      const spotsTotal = ev.seats?.total || undefined;
      const spotsTaken = ev.seats?.taken || 0;
      const spotsAvailable =
        spotsTotal !== undefined ? Math.max(0, spotsTotal - spotsTaken) : undefined;

      return {
        id: `libcal-${ev.id}`,
        title: ev.title || "Untitled Event",
        description: stripHtml(ev.description || ""),
        date: formatDate(ev.start),
        startTime: formatTime(ev.start),
        endTime: formatTime(ev.end),
        branch: ev.location?.name || "Library",
        type: mapCategory(categoryName),
        ageGroup: mapAgeGroup(categoryName),
        registrationRequired: ev.registration ?? false,
        registrationUrl: ev.url?.public,
        spotsAvailable,
        capacity: spotsTotal,
        featured: ev.featured ?? false,
      };
    });

    // Update cache
    _eventsCache = { events, expiresAt: now + CACHE_TTL };

    logger.info(
      { component: "events-libcal", count: events.length },
      "LibCal events fetched successfully"
    );

    return events;
  } catch (error) {
    logger.error(
      { component: "events-libcal", error: String(error) },
      "Failed to fetch LibCal events"
    );
    // Return stale cache if available, otherwise empty
    return _eventsCache?.events || [];
  }
}

/** Check if LibCal is configured. */
export function isLibCalConfigured(): boolean {
  const config = getLibCalConfig();
  return Boolean(config.clientId && config.clientSecret && config.calendarId);
}
