import { NextRequest } from "next/server";

import { handleAcquisitionsGet } from "../_handlers/get";
import { z } from "zod";

export async function GET(req: NextRequest) {
  return handleAcquisitionsGet(req, { action: "invoice_methods" });
}

