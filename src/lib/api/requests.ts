import { NextRequest } from "next/server";

/**
 * Extract request metadata (IP, user agent, request ID)
 * for logging and audit purposes
 */
export function getRequestMeta(req?: NextRequest) {
  return {
    ip: req?.headers.get("x-forwarded-for") || req?.headers.get("x-real-ip") || null,
    userAgent: req?.headers.get("user-agent") || null,
    requestId: req?.headers.get("x-request-id") || null,
  };
}

/**
 * Get client IP address from request headers
 */
export function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    null
  );
}

/**
 * Get user agent from request headers
 */
export function getUserAgent(req: NextRequest): string | null {
  return req.headers.get("user-agent") || null;
}

/**
 * Get request ID from headers (for correlation)
 */
export function getRequestId(req: NextRequest): string | null {
  return req.headers.get("x-request-id") || null;
}
