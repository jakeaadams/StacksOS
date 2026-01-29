import { NextRequest, NextResponse } from "next/server";
import {
  generateCSRFToken,
  setCSRFCookie,
  validateCSRFToken,
  requiresCSRFProtection,
  getCSRFToken,
} from "@/lib/csrf";

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Content Security Policy - restrictive policy to prevent XSS
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +  // unsafe-eval needed for Next.js dev
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );

  // Prevent browsers from MIME-sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Enable XSS filter in older browsers
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // HSTS - force HTTPS (only in production with HTTPS)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  // Referrer policy - control referrer information
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy - disable unnecessary browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url);
  const method = request.method;

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
    
    return addSecurityHeaders(response);
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

  return addSecurityHeaders(NextResponse.next());
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
