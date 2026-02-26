import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";

import { logAuditEvent } from "@/lib/audit";
import { errorResponse, getRequestMeta, successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { imageExtForMime, parsePositiveInt } from "@/lib/upload-utils";
import { z as _z } from "zod";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "covers");
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTS = new Set(["jpg", "png", "gif", "webp"]);

export async function POST(request: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(request);

  try {
    const { actor } = await requirePermissions(["STAFF_LOGIN"]);

    const formData = await request.formData();
    const file = formData.get("file");
    const recordIdRaw = formData.get("recordId");

    if (!(file instanceof File)) {
      return errorResponse("No file provided", 400);
    }

    const recordId = parsePositiveInt(recordIdRaw);
    if (!recordId) {
      return errorResponse("Invalid recordId", 400);
    }

    const ext = imageExtForMime(file.type);
    if (!ext || !ALLOWED_EXTS.has(ext)) {
      return errorResponse("Invalid file type. Only JPG, PNG, GIF, and WEBP are allowed.", 400);
    }

    if (file.size > MAX_BYTES) {
      return errorResponse("File too large. Maximum size is 5MB.", 400);
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const timestamp = Date.now();
    const suffix = crypto.randomUUID().slice(0, 8);
    const filename = `record-${recordId}-${timestamp}-${suffix}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    const publicUrl = `/uploads/covers/${filename}`;

    await logAuditEvent({
      action: "catalog.cover.upload",
      entity: "record",
      entityId: recordId,
      status: "success",
      actor,
      ip,
      userAgent,
      requestId,
      details: {
        filename,
        fileSize: file.size,
        fileType: file.type,
      },
    });

    return successResponse({ url: publicUrl, filename });
  } catch (error) {
    return serverErrorResponse(error, "Upload cover POST", request);
  }
}
