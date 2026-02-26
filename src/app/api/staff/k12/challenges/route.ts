import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, getRequestMeta, serverErrorResponse, successResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { publishDeveloperEvent } from "@/lib/developer/webhooks";
import {
  createReadingChallenge,
  listClassChallenges,
  updateChallengeProgress,
  getChallengeLeaderboard,
  getChallengeStats,
} from "@/lib/db/k12-reading-challenges";
import { getK12ClassById } from "@/lib/db/k12-class-circulation";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createChallengeSchema = z.object({
  action: z.literal("createChallenge"),
  classId: z.number().int().positive(),
  title: z.string().trim().min(1, "Title is required").max(1000),
  description: z.string().trim().optional(),
  goalType: z.enum(["books", "pages", "minutes"]).default("books"),
  goalValue: z.number().int().positive().optional(),
  startDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD format"),
  endDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD format"),
});

const updateProgressSchema = z.object({
  action: z.literal("updateProgress"),
  challengeId: z.number().int().positive(),
  studentId: z.number().int().positive(),
  delta: z.number().int().min(-100).max(10000),
});

const postBodySchema = z
  .discriminatedUnion("action", [createChallengeSchema, updateProgressSchema])
  .refine(
    (data) => {
      if (data.action !== "createChallenge") return true;
      return data.endDate >= data.startDate;
    },
    {
      message: "endDate must be on or after startDate",
      path: ["endDate"],
    }
  );

export async function GET(req: NextRequest) {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 60,
    windowMs: 5 * 60 * 1000,
    endpoint: "k12-challenges-get",
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

    // IDOR check: verify class exists and belongs to the actor's org
    const classInfo = await getK12ClassById(classId);
    if (!classInfo) {
      return errorResponse("Class not found", 404);
    }
    const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
    if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
      return errorResponse("Forbidden: class does not belong to your organization", 403);
    }

    const challenges = await listClassChallenges(classId);
    return successResponse({ challenges });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/staff/k12/challenges", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 20,
    windowMs: 5 * 60 * 1000,
    endpoint: "k12-challenges-post",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

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
      // IDOR check: verify class exists and belongs to the actor's org
      const classInfo = await getK12ClassById(data.classId);
      if (!classInfo) {
        return errorResponse("Class not found", 404);
      }
      const actorWsOu = Number.parseInt(String(actorRecord?.ws_ou ?? ""), 10);
      if (Number.isFinite(actorWsOu) && classInfo.homeOu !== actorWsOu) {
        return errorResponse("Forbidden: class does not belong to your organization", 403);
      }

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

      await logAuditEvent({
        action: "k12.reading_challenge.created",
        entity: "reading_challenge",
        entityId: challenge.id,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: {
          classId: data.classId,
          title: data.title,
          goalType: data.goalType,
          goalValue: data.goalValue,
          startDate: data.startDate,
          endDate: data.endDate,
        },
      });

      await publishDeveloperEvent({
        tenantId: process.env.STACKSOS_TENANT_ID || "default",
        eventType: "k12.reading_challenge.created",
        actorId,
        requestId,
        payload: {
          challengeId: challenge.id,
          classId: data.classId,
          title: data.title,
        },
      });

      return successResponse({ challenge });
    }

    if (data.action === "updateProgress") {
      const progress = await updateChallengeProgress(data.challengeId, data.studentId, data.delta);

      await logAuditEvent({
        action: "k12.challenge_progress.updated",
        entity: "challenge_progress",
        entityId: data.challengeId,
        status: "success",
        actor,
        ip,
        userAgent,
        requestId,
        details: {
          challengeId: data.challengeId,
          studentId: data.studentId,
          delta: data.delta,
        },
      });

      await publishDeveloperEvent({
        tenantId: process.env.STACKSOS_TENANT_ID || "default",
        eventType: "k12.challenge_progress.updated",
        actorId,
        requestId,
        payload: {
          challengeId: data.challengeId,
          studentId: data.studentId,
          delta: data.delta,
        },
      });

      return successResponse({ progress });
    }

    return errorResponse("Unknown action", 400);
  } catch (error) {
    return serverErrorResponse(error, "POST /api/staff/k12/challenges", req);
  }
}
