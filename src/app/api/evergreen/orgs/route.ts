import { NextRequest } from "next/server";
import { callOpenSRF, serverErrorResponse, successResponse } from "@/lib/api";
import { z as _z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.org_tree.retrieve");
    return successResponse(response as any);
  } catch (error: any) {
    return serverErrorResponse(error, "Orgs API", req);
  }
}
