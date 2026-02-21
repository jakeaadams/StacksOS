/**
 * CSRF Protection Utility
 * 
 * Provides Cross-Site Request Forgery protection for state-changing operations.
 * Uses double-submit cookie pattern with cryptographic tokens.
 */

import { NextRequest, NextResponse } from "next/server";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "_csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

function parseForwardedProto(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase();
  if (first === "https" || first === "http") return first;
  return null;
}

function isRequestSecure(request: NextRequest): boolean {
  const headers = (request as any)?.headers as { get?: (name: string) => string | null } | undefined;
  const headerGet = typeof headers?.get === "function" ? headers.get.bind(headers) : () => null;

  const forwardedProto = parseForwardedProto(
    headerGet("x-forwarded-proto") || headerGet("X-Forwarded-Proto")
  );
  if (forwardedProto) return forwardedProto === "https";

  const directProtoRaw = (request as any)?.nextUrl?.protocol as string | undefined;
  const directProto = typeof directProtoRaw === "string" ? directProtoRaw.toLowerCase() : undefined;
  if (directProto === "https:") return true;
  if (directProto === "http:") return false;

  return false;
}

export function isCookieSecure(request?: NextRequest): boolean {
  const raw = String(process.env.STACKSOS_COOKIE_SECURE || "").trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;

  if (request) {
    const hasHeaderGet = typeof (request as any)?.headers?.get === "function";
    const hasProto = typeof (request as any)?.nextUrl?.protocol === "string";
    if (!hasHeaderGet && !hasProto) {
      // Unable to infer from request (e.g. unit tests). Fall back to environment.
      return process.env.NODE_ENV === "production";
    }
    return isRequestSecure(request);
  }

  // Fallback for non-request contexts.
  return process.env.NODE_ENV === "production";
}

function requireWebCrypto(): Crypto {
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") {
    throw new Error("CSRF requires Web Crypto (globalThis.crypto.getRandomValues)");
  }

  return globalThis.crypto;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i]! ^ bBytes[i]!;
  }
  return diff === 0;
}

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(): string {
  const webCrypto = requireWebCrypto();
  const bytes = new Uint8Array(CSRF_TOKEN_LENGTH);
  webCrypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Set CSRF token in response cookie
 */
export function setCSRFCookie(response: NextResponse, token: string, request?: NextRequest): void {
  const cookieSecure = isCookieSecure(request);
  
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
}

/**
 * Validate CSRF token from request
 * Compares token in cookie with token in header
 * 
 * @param request - Next.js request object
 * @returns true if valid, false otherwise
 */
export function validateCSRFToken(request: NextRequest): boolean {
  // Get token from cookie
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  
  // Get token from header
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  
  // Both must exist and match
  if (!cookieToken || !headerToken) {
    return false;
  }
  
  // Constant-time comparison to prevent timing attacks
  return constantTimeEqual(cookieToken, headerToken);
}

/**
 * Get CSRF token from request cookie
 */
export function getCSRFToken(request: NextRequest): string | undefined {
  return request.cookies.get(CSRF_COOKIE_NAME)?.value;
}

/**
 * Check if request method requires CSRF protection
 */
export function requiresCSRFProtection(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}
