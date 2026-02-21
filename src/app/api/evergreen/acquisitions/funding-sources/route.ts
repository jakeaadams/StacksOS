import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { z } from "zod";

interface FundingSourceRecord {
  id: number;
  name?: string;
  code?: string;
  owner?: { id: number; shortname?: string; name?: string } | number;
  currency_type?: string;
  ilsevent?: unknown;
}

interface CreditRecord {
  amount?: string | number;
  ilsevent?: unknown;
}

interface AllocationRecord {
  amount?: string | number;
  ilsevent?: unknown;
}

const fundingSourcesPostSchema = z.object({
  action: z.string().trim().min(1),
}).passthrough();

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const id = searchParams.get("id");
  const orgId = searchParams.get("org_id");

  try {
    const { authtoken } = await requirePermissions(["VIEW_FUNDING_SOURCE"]);
    logger.debug({ route: "api.evergreen.acquisitions.funding-sources", id, orgId: orgId ? parseInt(orgId, 10) : undefined }, "Funding Sources GET");

    if (id) {
      const sourceId = parseInt(id, 10);
      const response = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source.retrieve", [authtoken, sourceId, { flesh: 1, flesh_fields: { acqfs: ["owner", "currency_type"] } }]);
      const source = response?.payload?.[0] as FundingSourceRecord | undefined;
      if (!source || source.ilsevent) {
        return errorResponse("Funding source not found", 404);
      }

      let creditTotal = 0;
      let allocatedTotal = 0;
      try {
        const creditsResponse = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source_credit.search", [authtoken, { funding_source: sourceId }]);
        const creditsPayload = creditsResponse?.payload || [];
        const creditsList = Array.isArray(creditsPayload?.[0]) ? creditsPayload[0] : creditsPayload;
        creditTotal = (Array.isArray(creditsList) ? creditsList : [])
          .filter((c: unknown): c is CreditRecord => c !== null && typeof c === "object" && !("ilsevent" in c && (c as CreditRecord).ilsevent))
          .reduce((sum: number, c: CreditRecord) => sum + (parseFloat(String(c.amount)) || 0), 0);
      } catch {
        logger.warn({ sourceId }, "Could not retrieve credits");
      }

      try {
        const allocResponse = await callOpenSRF("open-ils.acq", "open-ils.acq.fund_allocation.search", [authtoken, { funding_source: sourceId }]);
        const allocPayload = allocResponse?.payload || [];
        const allocList = Array.isArray(allocPayload?.[0]) ? allocPayload[0] : allocPayload;
        allocatedTotal = (Array.isArray(allocList) ? allocList : [])
          .filter((a: unknown): a is AllocationRecord => a !== null && typeof a === "object" && !("ilsevent" in a && (a as AllocationRecord).ilsevent))
          .reduce((sum: number, a: AllocationRecord) => sum + (parseFloat(String(a.amount)) || 0), 0);
      } catch {
        logger.warn({ sourceId }, "Could not retrieve allocations");
      }

      return successResponse({
        fundingSource: {
          id: source.id,
          name: source.name,
          code: source.code,
          owner: typeof source.owner === "object" ? source.owner?.id : source.owner,
          ownerName: typeof source.owner === "object" ? source.owner?.shortname || source.owner?.name : null,
          currency: source.currency_type || "USD",
          creditTotal,
          allocatedTotal,
          balance: creditTotal - allocatedTotal,
        },
      });
    }

    const searchCriteria: Record<string, unknown> = {};
    if (orgId) searchCriteria.owner = parseInt(orgId, 10);

    const response = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source.org.retrieve", [authtoken, searchCriteria, { limit: 500, limit_perm: "VIEW_FUNDING_SOURCE" }]);
    const sourcesPayload = response?.payload || [];
    const sources = Array.isArray(sourcesPayload?.[0]) ? sourcesPayload[0] : sourcesPayload;

    const mappedSources = await Promise.all(
      (Array.isArray(sources) ? sources : [])
        .filter((s: unknown): s is FundingSourceRecord => s !== null && typeof s === "object" && !("ilsevent" in s && (s as FundingSourceRecord).ilsevent))
        .map(async (s: FundingSourceRecord) => {
          let creditTotal = 0;
          let allocatedTotal = 0;
          try {
            const creditsResponse = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source_credit.search", [authtoken, { funding_source: s.id }]);
            const creditsPayload = creditsResponse?.payload || [];
            const creditsList = Array.isArray(creditsPayload?.[0]) ? creditsPayload[0] : creditsPayload;
            creditTotal = (Array.isArray(creditsList) ? creditsList : [])
              .filter((c: unknown): c is CreditRecord => c !== null && typeof c === "object" && !("ilsevent" in c && (c as CreditRecord).ilsevent))
              .reduce((sum: number, c: CreditRecord) => sum + (parseFloat(String(c.amount)) || 0), 0);
          } catch {
            // skip
          }
          try {
            const allocResponse = await callOpenSRF("open-ils.acq", "open-ils.acq.fund_allocation.search", [authtoken, { funding_source: s.id }]);
            const allocPayload = allocResponse?.payload || [];
            const allocList = Array.isArray(allocPayload?.[0]) ? allocPayload[0] : allocPayload;
            allocatedTotal = (Array.isArray(allocList) ? allocList : [])
              .filter((a: unknown): a is AllocationRecord => a !== null && typeof a === "object" && !("ilsevent" in a && (a as AllocationRecord).ilsevent))
              .reduce((sum: number, a: AllocationRecord) => sum + (parseFloat(String(a.amount)) || 0), 0);
          } catch {
            // skip
          }
          return {
            id: s.id,
            name: s.name || "Unknown",
            code: s.code || "",
            owner: typeof s.owner === "object" ? s.owner?.id : s.owner,
            ownerName: typeof s.owner === "object" ? s.owner?.shortname : null,
            currency: s.currency_type || "USD",
            creditTotal,
            allocatedTotal,
            balance: creditTotal - allocatedTotal,
          };
        })
    );

    return successResponse({ fundingSources: mappedSources });
  } catch (err: any) {
    if (err && typeof err === "object" && "name" in err && err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Funding Sources GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["ADMIN_FUNDING_SOURCE"]);
    const body = fundingSourcesPostSchema.parse(await req.json());
    const { action } = body;
    logger.debug({ route: "api.evergreen.acquisitions.funding-sources", action }, "Funding Sources POST");

    switch (action) {
      case "create": {
        const { name, code, owner, currency } = body;
        if (!name || !code || !owner) {
          return errorResponse("Name, code, and owner are required", 400);
        }
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source.create", [
          authtoken,
          { name, code, owner: parseInt(String(owner), 10), currency_type: currency || "USD" },
        ]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to create funding source", 400);
        }
        return successResponse({ fundingSource: result, message: "Funding source created successfully" });
      }

      case "update": {
        const { id, name, code } = body;
        if (!id) {
          return errorResponse("Funding source ID required", 400);
        }
        const getResponse = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source.retrieve", [authtoken, parseInt(String(id), 10)]);
        const existing = getResponse?.payload?.[0];
        if (!existing || existing.ilsevent) {
          return errorResponse("Funding source not found", 404);
        }
        if (name !== undefined) existing.name = name;
        if (code !== undefined) existing.code = code;
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source.update", [authtoken, existing]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to update funding source", 400);
        }
        return successResponse({ fundingSource: result, message: "Funding source updated successfully" });
      }

      case "delete": {
        const { id } = body;
        if (!id) {
          return errorResponse("Funding source ID required", 400);
        }
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source.delete", [authtoken, parseInt(String(id), 10)]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to delete funding source", 400);
        }
        return successResponse({ deleted: true, message: "Funding source deleted successfully" });
      }

      case "add_credit": {
        const { fundingSourceId, amount, note, effectiveDate } = body;
        if (!fundingSourceId || !amount) {
          return errorResponse("Funding source ID and amount are required", 400);
        }
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.funding_source_credit.create", [
          authtoken,
          {
            funding_source: parseInt(String(fundingSourceId), 10),
            amount: parseFloat(String(amount)),
            note: note || null,
            effective_date: effectiveDate || null,
          },
        ]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to add credit", 400);
        }
        return successResponse({ credit: result, message: "Credit added successfully" });
      }

      default:
        return errorResponse("Invalid action. Use create, update, delete, or add_credit.", 400);
    }
  } catch (err: any) {
    if (err && typeof err === "object" && "name" in err && err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Funding Sources POST", req);
  }
}
