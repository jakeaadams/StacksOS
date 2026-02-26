import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import {
  createReadingChallenge,
  listClassChallenges,
  updateChallengeProgress,
  getChallengeLeaderboard,
  getChallengeStats,
} from "@/lib/db/k12-reading-challenges";

const createChallengeSchema = z.object({
  action: z.literal("createChallenge"),
  classId: z.number().int().positive(),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  goalType: z.string().trim().optional(),
  goalValue: z.number().int().positive().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
});

const updateProgressSchema = z.object({
  action: z.literal("updateProgress"),
  challengeId: z.number().int().positive(),
  studentId: z.number().int().positive(),
  delta: z.number().int(),
});

const postBodySchema = z.discriminatedUnion("action", [
  createChallengeSchema,
  updateProgressSchema,
]);

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const { searchParams } = new URL(req.url);
    const classIdRaw = searchParams.get("classId");
    const challengeIdRaw = searchParams.get("challengeId");

    // If challengeId is provided, return leaderboard + stats
    if (challengeIdRaw) {
      const challengeId = Number.parseInt(challengeIdRaw, 10);
      if (!Number.isFinite(challengeId) || challengeId <= 0) {
        return errorResponse("challengeId must be a positive integer", 400);
      }
      const [leaderboard, stats] = await Promise.all([
        getChallengeLeaderboard(challengeId),
        getChallengeStats(challengeId),
      ]);
      return successResponse({ leaderboard, stats });
    }

    // Otherwise list challenges for a class
    if (!classIdRaw) {
      return errorResponse("classId query parameter is required", 400);
    }

    const classId = Number.parseInt(classIdRaw, 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return errorResponse("classId must be a positive integer", 400);
    }

    const challenges = await listClassChallenges(classId);
    return successResponse({ challenges });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/challenges", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);
    const actorRecord = actor && typeof actor === "object" ? (actor as Record<string, any>) : null;
    const actorId =
      actorRecord && typeof actorRecord.id === "number" ? Math.trunc(actorRecord.id) : null;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, {
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;

    if (data.action === "createChallenge") {
      const challenge = await createReadingChallenge({
        classId: data.classId,
        title: data.title,
        description: data.description,
        goalType: data.goalType,
        goalValue: data.goalValue,
        startDate: data.startDate,
        endDate: data.endDate,
        createdBy: actorId,
      });
      return successResponse({ challenge });
    }

    if (data.action === "updateProgress") {
      const progress = await updateChallengeProgress(data.challengeId, data.studentId, data.delta);
      return successResponse({ progress });
    }

    return errorResponse("Unknown action", 400);
  } catch (error) {
    return serverErrorResponse(error, "POST /api/staff/k12/challenges", req);
  }
}
