/**
 * CSRF Protection Unit Tests
 * 
 * Tests the CSRF token generation and validation functionality
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateCSRFToken,
  validateCSRFToken,
  requiresCSRFProtection,
  getCSRFToken,
} from "@/lib/csrf";
import { NextRequest } from "next/server";

// Helper to create mock NextRequest
function createMockRequest(options: {
  cookieToken?: string;
  headerToken?: string;
  method?: string;
}): NextRequest {
  const { cookieToken, headerToken, method = "GET" } = options;
  
  const headers = new Headers();
  if (headerToken) {
    headers.set("x-csrf-token", headerToken);
  }
  
  const request = {
    cookies: {
      get: vi.fn((name: string) => {
        if (name === "_csrf_token" && cookieToken) {
          return { value: cookieToken };
        }
        return undefined;
      }),
    },
    headers: {
      get: vi.fn((name: string) => {
        if (name === "x-csrf-token") {
          return headerToken || null;
        }
        return null;
      }),
    },
    method,
  } as unknown as NextRequest;
  
  return request;
}

describe("CSRF Protection", () => {
  describe("generateCSRFToken", () => {
    it("should generate a token of correct length", () => {
      const token = generateCSRFToken();
      // 32 bytes in hex = 64 characters
      expect(token.length).toBe(64);
    });

    it("should generate unique tokens each time", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateCSRFToken());
      }
      // All tokens should be unique
      expect(tokens.size).toBe(100);
    });

    it("should generate hexadecimal tokens", () => {
      const token = generateCSRFToken();
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });
  });

  describe("validateCSRFToken", () => {
    it("should return true when cookie and header tokens match", () => {
      const token = generateCSRFToken();
      const request = createMockRequest({
        cookieToken: token,
        headerToken: token,
      });

      expect(validateCSRFToken(request)).toBe(true);
    });

    it("should return false when tokens do not match", () => {
      const request = createMockRequest({
        cookieToken: generateCSRFToken(),
        headerToken: generateCSRFToken(),
      });

      expect(validateCSRFToken(request)).toBe(false);
    });

    it("should return false when cookie token is missing", () => {
      const token = generateCSRFToken();
      const request = createMockRequest({
        cookieToken: undefined,
        headerToken: token,
      });

      expect(validateCSRFToken(request)).toBe(false);
    });

    it("should return false when header token is missing", () => {
      const token = generateCSRFToken();
      const request = createMockRequest({
        cookieToken: token,
        headerToken: undefined,
      });

      expect(validateCSRFToken(request)).toBe(false);
    });

    it("should return false when both tokens are missing", () => {
      const request = createMockRequest({});
      expect(validateCSRFToken(request)).toBe(false);
    });
  });

  describe("getCSRFToken", () => {
    it("should return token from cookie", () => {
      const token = generateCSRFToken();
      const request = createMockRequest({ cookieToken: token });

      expect(getCSRFToken(request)).toBe(token);
    });

    it("should return undefined when no cookie", () => {
      const request = createMockRequest({});
      expect(getCSRFToken(request)).toBeUndefined();
    });
  });

  describe("requiresCSRFProtection", () => {
    it("should require CSRF for POST requests", () => {
      expect(requiresCSRFProtection("POST")).toBe(true);
    });

    it("should require CSRF for PUT requests", () => {
      expect(requiresCSRFProtection("PUT")).toBe(true);
    });

    it("should require CSRF for PATCH requests", () => {
      expect(requiresCSRFProtection("PATCH")).toBe(true);
    });

    it("should require CSRF for DELETE requests", () => {
      expect(requiresCSRFProtection("DELETE")).toBe(true);
    });

    it("should not require CSRF for GET requests", () => {
      expect(requiresCSRFProtection("GET")).toBe(false);
    });

    it("should not require CSRF for HEAD requests", () => {
      expect(requiresCSRFProtection("HEAD")).toBe(false);
    });

    it("should not require CSRF for OPTIONS requests", () => {
      expect(requiresCSRFProtection("OPTIONS")).toBe(false);
    });

    it("should handle lowercase method names", () => {
      expect(requiresCSRFProtection("post")).toBe(true);
      expect(requiresCSRFProtection("get")).toBe(false);
    });
  });
});
