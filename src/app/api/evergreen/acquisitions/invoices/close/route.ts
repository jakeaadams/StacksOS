import { NextRequest } from "next/server";

import { handleAcquisitionsPost } from "../../_handlers/post";

export async function POST(req: NextRequest) {
  return handleAcquisitionsPost(req, "close_invoice");
}

