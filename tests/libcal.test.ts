/**
 * LibCal Events Integration Unit Tests
 *
 * Tests OAuth token fetching, event mapping, HTML stripping,
 * 5-minute cache, and configuration checks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.LIBCAL_CLIENT_ID = "test-client-id";
  process.env.LIBCAL_CLIENT_SECRET = "test-client-secret";
  process.env.LIBCAL_CALENDAR_ID = "12345";
  vi.stubGlobal("fetch", vi.fn());
  vi.useFakeTimers();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Helper to mock OAuth + events API in sequence. */
function mockOAuthAndEvents(events: object[]) {
  vi.mocked(fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "test-libcal-token", expires_in: 3600 }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events }),
    } as Response);
}

const sampleLibCalEvent = {
  id: 101,
  title: "Summer Reading Storytime",
  description: "<p>Join us for a <strong>fun</strong> storytime!</p>",
  start: "2026-06-15T10:00:00-04:00",
  end: "2026-06-15T11:00:00-04:00",
  location: { name: "Main Branch" },
  category: [{ name: "Kids Storytime" }],
  registration: true,
  url: { public: "https://libcal.example.com/event/101" },
  seats: { taken: 5, total: 20 },
  featured: true,
};

describe("LibCal Integration", () => {
  describe("OAuth token fetching", () => {
    it("should fetch an OAuth token from LibCal API", async () => {
      const { fetchLibCalEvents } = await import("@/lib/events-libcal");
      mockOAuthAndEvents([]);

      await fetchLibCalEvents();

      const [oauthUrl, oauthOptions] = vi.mocked(fetch).mock.calls[0];
      expect(oauthUrl).toBe("https://api2.libcal.com/1.1/oauth/token");
      expect(oauthOptions?.method).toBe("POST");
      expect((oauthOptions?.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/x-www-form-urlencoded"
      );

      const bodyStr = oauthOptions?.body as string;
      expect(bodyStr).toContain("grant_type=client_credentials");
      expect(bodyStr).toContain("client_id=test-client-id");
      expect(bodyStr).toContain("client_secret=test-client-secret");
    });
  });

  describe("fetchLibCalEvents — event mapping", () => {
    it("should map LibCal response to LibraryEvent format", async () => {
      const { fetchLibCalEvents } = await import("@/lib/events-libcal");
      mockOAuthAndEvents([sampleLibCalEvent]);

      const events = await fetchLibCalEvents();

      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev.id).toBe("libcal-101");
      expect(ev.title).toBe("Summer Reading Storytime");
      expect(ev.branch).toBe("Main Branch");
      expect(ev.type).toBe("Storytime");
      expect(ev.ageGroup).toBe("Kids");
      expect(ev.registrationRequired).toBe(true);
      expect(ev.registrationUrl).toBe("https://libcal.example.com/event/101");
      expect(ev.spotsAvailable).toBe(15);
      expect(ev.capacity).toBe(20);
      expect(ev.featured).toBe(true);
      expect(ev.date).toBe("2026-06-15");
    });
  });

  describe("HTML stripping from descriptions", () => {
    it("should strip HTML tags from event descriptions", async () => {
      const { fetchLibCalEvents } = await import("@/lib/events-libcal");
      mockOAuthAndEvents([sampleLibCalEvent]);

      const events = await fetchLibCalEvents();
      expect(events[0].description).toBe("Join us for a fun storytime!");
    });

    it("should decode HTML entities", async () => {
      const { fetchLibCalEvents } = await import("@/lib/events-libcal");
      mockOAuthAndEvents([
        {
          ...sampleLibCalEvent,
          description: "Books &amp; more &lt;reading&gt; &quot;fun&quot; it&#39;s great",
        },
      ]);

      const events = await fetchLibCalEvents();
      expect(events[0].description).toBe('Books & more <reading> "fun" it\'s great');
    });
  });

  describe("5-minute cache", () => {
    it("should return cached data on second call within 5 minutes", async () => {
      const { fetchLibCalEvents } = await import("@/lib/events-libcal");
      mockOAuthAndEvents([sampleLibCalEvent]);

      const first = await fetchLibCalEvents();
      const second = await fetchLibCalEvents();

      // Only 2 fetch calls total (1 OAuth + 1 events API), not 4
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(first).toEqual(second);
    });

    it("should refetch after cache expires (5 minutes)", async () => {
      const { fetchLibCalEvents } = await import("@/lib/events-libcal");

      // First call
      mockOAuthAndEvents([sampleLibCalEvent]);
      await fetchLibCalEvents();

      // Advance past 5-minute events cache TTL but within OAuth token TTL (3600s)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Second call reuses cached OAuth token, only needs new events fetch
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [{ ...sampleLibCalEvent, id: 202, title: "Updated Event" }],
        }),
      } as Response);

      const refreshed = await fetchLibCalEvents();
      // 3 total fetches: 1 OAuth + 1 events (first call) + 1 events (second call, reused token)
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(refreshed[0].title).toBe("Updated Event");
    });
  });

  describe("isLibCalConfigured", () => {
    it("should return false when LIBCAL_CLIENT_ID is missing", async () => {
      delete process.env.LIBCAL_CLIENT_ID;
      const { isLibCalConfigured } = await import("@/lib/events-libcal");
      expect(isLibCalConfigured()).toBe(false);
    });

    it("should return false when LIBCAL_CLIENT_SECRET is missing", async () => {
      delete process.env.LIBCAL_CLIENT_SECRET;
      const { isLibCalConfigured } = await import("@/lib/events-libcal");
      expect(isLibCalConfigured()).toBe(false);
    });

    it("should return false when LIBCAL_CALENDAR_ID is missing", async () => {
      delete process.env.LIBCAL_CALENDAR_ID;
      const { isLibCalConfigured } = await import("@/lib/events-libcal");
      expect(isLibCalConfigured()).toBe(false);
    });

    it("should return true when all env vars are set", async () => {
      const { isLibCalConfigured } = await import("@/lib/events-libcal");
      expect(isLibCalConfigured()).toBe(true);
    });
  });
});
