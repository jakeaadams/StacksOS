import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { logger } from "@/lib/logger";
import { requirePermissions } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { serverErrorResponse } from "@/lib/api";

function serializeError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "patron-photos");

export async function POST(request: NextRequest) {
  try {
    // SECURITY FIX: Require authentication and permissions
    const { authtoken, actor } = await requirePermissions(["VIEW_USER", "UPDATE_USER"]);
    
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;
    const patronId = formData.get("patronId") as string | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    if (!patronId) {
      return NextResponse.json({ ok: false, error: "No patron ID provided" }, { status: 400 });
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Invalid file type. Use JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "File too large. Maximum 5MB." },
        { status: 400 }
      );
    }

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Generate filename with timestamp to avoid caching issues
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const timestamp = Date.now();
    const filename = `patron-${patronId}-${timestamp}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Return the public URL
    const photoUrl = `/patron-photos/${filename}`;

    // SECURITY FIX: Add audit logging
    await logAuditEvent({
      action: "patron.photo.upload",
      entity: "patron",
      entityId: parseInt(patronId, 10),
      status: "success",
      actor,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
      details: {
        filename,
        fileSize: file.size,
        fileType: file.type,
      },
    });

    logger.info(
      { patronId, filename, size: file.size, actor: actor.id },
      "Patron photo uploaded"
    );

    return NextResponse.json({
      ok: true,
      photoUrl,
      filename,
      message: "Photo uploaded successfully",
    });
  } catch (error) {
    return serverErrorResponse(error, "Patron Photos POST", request);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // SECURITY FIX: Require authentication and permissions
    const { authtoken, actor } = await requirePermissions(["VIEW_USER", "UPDATE_USER"]);
    
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    if (!filename) {
      return NextResponse.json({ ok: false, error: "No filename provided" }, { status: 400 });
    }

    // Extract patron ID from filename (format: patron-{id}-{timestamp}.{ext})
    const match = filename.match(/^patron-(\d+)-/);
    const patronId = match ? parseInt(match[1], 10) : null;

    // Security: only allow deleting from patron-photos directory
    const filepath = path.join(UPLOAD_DIR, path.basename(filename));
    
    let deleted = false;
    if (existsSync(filepath)) {
      const { unlink } = await import("fs/promises");
      await unlink(filepath);
      deleted = true;
    }

    // SECURITY FIX: Add audit logging
    if (patronId) {
      await logAuditEvent({
        action: "patron.photo.delete",
        entity: "patron",
        entityId: patronId,
        status: deleted ? "success" : "failure",
        actor,
        ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
        details: { filename },
      });
    }

    logger.info(
      { filename, deleted, actor: actor.id },
      "Patron photo delete attempt"
    );

    return NextResponse.json({ ok: true, message: "Photo deleted" });
  } catch (error) {
    return serverErrorResponse(error, "Patron Photos DELETE", request);
  }
}
