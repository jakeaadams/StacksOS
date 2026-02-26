import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { readRunDownload } from "@/lib/db/scheduled-reports";
import { z as _z } from "zod";

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function parseId(raw: string | undefined): number | null {
  const id = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

function safeFilename(name: string | null): string {
  const raw = String(name || "report.csv").trim();
  const cleaned = raw.replace(/[/\\\\]/g, "-").replace(/\"/g, "");
  return cleaned || "report.csv";
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idRaw } = await ctx.params;
    const runId = parseId(idRaw);
    if (!runId) return errorResponse("Invalid run id", 400);

    const token = req.nextUrl.searchParams.get("token");

    const row = await readRunDownload({ runId });
    if (!row.run) return errorResponse("Run not found", 404);
    if (!row.outputBytes) return errorResponse("No output available for this run", 404);

    const now = Date.now();
    const tokenHash = row.downloadTokenHash;
    const expiresAt = row.downloadExpiresAt;
    const allowViaToken = Boolean(
      token &&
      tokenHash &&
      (!expiresAt || expiresAt.getTime() > now) &&
      constantTimeEqual(sha256Hex(token), tokenHash)
    );

    if (!allowViaToken) {
      await requirePermissions(["RUN_REPORTS"]);
    }

    const encoding = row.outputEncoding || "";
    const raw = Buffer.isBuffer(row.outputBytes) ? row.outputBytes : Buffer.from(row.outputBytes);
    const bytes = encoding === "gzip" ? gunzipSync(raw) : raw;

    const filename = safeFilename(row.outputFilename);
    const contentType = row.outputContentType || "application/octet-stream";

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename=\"${filename}\"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "Scheduled reports run download GET", req);
  }
}
