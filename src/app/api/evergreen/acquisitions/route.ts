import { NextRequest } from "next/server";

import { GET as acquisitionsGet } from "./_handlers/get";
import { POST as acquisitionsPost } from "./_handlers/post";
import { z as _z } from "zod";

// Thin wrapper: the large handlers live in `_handlers/` so the route entrypoint
// stays navigable and can be split into sub-routes over time.
export async function GET(req: NextRequest) {
  return acquisitionsGet(req);
}

export async function POST(req: NextRequest) {
  return acquisitionsPost(req);
}
