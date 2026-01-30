import { NextRequest, NextResponse } from "next/server";
import { generateCSRFToken, setCSRFCookie, getCSRFToken } from "@/lib/csrf";

/**
 * GET /api/csrf-token
 * 
 * Returns a CSRF token for the client to use in subsequent requests.
 * Token is also set as an httpOnly cookie.
 */
export async function GET(request: NextRequest) {
  // Get existing token or generate new one
  let token = getCSRFToken(request);
  
  if (!token) {
    token = generateCSRFToken();
  }
  
  const response = NextResponse.json({
    ok: true,
    token,
  });
  
  // Set/refresh CSRF cookie
  setCSRFCookie(response, token, request);
  
  return response;
}
