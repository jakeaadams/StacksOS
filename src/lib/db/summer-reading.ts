import { query, querySingle } from "@/lib/db/evergreen";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummerReadingProgram {
  id: number;
  orgUnit: number;
  programName: string;
  startDate: string;
  endDate: string;
  goalType: "books" | "pages" | "minutes";
  goalValue: number;
  badgeEnabled: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Row type (snake_case from DB)
// ---------------------------------------------------------------------------

type ProgramRow = {
  id: number;
  org_unit: number;
  program_name: string;
  start_date: string;
  end_date: string;
  goal_type: string;
  goal_value: number;
  badge_enabled: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function toProgram(row: ProgramRow): SummerReadingProgram {
  return {
    id: Number(row.id),
    orgUnit: row.org_unit,
    programName: row.program_name,
    startDate: row.start_date,
    endDate: row.end_date,
    goalType: row.goal_type as SummerReadingProgram["goalType"],
    goalValue: Number(row.goal_value),
    badgeEnabled: Boolean(row.badge_enabled),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listSummerReadingPrograms(orgUnit: number): Promise<SummerReadingProgram[]> {
  const rows = await query<ProgramRow>(
    `
      SELECT *
      FROM library.summer_reading_config
      WHERE org_unit = $1
      ORDER BY start_date DESC, id DESC
    `,
    [orgUnit]
  );
  return rows.map(toProgram);
}

export async function getSummerReadingProgram(id: number): Promise<SummerReadingProgram | null> {
  const row = await querySingle<ProgramRow>(
    `SELECT * FROM library.summer_reading_config WHERE id = $1`,
    [id]
  );
  if (!row) return null;
  return toProgram(row);
}

export async function createSummerReadingProgram(args: {
  orgUnit: number;
  programName: string;
  startDate: string;
  endDate: string;
  goalType?: string;
  goalValue?: number;
  badgeEnabled?: boolean;
}): Promise<SummerReadingProgram> {
  const row = await querySingle<ProgramRow>(
    `
      INSERT INTO library.summer_reading_config (
        org_unit, program_name, start_date, end_date,
        goal_type, goal_value, badge_enabled,
        active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), NOW())
      RETURNING *
    `,
    [
      args.orgUnit,
      args.programName.trim(),
      args.startDate,
      args.endDate,
      args.goalType || "books",
      args.goalValue ?? 10,
      args.badgeEnabled ?? false,
    ]
  );

  if (!row) throw new Error("Failed to create summer reading program");

  logger.info(
    { component: "summer-reading", programId: row.id, orgUnit: row.org_unit },
    "Summer reading program created"
  );

  return toProgram(row);
}

export async function updateSummerReadingProgram(
  id: number,
  data: {
    programName?: string;
    startDate?: string;
    endDate?: string;
    goalType?: string;
    goalValue?: number;
    badgeEnabled?: boolean;
    active?: boolean;
  }
): Promise<SummerReadingProgram | null> {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (data.programName !== undefined) {
    sets.push(`program_name = $${idx++}`);
    params.push(data.programName.trim());
  }
  if (data.startDate !== undefined) {
    sets.push(`start_date = $${idx++}`);
    params.push(data.startDate);
  }
  if (data.endDate !== undefined) {
    sets.push(`end_date = $${idx++}`);
    params.push(data.endDate);
  }
  if (data.goalType !== undefined) {
    sets.push(`goal_type = $${idx++}`);
    params.push(data.goalType);
  }
  if (data.goalValue !== undefined) {
    sets.push(`goal_value = $${idx++}`);
    params.push(data.goalValue);
  }
  if (data.badgeEnabled !== undefined) {
    sets.push(`badge_enabled = $${idx++}`);
    params.push(data.badgeEnabled);
  }
  if (data.active !== undefined) {
    sets.push(`active = $${idx++}`);
    params.push(data.active);
  }

  if (sets.length === 0) return getSummerReadingProgram(id);

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const row = await querySingle<ProgramRow>(
    `UPDATE library.summer_reading_config SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );

  if (!row) return null;

  logger.info({ component: "summer-reading", programId: row.id }, "Summer reading program updated");

  return toProgram(row);
}

export async function deleteSummerReadingProgram(id: number): Promise<boolean> {
  const row = await querySingle<{ id: number }>(
    `DELETE FROM library.summer_reading_config WHERE id = $1 RETURNING id`,
    [id]
  );

  if (row) {
    logger.info({ component: "summer-reading", programId: id }, "Summer reading program deleted");
  }

  return !!row;
}
