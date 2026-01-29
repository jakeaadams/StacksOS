import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requirePermissions } from "@/lib/permissions";
import { query } from "@/lib/db/evergreen";

/**
 * Update bibliographic record title
 * Updates the 245 field in MARC XML
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const body = await request.json();
    const { recordId, title } = body;

    if (!recordId || !title) {
      return NextResponse.json(
        { error: "Missing required fields: recordId, title" },
        { status: 400 }
      );
    }

    // Fetch current MARC XML
    const result = await query<{ marc: string }>(
      `SELECT marc FROM biblio.record_entry WHERE id = \ AND NOT deleted`,
      [recordId]
    );

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: "Record not found or deleted" },
        { status: 404 }
      );
    }

    const marcXml = result[0].marc;

    // Simple regex-based MARC update for 245
    // This handles the most common case: <subfield code="a">Title</subfield>
    const updatedMarc = marcXml.replace(
      /(<datafield tag="245"[^>]*>.*?<subfield code="a">)[^<]+(</subfield>)/s,
      `\${title.replace(/[<>&]/g, (c) => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;'
      }[c] || c))}\`
    );

    // Check if update actually happened
    if (updatedMarc === marcXml) {
      return NextResponse.json(
        {
          error: "Could not update title - 245 field not found in expected format",
          recordId,
        },
        { status: 400 }
      );
    }

    // Update the MARC record
    await query(
      `UPDATE biblio.record_entry 
       SET marc = \, 
           edit_date = NOW(), 
           editor = (SELECT id FROM actor.usr WHERE usrname = 'admin' LIMIT 1)
       WHERE id = \`,
      [updatedMarc, recordId]
    );

    // Update metabib.full_rec for search indexing
    await query(
      `UPDATE metabib.full_rec 
       SET value = \ 
       WHERE record = \ AND tag = '245' AND subfield = 'a'`,
      [title, recordId]
    );

    logger.info({ recordId, title }, "MARC title updated successfully");

    return NextResponse.json({
      success: true,
      message: "Title updated successfully",
      recordId,
      title,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Update record title error");
    return NextResponse.json(
      {
        error: "Failed to update title",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
