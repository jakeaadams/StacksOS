/**
 * CSRF Protection Utility
 * 
 * Provides Cross-Site Request Forgery protection for state-changing operations.
 * Uses double-submit cookie pattern with cryptographic tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "_csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Set CSRF token in response cookie
 */
export function setCSRFCookie(response: NextResponse, token: string): void {
  const cookieSecure = process.env.NODE_ENV === "production";
  
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
  return crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken)
  );
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
