import { query, querySingle } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReadingChallenge {
  id: number;
  classId: number;
  title: string;
  description: string | null;
  goalType: string;
  goalValue: number;
  startDate: string;
  endDate: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeProgress {
  id: number;
  challengeId: number;
  studentId: number;
  progressValue: number;
  completedAt: string | null;
  updatedAt: string;
}

export interface LeaderboardEntry {
  studentId: number;
  studentName: string;
  progressValue: number;
  completed: boolean;
  rank: number;
}

export interface ChallengeStats {
  totalStudents: number;
  completedCount: number;
  avgProgress: number;
  goalValue: number;
}

// ---------------------------------------------------------------------------
// Row types (snake_case from DB)
// ---------------------------------------------------------------------------

type ChallengeRow = {
  id: number;
  class_id: number;
  title: string;
  description: string | null;
  goal_type: string;
  goal_value: number;
  start_date: string;
  end_date: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

type ProgressRow = {
  id: number;
  challenge_id: number;
  student_id: number;
  progress_value: number;
  completed_at: string | null;
  updated_at: string;
};

type LeaderboardRow = {
  student_id: number;
  student_name: string;
  progress_value: number;
  completed: boolean;
  rank: number;
};

type StatsRow = {
  total_students: number;
  completed_count: number;
  avg_progress: number;
  goal_value: number;
};

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function toChallenge(row: ChallengeRow): ReadingChallenge {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    description: row.description,
    goalType: row.goal_type,
    goalValue: Number(row.goal_value),
    startDate: row.start_date,
    endDate: row.end_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProgress(row: ProgressRow): ChallengeProgress {
  return {
    id: row.id,
    challengeId: row.challenge_id,
    studentId: row.student_id,
    progressValue: Number(row.progress_value),
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function toLeaderboardEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    studentId: row.student_id,
    studentName: row.student_name,
    progressValue: Number(row.progress_value),
    completed: Boolean(row.completed),
    rank: Number(row.rank),
  };
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function createReadingChallenge(args: {
  classId: number;
  title: string;
  description?: string | null;
  goalType?: string;
  goalValue?: number;
  startDate: string;
  endDate: string;
  createdBy?: number | null;
}): Promise<ReadingChallenge> {
  const row = await querySingle<ChallengeRow>(
    `
      INSERT INTO library.k12_reading_challenges (
        class_id,
        title,
        description,
        goal_type,
        goal_value,
        start_date,
        end_date,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `,
    [
      args.classId,
      args.title.trim(),
      args.description?.trim() || null,
      args.goalType || "books",
      args.goalValue ?? 10,
      args.startDate,
      args.endDate,
      args.createdBy ?? null,
    ]
  );

  if (!row) throw new Error("Failed to create reading challenge");

  logger.info(
    { component: "k12-reading-challenges", challengeId: row.id, classId: row.class_id },
    "Reading challenge created"
  );

  return toChallenge(row);
}

export async function listClassChallenges(classId: number): Promise<ReadingChallenge[]> {
  const rows = await query<ChallengeRow>(
    `
      SELECT *
      FROM library.k12_reading_challenges
      WHERE class_id = $1
        AND end_date >= CURRENT_DATE
      ORDER BY start_date ASC, id ASC
    `,
    [classId]
  );
  return rows.map(toChallenge);
}

export async function getChallenge(challengeId: number): Promise<ReadingChallenge | null> {
  const row = await querySingle<ChallengeRow>(
    `SELECT * FROM library.k12_reading_challenges WHERE id = $1`,
    [challengeId]
  );
  if (!row) return null;
  return toChallenge(row);
}

export async function updateChallengeProgress(
  challengeId: number,
  studentId: number,
  delta: number
): Promise<ChallengeProgress> {
  // Atomic CTE: fetch goal_value and upsert progress in a single statement
  // to eliminate the TOCTOU race between separate SELECT and INSERT/UPDATE.
  const row = await querySingle<ProgressRow>(
    `
      WITH challenge AS (
        SELECT goal_value FROM library.k12_reading_challenges WHERE id = $1
      )
      INSERT INTO library.k12_challenge_progress (
        challenge_id,
        student_id,
        progress_value,
        completed_at,
        updated_at
      )
      SELECT $1, $2, GREATEST(0, $3),
        CASE WHEN $3 >= (SELECT goal_value FROM challenge) THEN NOW() ELSE NULL END,
        NOW()
      FROM challenge
      ON CONFLICT (challenge_id, student_id)
      DO UPDATE SET
        progress_value = GREATEST(0, library.k12_challenge_progress.progress_value + $3),
        completed_at = CASE
          WHEN library.k12_challenge_progress.completed_at IS NOT NULL
            THEN library.k12_challenge_progress.completed_at
          WHEN library.k12_challenge_progress.progress_value + $3 >= (SELECT goal_value FROM challenge)
            THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
      RETURNING *
    `,
    [challengeId, studentId, delta]
  );

  if (!row) throw new Error("Challenge not found or failed to update progress");
  return toProgress(row);
}

export async function getChallengeLeaderboard(challengeId: number): Promise<LeaderboardEntry[]> {
  const rows = await query<LeaderboardRow>(
    `
      SELECT
        cp.student_id,
        concat_ws(' ', s.first_name, s.last_name) AS student_name,
        cp.progress_value,
        (cp.completed_at IS NOT NULL) AS completed,
        RANK() OVER (ORDER BY cp.progress_value DESC)::int AS rank
      FROM library.k12_challenge_progress cp
      JOIN library.k12_students s ON s.id = cp.student_id
      WHERE cp.challenge_id = $1
      ORDER BY cp.progress_value DESC, s.last_name ASC, s.first_name ASC
    `,
    [challengeId]
  );
  return rows.map(toLeaderboardEntry);
}

export async function getChallengeStats(challengeId: number): Promise<ChallengeStats> {
  const row = await querySingle<StatsRow>(
    `
      WITH challenge AS (
        SELECT goal_value, class_id
        FROM library.k12_reading_challenges
        WHERE id = $1
      ),
      enrolled AS (
        SELECT COUNT(*)::int AS total_students
        FROM library.k12_students
        WHERE class_id = (SELECT class_id FROM challenge)
          AND active = TRUE
      ),
      progress_agg AS (
        SELECT
          COUNT(*) FILTER (WHERE cp.completed_at IS NOT NULL)::int AS completed_count,
          COALESCE(AVG(cp.progress_value), 0)::numeric(10,1) AS avg_progress
        FROM library.k12_challenge_progress cp
        WHERE cp.challenge_id = $1
      )
      SELECT
        e.total_students,
        pa.completed_count,
        pa.avg_progress,
        c.goal_value
      FROM enrolled e
      CROSS JOIN progress_agg pa
      CROSS JOIN challenge c
    `,
    [challengeId]
  );

  return {
    totalStudents: Number(row?.total_students || 0),
    completedCount: Number(row?.completed_count || 0),
    avgProgress: Number(row?.avg_progress || 0),
    goalValue: Number(row?.goal_value || 0),
  };
}
