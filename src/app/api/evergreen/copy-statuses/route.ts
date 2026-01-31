import {
  fmBoolean,
  getCopyStatuses,
  requireAuthToken,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";

function toNumber(value: any): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toString(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof (value as any).name === "string") return (value as any).name;
    if (typeof (value as any).label === "string") return (value as any).label;
  }
  return String(value ?? "");
}

export async function GET() {
  try {
    // Gate config visibility behind an authenticated session.
    await requireAuthToken();

    const raw = await getCopyStatuses();
    const rows = Array.isArray(raw) ? raw : [];

    const statuses = rows
      .map((s: any) => ({
        id: toNumber(s?.id),
        name: toString(s?.name ?? s?.label),
        holdable: fmBoolean(s, "holdable"),
        opacVisible: fmBoolean(s, "opac_visible"),
        copyActive: fmBoolean(s, "copy_active"),
        isAvailable: fmBoolean(s, "is_available"),
        restrictCopyDelete: fmBoolean(s, "restrict_copy_delete"),
        hopelessProne: fmBoolean(s, "hopeless_prone"),
      }))
      .filter((s: any) => s.id > 0 && s.name.trim().length > 0)
      .sort((a: any, b: any) => a.id - b.id);

    return successResponse({ statuses });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/evergreen/copy-statuses");
  }
}

