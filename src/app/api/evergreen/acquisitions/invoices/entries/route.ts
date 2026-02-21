import { NextRequest } from "next/server";

import { handleAcquisitionsPost } from "../../_handlers/post";
import { z } from "zod";

export async function POST(req: NextRequest) {
  return handleAcquisitionsPost(req, "add_invoice_entry");
}

