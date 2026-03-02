import { NextRequest, NextResponse } from "next/server";

import {
  addPatronPhotoDeprecationHeaders,
  patronPhotosGet,
  patronPhotosPost,
} from "@/lib/patron-photos-api";
import { getRequestMeta } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { z as _z } from "zod";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { ip } = getRequestMeta(request);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
    endpoint: "upload-patron-photo",
  });
  if (!rate.allowed) {
    return addPatronPhotoDeprecationHeaders(
      NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.resetIn / 1000)) } }
      )
    );
  }
  const res = await patronPhotosPost(request);
  return addPatronPhotoDeprecationHeaders(res);
}

export async function GET(request: NextRequest) {
  const res = await patronPhotosGet(request);
  return addPatronPhotoDeprecationHeaders(res);
}
