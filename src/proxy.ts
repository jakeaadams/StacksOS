import { NextRequest, NextResponse } from "next/server";

function generateRequestId(): string {
  // Edge runtime supports crypto.randomUUID().
  // Fallback keeps a short, low-collision id for logs.
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function proxy(req: NextRequest) {
  const existing = req.headers.get("x-request-id");
  const requestId = existing && existing.trim() ? existing.trim() : generateRequestId();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
