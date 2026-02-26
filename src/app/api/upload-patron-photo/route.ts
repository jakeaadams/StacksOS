import { NextRequest } from "next/server";

import {
  addPatronPhotoDeprecationHeaders,
  patronPhotosGet,
  patronPhotosPost,
} from "@/lib/patron-photos-api";
import { z as _z } from "zod";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const res = await patronPhotosPost(request);
  return addPatronPhotoDeprecationHeaders(res);
}

export async function GET(request: NextRequest) {
  const res = await patronPhotosGet(request);
  return addPatronPhotoDeprecationHeaders(res);
}
