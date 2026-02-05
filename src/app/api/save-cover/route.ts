import { NextRequest } from "next/server";
import { requirePermissions } from "@/lib/permissions";
import { query, ensureCustomTables } from "@/lib/db/evergreen";
import { logAuditEvent } from "@/lib/audit";
import { errorResponse, getRequestMeta, successResponse, serverErrorResponse } from "@/lib/api";
import { parsePositiveInt } from "@/lib/upload-utils";

function isAllowedCoverUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (value.startsWith("/")) return true;

  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(request);

  try {
    // Require staff authentication
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);

    const body = (await request.json().catch(() => null)) as any;
    const recordId = parsePositiveInt(body?.recordId);
    const coverUrl = String(body?.coverUrl || "").trim();
    const source = String(body?.source || "").trim();

    if (!recordId) return errorResponse("Missing or invalid recordId", 400);
    if (!coverUrl) return errorResponse("Missing coverUrl", 400);
    if (coverUrl.length > 2048) return errorResponse("coverUrl is too long", 400);
    if (!isAllowedCoverUrl(coverUrl)) return errorResponse("Invalid coverUrl (must be http(s) or a relative path)", 400);

    // Ensure custom tables exist
    await ensureCustomTables();

    // Save cover URL to database
    await query(
      `
      INSERT INTO library.custom_covers (record_id, cover_url, source, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (record_id)
      DO UPDATE SET
        cover_url = $2,
        source = $3,
        updated_at = NOW()
      `,
      [recordId, coverUrl, source || null]
    );

    await logAuditEvent({
      action: "catalog.cover.set",
      entity: "record",
      entityId: recordId,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        source: source || null,
      },
    });

    return successResponse({ success: true, message: "Cover saved successfully", recordId, coverUrl, source: source || null });
  } catch (error) {
    return serverErrorResponse(error, "Save cover POST", request);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const recordId = parsePositiveInt(searchParams.get("recordId"));

    if (!recordId) return errorResponse("Missing or invalid recordId parameter", 400);

    // Ensure custom tables exist
    await ensureCustomTables();

    // Get custom cover for this record
    const result = await query<{ cover_url: string; source: string }>(
      `SELECT cover_url, source FROM library.custom_covers WHERE record_id = $1`,
      [recordId]
    );

    if (result.length === 0) {
      return successResponse({ success: false, message: "No custom cover found" });
    }

    return successResponse({ success: true, coverUrl: result[0].cover_url, source: result[0].source });
  } catch (error) {
    return serverErrorResponse(error, "Save cover GET", request);
  }
}
