import { NextRequest, NextResponse } from "next/server";
import {
  generateCSRFToken,
  getCSRFToken,
  isCookieSecure,
  requiresCSRFProtection,
  setCSRFCookie,
  validateCSRFToken,
} from "@/lib/csrf";

function generateCspNonce(): string {
  // Middleware runs on the edge runtime: use Web Crypto APIs.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xrip = req.headers.get("x-real-ip");
  if (xrip && xrip.trim()) return xrip.trim();
  return (req as any).ip || null;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (!base || !Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  if (ipInt === null || baseInt === null) return false;
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1) >>> 0) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipAllowed(ip: string | null): boolean {
  const raw = process.env.STACKSOS_IP_ALLOWLIST || "";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  if (!ip) return false;
  for (const entry of list) {
    if (entry.includes("/")) {
      if (ipInCidr(ip, entry)) return true;
    } else if (ip === entry) {
      return true;
    }
  }
  return false;
}

function addSecurityHeaders(request: NextRequest, response: NextResponse, nonce: string): NextResponse {
  const pathname = request.nextUrl.pathname;
  const isProd = process.env.NODE_ENV === "production";

  // CSP: keep permissive enough for Next while blocking obvious injection vectors.
  // NOTE:
  // - Dev uses eval for HMR; production should not.
  // - We include a per-request nonce now so we can progressively eliminate
  //   `unsafe-inline` as we remove inline scripts/styles.
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-inline'; `
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'; `;
  const styleSrc = `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'; `;
  const connectSrc = isProd ? "connect-src 'self'; " : "connect-src 'self' ws: wss:; ";
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
      scriptSrc +
      styleSrc +
      "img-src 'self' data: blob: https:; " +
      "font-src 'self' data:; " +
      connectSrc +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self';"
  );

  // Progressive CSP hardening:
  // - Keep a permissive baseline that works today
  // - Optionally emit a stricter policy in REPORT-ONLY mode so production can
  //   collect violations and converge on dropping `unsafe-inline`.
  const reportOnlyFlag = String(process.env.STACKSOS_CSP_REPORT_ONLY || "").trim().toLowerCase();
  const enableReportOnly = ["1", "true", "yes"].includes(reportOnlyFlag);
  if (enableReportOnly) {
    const reportUrl = new URL("/api/security/csp-report", request.nextUrl.origin).toString();

    // Reporting API (modern) + report-uri fallback (legacy).
    response.headers.set("Reporting-Endpoints", `csp="${reportUrl}"`);
    response.headers.set(
      "Report-To",
      JSON.stringify({
        group: "csp",
        max_age: 10886400,
        endpoints: [{ url: reportUrl }],
      })
    );

    const strictScriptSrc = isProd
      ? `script-src 'self' 'nonce-${nonce}'; `
      : `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'; `;
    const strictStyleSrc = `style-src 'self' 'nonce-${nonce}'; `;
    const strictConnectSrc = isProd ? "connect-src 'self'; " : "connect-src 'self' ws: wss:; ";

    response.headers.set(
      "Content-Security-Policy-Report-Only",
      "default-src 'self'; " +
        strictScriptSrc +
        strictStyleSrc +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        strictConnectSrc +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        `report-to csp; report-uri ${reportUrl};`
    );
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // HSTS only when we are actually running behind HTTPS.
  if (isCookieSecure(request)) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // Avoid stale HTML referencing old hashed chunks after deploys.
  const accept = request.headers.get("accept") || "";
  const isHtmlNav = request.method === "GET" && accept.includes("text/html");
  const neverCache =
    pathname.startsWith("/api/") ||
    pathname === "/login" ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/self-checkout") ||
    pathname.startsWith("/opac/login") ||
    isHtmlNav;

  if (neverCache) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
  }

  return response;
}

/**
 * Ensure every request has a correlation ID.
 *
 * Many API routes and the audit log rely on `x-request-id` to correlate UI
 * errors with server logs. The client usually sets this header, but we also
 * generate one server-side for any requests that don't provide it (e.g. curls,
 * 3rd party clients, misbehaving pages).
 */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);

  let requestId = requestHeaders.get("x-request-id");
  if (!requestId) {
    requestId = crypto.randomUUID();
    requestHeaders.set("x-request-id", requestId);
  }

  const cspNonce = generateCspNonce();
  requestHeaders.set("x-csp-nonce", cspNonce);

  const pathname = req.nextUrl.pathname;
  const isProtected =
    pathname.startsWith("/staff") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/opac/account");

  if (isProtected && !ipAllowed(getClientIp(req))) {
    const isApi = pathname.startsWith("/api");
    const body = isApi
      ? JSON.stringify({ ok: false, error: "IP not allowed" })
      : "Access denied: IP not allowed";
    const res = new NextResponse(body, {
      status: 403,
      headers: {
        "content-type": isApi ? "application/json" : "text/plain; charset=utf-8",
        "x-request-id": requestId,
      },
    });
    return addSecurityHeaders(req, res, cspNonce);
  }

  // Let the CSRF route own token issuance (prevents duplicate Set-Cookie).
  const shouldSkipCsrfCookie = pathname === "/api/csrf-token";

  // CSRF: for safe methods, ensure a cookie exists; for mutations, validate.
  // This is defense-in-depth on top of SameSite cookies and reduces the risk of
  // cross-site requests triggering state changes on staff sessions.
  if (requiresCSRFProtection(req.method)) {
    if (!validateCSRFToken(req)) {
      const isApi = pathname.startsWith("/api");
      const body = isApi
        ? JSON.stringify({
            ok: false,
            error: "CSRF token validation failed",
            details: "Invalid or missing CSRF token. Refresh the page and try again.",
          })
        : "CSRF token validation failed";
      const res = new NextResponse(body, {
        status: 403,
        headers: {
          "content-type": isApi ? "application/json" : "text/plain; charset=utf-8",
          "x-request-id": requestId,
        },
      });
      return addSecurityHeaders(req, res, cspNonce);
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestId);

  if (!shouldSkipCsrfCookie) {
    const existingToken = getCSRFToken(req);
    if (!existingToken) {
      const newToken = generateCSRFToken();
      setCSRFCookie(res, newToken, req);
    }
  }

  // Staff session correlation (P1 security): ensure a stable session id cookie exists.
  const authtoken = req.cookies.get("authtoken")?.value;
  const sessionId = req.cookies.get("stacksos_session_id")?.value;
  if (authtoken && !sessionId && (pathname.startsWith("/staff") || pathname.startsWith("/api/evergreen"))) {
    res.cookies.set("stacksos_session_id", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: isCookieSecure(req),
      maxAge: 60 * 60 * 8,
      path: "/",
    });
  }

  return addSecurityHeaders(req, res, cspNonce);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
