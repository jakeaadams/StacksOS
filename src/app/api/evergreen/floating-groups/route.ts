import { NextRequest } from "next/server";
import {
  callOpenSRF,
  requireAuthToken,
  successResponse,
  serverErrorResponse,
} from "@/lib/api";
import { query } from "@/lib/db/evergreen";

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
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

      const rows = Array.isArray(response?.payload?.[0]) ? (response.payload[0] as any[]) : [];
      const groups = rows
        .map((row: any) => ({
          id: toNumber(row?.id ?? row?.__p?.[0]),
          name: toString(row?.name ?? row?.__p?.[1]).trim(),
        }))
        .filter((row: any) => typeof row.id === "number" && row.name.length > 0);

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
      .filter((row) => row.id > 0 && row.name.length > 0);

    return successResponse({ groups });
  } catch (error) {
    return serverErrorResponse(error, "Floating groups GET", req);
  }
}

