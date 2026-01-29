import { NextRequest, NextResponse } from "next/server";
import {
  generateCSRFToken,
  setCSRFCookie,
  validateCSRFToken,
  requiresCSRFProtection,
  getCSRFToken,
} from "@/lib/csrf";

export function middleware(request: NextRequest) {
  const { pathname, method } = new URL(request.url);

  // Skip CSRF for:
  // 1. GET/HEAD/OPTIONS requests (safe methods)
  // 2. CSRF token endpoint itself
  // 3. Public OPAC read-only endpoints
  // 4. Next.js internal routes
  if (
    !requiresCSRFProtection(request.method) ||
    pathname === "/api/csrf-token" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/opac/session") // Read-only session check
  ) {
    // For safe methods, ensure CSRF token cookie exists
    const response = NextResponse.next();
    const existingToken = getCSRFToken(request);
    
    if (!existingToken) {
      const newToken = generateCSRFToken();
      setCSRFCookie(response, newToken);
    }
    
    return response;
  }

  // For state-changing requests, validate CSRF token
  if (!validateCSRFToken(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "CSRF token validation failed",
        details: "Invalid or missing CSRF token. Please refresh the page and try again.",
      },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
