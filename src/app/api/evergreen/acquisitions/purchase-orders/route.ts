import { NextRequest } from "next/server";

import { handleAcquisitionsGet } from "../_handlers/get";
import { handleAcquisitionsPost } from "../_handlers/post";
import { z as _z } from "zod";

// GET list POs, or GET details when `?id=` is provided.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  return handleAcquisitionsGet(req, { action: id ? "po" : "orders", id });
}

// Create a PO (body does not need `action`; it is implied by this route).
export async function POST(req: NextRequest) {
  return handleAcquisitionsPost(req, "create_po");
}
