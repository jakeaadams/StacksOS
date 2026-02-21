/**
 * API Response Helpers Unit Tests
 *
 * Tests the standardized API response functions.
 */

import { describe, it, expect, vi } from "vitest";

// Mock next/server before importing
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: any, init?: any) => ({
      body,
      status: init?.status || 200,
      headers: init?.headers,
      json: async () => body,
    })),
  },
}));

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock metrics
vi.mock("@/lib/metrics", () => ({
  apiErrorResponsesTotal: { inc: vi.fn() },
}));

import {
  successResponse,
  okResponse,
  errorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
  requireFields,
} from "@/lib/api/responses";

describe("API Response Helpers", () => {
  describe("successResponse", () => {
    it("should return ok: true with data", () => {
      const response = successResponse({ items: [], count: 0 });
      expect(((response as any).body).ok).toBe(true);
      expect(((response as any).body).items).toEqual([]);
      expect(((response as any).body).count).toBe(0);
    });

    it("should include optional message", () => {
      const response = successResponse({ data: "test" }, "Success!");
      expect(((response as any).body).ok).toBe(true);
      expect(((response as any).body).message).toBe("Success!");
    });
  });

  describe("okResponse", () => {
    it("should return ok: true with message", () => {
      const response = okResponse("Operation completed");
      expect(((response as any).body).ok).toBe(true);
      expect(((response as any).body).message).toBe("Operation completed");
    });
  });

  describe("errorResponse", () => {
    it("should return ok: false with error message", () => {
      const response = errorResponse("Something went wrong");
      expect(((response as any).body).ok).toBe(false);
      expect(((response as any).body).error).toBe("Something went wrong");
    });

    it("should default to status 400", () => {
      const response = errorResponse("Bad request");
      expect((response as any).status).toBe(400);
    });

    it("should accept custom status codes", () => {
      const response = errorResponse("Not found", 404);
      expect((response as any).status).toBe(404);
    });

    it("should include optional details", () => {
      const response = errorResponse("Error", 400, { field: "name" });
      expect(((response as any).body).details).toEqual({ field: "name" });
    });
  });

  describe("notFoundResponse", () => {
    it("should return 404 status", () => {
      const response = notFoundResponse();
      expect((response as any).status).toBe(404);
      expect(((response as any).body).error).toBe("Not found");
    });

    it("should accept custom message", () => {
      const response = notFoundResponse("Record not found");
      expect(((response as any).body).error).toBe("Record not found");
    });
  });

  describe("unauthorizedResponse", () => {
    it("should return 401 status", () => {
      const response = unauthorizedResponse();
      expect((response as any).status).toBe(401);
      expect(((response as any).body).error).toBe("Authentication required");
    });

    it("should accept custom message", () => {
      const response = unauthorizedResponse("Session expired");
      expect(((response as any).body).error).toBe("Session expired");
    });
  });

  describe("forbiddenResponse", () => {
    it("should return 403 status", () => {
      const response = forbiddenResponse();
      expect((response as any).status).toBe(403);
      expect(((response as any).body).error).toBe("Permission denied");
    });
  });

  describe("serverErrorResponse", () => {
    it("should return 500 status for generic errors", () => {
      const response = serverErrorResponse(
        new Error("db timeout"),
        "test-context"
      );
      expect((response as any).status).toBe(500);
    });

    it("should handle non-Error objects", () => {
      const response = serverErrorResponse("string error", "test-context");
      expect((response as any).status).toBe(500);
    });
  });

  describe("requireFields", () => {
    it("should return null when all fields are present", () => {
      const body = { name: "John", email: "john@example.com" };
      const result = requireFields(body, ["name", "email"]);
      expect(result).toBeNull();
    });

    it("should return error response when fields are missing", () => {
      const body = { name: "John" };
      const result = requireFields(body, ["name", "email"]);
      expect(result).not.toBeNull();
      expect((result as any).body.ok).toBe(false);
    });

    it("should return error response when field is null", () => {
      const body = { name: "John", email: null };
      const result = requireFields(body, ["name", "email"]);
      expect(result).not.toBeNull();
    });
  });
});
