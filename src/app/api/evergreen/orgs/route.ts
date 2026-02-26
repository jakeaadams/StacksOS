import { NextRequest } from "next/server";
import { callOpenSRF, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { z as _z } from "zod";

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);
    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.org_tree.retrieve");
    return successResponse(response);
  } catch (error: unknown) {
    return serverErrorResponse(error, "Orgs API", req);
  }
}
