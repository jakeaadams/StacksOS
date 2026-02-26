import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  parseJsonBodyWithSchema,
} from "@/lib/api";
import { getEvergreenPool } from "@/lib/db/evergreen";
import { requireSaaSAccess } from "@/lib/saas-rbac";
import { getTenantConfig } from "@/lib/tenant/config";
import { logger } from "@/lib/logger";

const MarkCompleteSchema = z
  .object({
    task_id: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    const tenantId = getTenantConfig().tenantId;
    await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      tenantId,
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: false,
    });

    const pool = getEvergreenPool();
    const result = await pool.query(
      `SELECT task_id, completed_at, completed_by, notes
       FROM library.onboarding_task_completions
       WHERE tenant_id = $1
       ORDER BY completed_at ASC`,
      [tenantId]
    );

    return successResponse({ completions: result.rows });
  } catch (error) {
    return serverErrorResponse(error, "Admin Onboarding Tasks GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = getTenantConfig().tenantId;
    const { actor } = await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      tenantId,
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: false,
    });

    const body = await parseJsonBodyWithSchema(req, MarkCompleteSchema);
    if (body instanceof Response) return body;

    const pool = getEvergreenPool();
    const actorId = actor?.id ?? null;

    const result = await pool.query(
      `INSERT INTO library.onboarding_task_completions (tenant_id, task_id, completed_at, completed_by, notes)
       VALUES ($1, $2, NOW(), $3, $4)
       ON CONFLICT (tenant_id, task_id) DO UPDATE
         SET completed_at = NOW(), completed_by = $3, notes = $4
       RETURNING id, task_id, completed_at, completed_by, notes`,
      [tenantId, body.task_id, actorId, body.notes || null]
    );

    const row = result.rows[0];
    if (!row) {
      return errorResponse("Failed to mark task as complete", 500);
    }

    logger.info({ tenantId, taskId: body.task_id, actorId }, "Onboarding task marked complete");

    return successResponse({ completion: row });
  } catch (error) {
    return serverErrorResponse(error, "Admin Onboarding Tasks POST", req);
  }
}
