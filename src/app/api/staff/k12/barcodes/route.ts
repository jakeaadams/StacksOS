import { NextRequest } from "next/server";
import { errorResponse, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { listK12Students } from "@/lib/db/k12-class-circulation";
import { getK12ClassById } from "@/lib/db/k12-class-circulation";

export interface BarcodeCard {
  studentId: number;
  firstName: string;
  lastName: string;
  studentIdentifier: string | null;
  className: string;
  teacherName: string;
}

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

    const [classInfo, students] = await Promise.all([
      getK12ClassById(classId),
      listK12Students(classId),
    ]);

    if (!classInfo) {
      return errorResponse("Class not found", 404);
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
