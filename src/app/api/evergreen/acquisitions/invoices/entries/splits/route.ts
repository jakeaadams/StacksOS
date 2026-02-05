import { NextRequest } from "next/server";

import { handleAcquisitionsPost } from "../../../_handlers/post";

export async function POST(req: NextRequest) {
  return handleAcquisitionsPost(req, "set_invoice_entry_splits");
}

