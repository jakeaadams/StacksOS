import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { z } from "zod";

interface AllocationRecord {
  id: number;
  amount: string | number;
  note?: string;
  create_time?: string;
  fund?: { id: number; name?: string; code?: string } | number;
  funding_source?: { id: number; name?: string } | number;
  allocator?: number;
  ilsevent?: unknown;
}

const allocationsPostSchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const fundId = searchParams.get("fund_id");
  const fundingSourceId = searchParams.get("funding_source_id");

  try {
    const { authtoken } = await requirePermissions(["VIEW_FUND_ALLOCATION"]);
    logger.debug(
      { route: "api.evergreen.acquisitions.allocations", fundId, fundingSourceId },
      "Allocations GET"
    );

    const searchCriteria: Record<string, any> = {};
    if (fundId) searchCriteria.fund = parseInt(fundId, 10);
    if (fundingSourceId) searchCriteria.funding_source = parseInt(fundingSourceId, 10);

    const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund_allocation.search", [
      authtoken,
      searchCriteria,
      { flesh: 2, flesh_fields: { acqfa: ["fund", "funding_source"] } },
    ]);
    const allocPayload = response?.payload || [];
    const allocations = Array.isArray(allocPayload?.[0]) ? allocPayload[0] : allocPayload;

    const mappedAllocations = (Array.isArray(allocations) ? allocations : [])
      .filter(
        (a: unknown): a is AllocationRecord =>
          a !== null &&
          typeof a === "object" &&
          !("ilsevent" in a && (a as AllocationRecord).ilsevent)
      )
      .map((a: AllocationRecord) => ({
        id: a.id,
        amount: parseFloat(String(a.amount)) || 0,
        note: a.note || null,
        createTime: a.create_time || "",
        fundId: typeof a.fund === "object" ? a.fund?.id : a.fund,
        fundName: typeof a.fund === "object" ? a.fund?.name || "" : "",
        fundCode: typeof a.fund === "object" ? a.fund?.code || "" : "",
        fundingSourceId:
          typeof a.funding_source === "object" ? a.funding_source?.id : a.funding_source,
        fundingSourceName: typeof a.funding_source === "object" ? a.funding_source?.name || "" : "",
        allocator: a.allocator,
      }));

    return successResponse({ allocations: mappedAllocations });
  } catch (err: any) {
    if (err && typeof err === "object" && "name" in err && err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Allocations GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["ADMIN_FUND_ALLOCATION"]);
    const body = allocationsPostSchema.parse(await req.json());
    const { action } = body;
    logger.debug({ route: "api.evergreen.acquisitions.allocations", action }, "Allocations POST");

    switch (action) {
      case "allocate": {
        const { fundingSourceId, fundId, amount, note } = body;
        if (!fundingSourceId || !fundId || !amount) {
          return errorResponse("Funding source, fund, and amount are required", 400);
        }
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund_allocation.create", [
          authtoken,
          {
            funding_source: parseInt(String(fundingSourceId), 10),
            fund: parseInt(String(fundId), 10),
            amount: parseFloat(String(amount)),
            note: note || null,
          },
        ]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to create allocation", 400);
        }
        return successResponse({ allocation: result, message: "Allocation created successfully" });
      }

      case "transfer": {
        const { sourceFundId, destFundId, amount, note } = body;
        if (!sourceFundId || !destFundId || !amount) {
          return errorResponse("Source fund, destination fund, and amount are required", 400);
        }
        if (sourceFundId === destFundId) {
          return errorResponse("Source and destination funds must be different", 400);
        }
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund_transfer.create", [
          authtoken,
          {
            src_fund: parseInt(String(sourceFundId), 10),
            dest_fund: parseInt(String(destFundId), 10),
            amount: parseFloat(String(amount)),
            note: note || null,
          },
        ]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to create transfer", 400);
        }
        return successResponse({ transfer: result, message: "Transfer created successfully" });
      }

      case "delete_allocation": {
        const { id } = body;
        if (!id) {
          return errorResponse("Allocation ID required", 400);
        }
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund_allocation.delete", [
          authtoken,
          parseInt(String(id), 10),
        ]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to delete allocation", 400);
        }
        return successResponse({ deleted: true, message: "Allocation deleted successfully" });
      }

      default:
        return errorResponse("Invalid action. Use allocate, transfer, or delete_allocation.", 400);
    }
  } catch (err: any) {
    if (err && typeof err === "object" && "name" in err && err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Allocations POST", req);
  }
}
