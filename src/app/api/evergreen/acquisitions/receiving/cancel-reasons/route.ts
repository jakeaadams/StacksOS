import { NextRequest } from "next/server";

import { handleAcquisitionsGet } from "../../_handlers/get";

export async function GET(req: NextRequest) {
  return handleAcquisitionsGet(req, { action: "cancel_reasons" });
}

