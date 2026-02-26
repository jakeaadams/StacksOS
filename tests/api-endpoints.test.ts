/**
 * API Endpoint Tests
 *
 * Integration tests for key API endpoints
 * Note: These tests mock external dependencies (Evergreen, database)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the external dependencies before importing routes
vi.mock("@/lib/api/evergreen-fetch", () => ({
  fetchEvergreen: vi.fn(),
}));

vi.mock("@/lib/db/evergreen", () => ({
  getEvergreenPool: vi.fn(() => ({
    query: vi.fn(),
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(),
}));

import { fetchEvergreen } from "@/lib/api/evergreen-fetch";
import { getEvergreenPool } from "@/lib/db/evergreen";

describe("API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVERGREEN_BASE_URL = "https://example.test";
  });

  describe("Health Check API", () => {
    it("should report healthy when all services are up", async () => {
      // Mock successful database query
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      };
      vi.mocked(getEvergreenPool).mockReturnValue(mockPool as any);

      // Mock successful Evergreen response
      vi.mocked(fetchEvergreen).mockResolvedValue(
        new Response(JSON.stringify({ payload: [], status: 404 }), { status: 200 })
      );

      // Import and test the route handler
      const { GET } = await import("@/app/api/health/route");

      const request = new Request("http://localhost:3000/api/health", {
        method: "GET",
      });

      const response = await GET(request as any);
      const data = await response.json();

      expect(data.status).toBe("healthy");
      expect(data.checks.database.status).toBe("up");
      expect(data.checks.evergreen.status).toBe("up");
      expect(response.status).toBe(200);
    });

    it("should report unhealthy when database is down", async () => {
      // Mock database failure
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error("Connection refused")),
      };
      vi.mocked(getEvergreenPool).mockReturnValue(mockPool as any);

      // Mock successful Evergreen response
      vi.mocked(fetchEvergreen).mockResolvedValue(
        new Response(JSON.stringify({ payload: [], status: 404 }), { status: 200 })
      );

      const { GET } = await import("@/app/api/health/route");

      const request = new Request("http://localhost:3000/api/health", {
        method: "GET",
      });

      const response = await GET(request as any);
      const data = await response.json();

      expect(data.status).toBe("unhealthy");
      expect(data.checks.database.status).toBe("down");
      expect(data.checks.database.error).toBe("Connection refused");
      expect(response.status).toBe(503);
    });

    it("should report unhealthy when Evergreen is down", async () => {
      // Mock successful database
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      };
      vi.mocked(getEvergreenPool).mockReturnValue(mockPool as any);

      // Mock Evergreen failure
      vi.mocked(fetchEvergreen).mockRejectedValue(new Error("Evergreen unavailable"));

      const { GET } = await import("@/app/api/health/route");

      const request = new Request("http://localhost:3000/api/health", {
        method: "GET",
      });

      const response = await GET(request as any);
      const data = await response.json();

      expect(data.status).toBe("unhealthy");
      expect(data.checks.evergreen.status).toBe("down");
      expect(response.status).toBe(503);
    });

    it("should include uptime and timestamp", async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      };
      vi.mocked(getEvergreenPool).mockReturnValue(mockPool as any);
      vi.mocked(fetchEvergreen).mockResolvedValue(
        new Response(JSON.stringify({ payload: [], status: 404 }), { status: 200 })
      );

      const { GET } = await import("@/app/api/health/route");

      const request = new Request("http://localhost:3000/api/health", {
        method: "GET",
      });

      const response = await GET(request as any);
      const data = await response.json();

      expect(typeof data.uptime).toBe("number");
      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("CSRF Token API", () => {
    it("should return a CSRF token", async () => {
      const { GET } = await import("@/app/api/csrf-token/route");

      // Create mock request
      const request = {
        cookies: {
          get: vi.fn(() => undefined),
        },
      } as any;

      const response = await GET(request);
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.token.length).toBe(64); // 32 bytes hex encoded
    });

    it("should return existing token if present", async () => {
      const existingToken = "a".repeat(64);

      const { GET } = await import("@/app/api/csrf-token/route");

      const request = {
        cookies: {
          get: vi.fn(() => ({ value: existingToken })),
        },
      } as any;

      const response = await GET(request);
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.token).toBe(existingToken);
    });
  });

  describe("Authentication Response Structures", () => {
    it("error response schema rejects invalid shapes", async () => {
      const { z } = await import("zod");
      const errorSchema = z.object({ ok: z.literal(false), error: z.string() });

      // Valid error response
      expect(errorSchema.safeParse({ ok: false, error: "Authentication failed" }).success).toBe(
        true
      );

      // Rejects success-shaped object
      expect(errorSchema.safeParse({ ok: true }).success).toBe(false);

      // Rejects empty object
      expect(errorSchema.safeParse({}).success).toBe(false);

      // Rejects missing error field
      expect(errorSchema.safeParse({ ok: false }).success).toBe(false);

      // Rejects wrong ok value with error field
      expect(errorSchema.safeParse({ ok: true, error: "test" }).success).toBe(false);
    });

    it("success response schema rejects invalid shapes", async () => {
      const { z } = await import("zod");
      const successSchema = z.object({ ok: z.literal(true) }).passthrough();

      // Valid success response
      expect(
        successSchema.safeParse({ ok: true, data: { authtoken: "t", user: { id: 1 } } }).success
      ).toBe(true);

      // Minimal valid success response
      expect(successSchema.safeParse({ ok: true }).success).toBe(true);

      // Rejects error-shaped object
      expect(successSchema.safeParse({ ok: false, error: "fail" }).success).toBe(false);

      // Rejects empty object
      expect(successSchema.safeParse({}).success).toBe(false);

      // Rejects missing ok field
      expect(successSchema.safeParse({ data: {} }).success).toBe(false);
    });
  });
});
