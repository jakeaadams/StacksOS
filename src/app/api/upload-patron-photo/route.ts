import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requirePermissions } from "@/lib/permissions";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { query } from "@/lib/db/evergreen";


export async function POST(request: NextRequest) {
  try {
    // Require staff authentication
    await requirePermissions(["STAFF_LOGIN"]);

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const patronId = formData.get("patronId") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!patronId) {
      return NextResponse.json({ error: "No patronId provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPG, PNG, GIF, and WEBP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (2MB max for profile photos)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 2MB." },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(file.name);
    const filename = `patron-${patronId}-${timestamp}${ext}`;

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "public", "uploads", "patron-photos");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Write file
    const filepath = path.join(uploadDir, filename);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Return the public URL
    const publicUrl = `/uploads/patron-photos/${filename}`;

    // Update Evergreen database with photo URL
    try {
      await query(
        `UPDATE actor.usr SET photo_url = $1 WHERE id = $2`,
        [publicUrl, parseInt(patronId)]
      );
      logger.info({ patronId, publicUrl }, "Patron photo updated");
    } catch (dbError) {
      logger.error({ error: String(dbError) }, "Failed to update photo_url in database");
      // Still return success since file was uploaded
      return NextResponse.json({
        success: true,
        url: publicUrl,
        filename,
        warning: "Photo uploaded but failed to update database. Please contact system administrator.",
      });
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Upload error");
    return NextResponse.json(
      {
        error: "Failed to upload file",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
