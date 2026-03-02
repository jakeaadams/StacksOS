import { NextRequest, NextResponse } from "next/server";
import { patronPhotosDelete, patronPhotosGet, patronPhotosPost } from "@/lib/patron-photos-api";
import { getRequestMeta } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { z as _z } from "zod";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { ip } = getRequestMeta(request);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
    endpoint: "patron-photos",
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.resetIn / 1000)) } }
    );
  }
  return patronPhotosPost(request);
}

export async function GET(request: NextRequest) {
  return patronPhotosGet(request);
}

export async function DELETE(request: NextRequest) {
  const { ip } = getRequestMeta(request);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
    endpoint: "patron-photos",
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.resetIn / 1000)) } }
    );
  }
  return patronPhotosDelete(request);
}
