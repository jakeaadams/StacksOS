import { NextRequest } from "next/server";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { listK12Students, getK12ClassById } from "@/lib/db/k12-class-circulation";

export interface BarcodeCard {
  studentId: number;
  firstName: string;
  lastName: string;
  studentIdentifier: string | null;
  className: string;
  teacherName: string;
}

export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 60,
    windowMs: 5 * 60 * 1000,
    endpoint: "k12-barcodes-get",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;

    const { searchParams } = new URL(req.url);
    const classIdRaw = searchParams.get("classId");

    if (!classIdRaw) {
      return errorResponse("classId query parameter is required", 400);
    }

    const classId = Number.parseInt(classIdRaw, 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return errorResponse("classId must be a positive integer", 400);
    }

    const [classInfo, students] = await Promise.all([
      getK12ClassById(classId),
      listK12Students(classId),
    ]);

    if (!classInfo) {
      return errorResponse("Class not found", 404);
    }

    // IDOR check: verify class belongs to the actor's org
    const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
    if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
      return errorResponse("Forbidden: class does not belong to your organization", 403);
    }

    const cards: BarcodeCard[] = students.map((s) => ({
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      studentIdentifier: s.studentIdentifier,
      className: classInfo.name,
      teacherName: classInfo.teacherName,
    }));

    return successResponse({ cards, className: classInfo.name });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/barcodes", req);
  }
}
