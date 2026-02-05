export function parsePositiveInt(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function imageExtForMime(raw: unknown): string | null {
  const mime = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return IMAGE_MIME_TO_EXT[mime] || null;
}

