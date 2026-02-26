import { NextRequest } from "next/server";
import { errorResponse, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { getClassReadingStats } from "@/lib/db/k12-class-circulation";

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const { searchParams } = new URL(req.url);
    const classIdRaw = searchParams.get("classId");

    if (!classIdRaw) {
      return errorResponse("classId query parameter is required", 400);
    }

    const classId = Number.parseInt(classIdRaw, 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return errorResponse("classId must be a positive integer", 400);
    }

    const stats = await getClassReadingStats(classId);

    return successResponse({ stats });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/stats", req);
  }
}
