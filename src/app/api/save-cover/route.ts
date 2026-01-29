import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requirePermissions } from "@/lib/permissions";
import { query, ensureCustomTables } from "@/lib/db/evergreen";

export async function POST(request: NextRequest) {
  try {
    // Require staff authentication
    await requirePermissions(["STAFF_LOGIN"]);

    const body = await request.json();
    const { recordId, coverUrl, source } = body;

    if (!recordId || !coverUrl) {
      return NextResponse.json(
        { error: "Missing required fields: recordId, coverUrl" },
        { status: 400 }
      );
    }

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
      [parseInt(recordId), coverUrl, source]
    );

    logger.info({ recordId, coverUrl, source }, "Cover saved");

    return NextResponse.json({
      success: true,
      message: "Cover saved successfully",
      recordId,
      coverUrl,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Save cover error");
    return NextResponse.json(
      {
        error: "Failed to save cover",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get("recordId");

    if (!recordId) {
      return NextResponse.json(
        { error: "Missing recordId parameter" },
        { status: 400 }
      );
    }

    // Ensure custom tables exist
    await ensureCustomTables();

    // Get custom cover for this record
    const result = await query<{ cover_url: string; source: string }>(
      `SELECT cover_url, source FROM library.custom_covers WHERE record_id = $1`,
      [parseInt(recordId)]
    );

    if (result.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No custom cover found",
      });
    }

    return NextResponse.json({
      success: true,
      coverUrl: result[0].cover_url,
      source: result[0].source,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Get cover error");
    return NextResponse.json(
      {
        error: "Failed to get cover",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
