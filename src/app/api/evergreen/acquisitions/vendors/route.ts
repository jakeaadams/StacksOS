import { NextRequest } from "next/server";

import { handleAcquisitionsGet } from "../_handlers/get";
import { z as _z } from "zod";

export async function GET(req: NextRequest) {
  return handleAcquisitionsGet(req, { action: "vendors" });
}
