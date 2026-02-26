import { NextRequest } from "next/server";
import { callOpenSRF, requireAuthToken, successResponse, serverErrorResponse } from "@/lib/api";
import { query } from "@/lib/db/evergreen";

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

type FloatingGroup = {
  id: number;
  name: string;
};

function normalizeFloatingGroupRow(row: Record<string, any>): FloatingGroup | null {
  const id = toNumber(row.id ?? (Array.isArray(row.__p) ? row.__p[0] : null));
  const name = toString(row.name ?? (Array.isArray(row.__p) ? row.__p[1] : null)).trim();
  if (typeof id !== "number" || id <= 0 || name.length === 0) return null;
  return { id, name };
}

export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();

    try {
      const response = await callOpenSRF("open-ils.pcrud", "open-ils.pcrud.search.cfg.atomic", [
        authtoken,
        { id: { ">=": 1 } },
        { order_by: { cfg: "name" }, limit: 500 },
      ]);

      const rows = Array.isArray(response?.payload?.[0])
        ? (response.payload[0] as Record<string, any>[])
        : [];
      const groups = rows
        .map((row) => normalizeFloatingGroupRow(row))
        .filter((row): row is FloatingGroup => row !== null);

      if (groups.length > 0) {
        return successResponse({ groups });
      }
    } catch {
      // Fall through to direct SQL.
    }

    const rows = await query<{ id: number; name: string }>(
      `
        select id, name
        from config.floating_group
        where id >= 1
        order by name asc
      `
    );

    const groups = rows
      .map((row) => ({
        id: Number(row.id) || 0,
        name: String(row.name || "").trim(),
      }))
      .filter((row): row is FloatingGroup => row.id > 0 && row.name.length > 0);

    return successResponse({ groups });
  } catch (error: any) {
    return serverErrorResponse(error, "Floating groups GET", req);
  }
}
