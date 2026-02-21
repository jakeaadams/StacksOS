import crypto from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";

import { logAuditEvent } from "@/lib/audit";
import { errorResponse, getRequestMeta, successResponse, serverErrorResponse } from "@/lib/api";
import { logger } from "@/lib/logger";
import { requirePermissions } from "@/lib/permissions";
import { clearPatronPhotoUrl, getPatronPhotoUrl, savePatronPhotoUrl } from "@/lib/db/evergreen";
import { imageExtForMime, parsePositiveInt } from "@/lib/upload-utils";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "patron-photos");
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTS = new Set(["jpg", "png", "gif", "webp"]);

function getUploadFile(formData: FormData): File | null {
  const file = formData.get("file") ?? formData.get("photo");
  return file instanceof File ? file : null;
}

function parsePatronId(value: unknown): number | null {
  return parsePositiveInt(value);
}

function filenameFromUrl(url: string): string | null {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  // Relative
  if (trimmed.startsWith("/uploads/patron-photos/")) {
    return path.basename(trimmed);
  }

  // Absolute
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      if (u.pathname.startsWith("/uploads/patron-photos/")) {
        return path.basename(u.pathname);
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function patronPhotosPost(request: NextRequest): Promise<Response> {
  const { ip, userAgent, requestId } = getRequestMeta(request);
  try {
    const { actor } = await requirePermissions(["VIEW_USER", "UPDATE_USER"]);

    const formData = await request.formData();
    const file = getUploadFile(formData);
    const patronId = parsePatronId(formData.get("patronId"));

    if (!file) return errorResponse("No file provided", 400);
    if (!patronId) return errorResponse("Missing or invalid patronId", 400);

    const ext = imageExtForMime(file.type);
    if (!ext || !ALLOWED_EXTS.has(ext)) {
      return errorResponse("Invalid file type. Only JPG, PNG, GIF, and WEBP are allowed.", 400);
    }

    // Validate file size (2MB max for profile photos)
    if (file.size > MAX_BYTES) return errorResponse("File too large. Maximum size is 2MB.", 400);

    // Generate unique filename
    const timestamp = Date.now();
    const suffix = crypto.randomUUID().slice(0, 8);
    const filename = `patron-${patronId}-${timestamp}-${suffix}.${ext}`;

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Write file
    const filepath = path.join(UPLOAD_DIR, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    const publicUrl = `/uploads/patron-photos/${filename}`;

    // Persist URL
    let persisted = true;
    try {
      await savePatronPhotoUrl(patronId, publicUrl, actor?.id);
      logger.info({ patronId, publicUrl }, "Patron photo saved to database");
    } catch (dbError) {
      persisted = false;
      logger.error({ error: String(dbError), patronId }, "Failed to save photo URL to database");
    }

    await logAuditEvent({
      action: "patron.photo.upload",
      entity: "patron",
      entityId: patronId,
      status: persisted ? "success" : "failure",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        filename,
        fileSize: file.size,
        fileType: file.type,
        persisted,
      },
    });

    return successResponse({
      success: true,
      url: publicUrl,
      photoUrl: publicUrl, // legacy alias (older contract used `photoUrl`)
      filename,
      ...(persisted ? {} : { warning: "Photo uploaded but database save failed. Photo may not persist." }),
    });
  } catch (error) {
    return serverErrorResponse(error, "Patron Photos POST", request);
  }
}

export async function patronPhotosGet(request: NextRequest): Promise<Response> {
  try {
    await requirePermissions(["VIEW_USER"]);

    const { searchParams } = new URL(request.url);
    const patronId = parsePositiveInt(searchParams.get("patronId"));
    if (!patronId) return errorResponse("Missing or invalid patronId", 400);

    const photoUrl = await getPatronPhotoUrl(patronId);

    return successResponse({
      success: true,
      url: photoUrl,
      photoUrl, // legacy alias
    });
  } catch (error) {
    return serverErrorResponse(error, "Patron Photos GET", request);
  }
}

export async function patronPhotosDelete(request: NextRequest): Promise<Response> {
  const { ip, userAgent, requestId } = getRequestMeta(request);
  try {
    const { actor } = await requirePermissions(["VIEW_USER", "UPDATE_USER"]);

    const { searchParams } = new URL(request.url);

    // Canonical: delete by patronId. Support legacy delete-by-filename as fallback.
    const patronId =
      parsePositiveInt(searchParams.get("patronId")) ??
      (() => {
        const filename = searchParams.get("filename") || "";
        const match = filename.match(/^patron-(\\d+)-/);
        return match ? parseInt(match[1]!, 10) : null;
      })();

    if (!patronId) return errorResponse("Missing or invalid patronId", 400);

    const photoUrl = await getPatronPhotoUrl(patronId);
    const filename = photoUrl ? filenameFromUrl(photoUrl) : null;
    const filepath = filename ? path.join(UPLOAD_DIR, path.basename(filename)) : null;

    let deletedFile = false;
    if (filepath && existsSync(filepath)) {
      await unlink(filepath);
      deletedFile = true;
    }

    await clearPatronPhotoUrl(patronId, actor?.id);

    await logAuditEvent({
      action: "patron.photo.delete",
      entity: "patron",
      entityId: patronId,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        deletedFile,
        filename: filename || null,
      },
    });

    logger.info(
      { patronId, deletedFile, filename: filename || undefined, actor: actor.id },
      "Patron photo deleted"
    );

    return successResponse({ success: true, deletedFile });
  } catch (error) {
    return serverErrorResponse(error, "Patron Photos DELETE", request);
  }
}

export function addPatronPhotoDeprecationHeaders(res: Response): Response {
  res.headers.set("Deprecation", "true");
  res.headers.set("Sunset", "Fri, 01 May 2026 00:00:00 GMT");
  res.headers.set("Link", "</api/patron-photos>; rel=\"alternate\"");
  return res;
}

