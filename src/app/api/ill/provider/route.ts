import { NextRequest } from "next/server";
import { serverErrorResponse, successResponse } from "@/lib/api";
import { getIllSyncCounts } from "@/lib/db/ill";
import { getIllProviderStatus } from "@/lib/ill/provider";
import { requirePermissions } from "@/lib/permissions";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["STAFF_LOGIN"]);

    const provider = getIllProviderStatus();
    const counts = await getIllSyncCounts();
    const total = counts.manual + counts.pending + counts.synced + counts.failed;

    return successResponse({
      provider,
      syncCounts: {
        ...counts,
        total,
      },
    });
  } catch (error) {
    return serverErrorResponse(error, "ILL provider GET", req);
  }
}
