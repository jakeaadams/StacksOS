import { NextRequest, NextResponse } from "next/server";
import { callOpenSRF, serverErrorResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const response = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.org_tree.retrieve"
    );
    return NextResponse.json(response);
  } catch (error) {
    return serverErrorResponse(error, "Orgs API", req);
  }
}
