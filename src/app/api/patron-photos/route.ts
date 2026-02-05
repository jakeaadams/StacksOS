import { NextRequest } from "next/server";
import { patronPhotosDelete, patronPhotosGet, patronPhotosPost } from "@/lib/patron-photos-api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return patronPhotosPost(request);
}

export async function GET(request: NextRequest) {
  return patronPhotosGet(request);
}

export async function DELETE(request: NextRequest) {
  return patronPhotosDelete(request);
}
