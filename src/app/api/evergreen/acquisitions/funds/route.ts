import { NextRequest } from "next/server";
import { callOpenSRF, successResponse, errorResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { z } from "zod";

interface FundSummary {
  allocation_total: number;
  spent_total: number;
  encumbrance_total: number;
  debit_total: number;
  balance: number;
}

interface FundRecord {
  id: number;
  name?: string;
  code?: string;
  year?: number;
  org?: { id: number; shortname?: string; name?: string } | number;
  currency_type?: string;
  active?: string | boolean;
  rollover?: string | boolean;
  propagate?: string | boolean;
  balance_warning_percent?: number;
  balance_stop_percent?: number;
  ilsevent?: unknown;
}

interface AllocationRecord {
  id: number;
  amount: string | number;
  note?: string;
  create_time?: string;
  funding_source?: { id: number; name?: string } | number;
  allocator?: number;
  ilsevent?: unknown;
}

interface TransferRecord {
  id: number;
  src_fund: number;
  dest_fund: number;
  amount: string | number;
  note?: string;
  transfer_time?: string;
  transfer_user?: number;
  ilsevent?: unknown;
}

const fundsPostSchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .passthrough();

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const id = searchParams.get("id");
  const year = searchParams.get("year");
  const orgId = searchParams.get("org_id");
  const includeInactive = searchParams.get("include_inactive") === "true";

  try {
    const { authtoken } = await requirePermissions(["VIEW_FUND"]);
    logger.debug(
      {
        route: "api.evergreen.acquisitions.funds",
        id,
        year,
        orgId: orgId ? parseInt(orgId, 10) : undefined,
      },
      "Funds GET"
    );

    if (id) {
      const fundId = parseInt(id, 10);
      const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund.retrieve", [
        authtoken,
        fundId,
        { flesh: 1, flesh_fields: { acqf: ["org", "currency_type"] } },
      ]);

      const fund = response?.payload?.[0] as FundRecord | undefined;
      if (!fund || fund.ilsevent) {
        return errorResponse("Fund not found", 404);
      }

      let summary: FundSummary = {
        allocation_total: 0,
        spent_total: 0,
        encumbrance_total: 0,
        debit_total: 0,
        balance: 0,
      };
      try {
        const summaryResponse = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.fund.summary.retrieve",
          [authtoken, fundId]
        );
        const summaryData = summaryResponse?.payload?.[0];
        if (summaryData && !summaryData.ilsevent) {
          summary = {
            allocation_total: parseFloat(summaryData.allocation_total) || 0,
            spent_total: parseFloat(summaryData.spent_total) || 0,
            encumbrance_total: parseFloat(summaryData.encumbrance_total) || 0,
            debit_total: parseFloat(summaryData.debit_total) || 0,
            balance: parseFloat(summaryData.balance) || 0,
          };
        }
      } catch {
        logger.warn({ fundId }, "Could not retrieve fund summary");
      }

      let allocations: Array<{
        id: number;
        amount: number;
        note: string | null;
        createTime: string;
        fundingSourceId: number;
        fundingSourceName: string;
        allocator: number;
      }> = [];
      try {
        const allocResponse = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.fund_allocation.search",
          [authtoken, { fund: fundId }, { flesh: 1, flesh_fields: { acqfa: ["funding_source"] } }]
        );
        const allocPayload = allocResponse?.payload || [];
        const allocList = Array.isArray(allocPayload?.[0]) ? allocPayload[0] : allocPayload;
        allocations = (Array.isArray(allocList) ? allocList : [])
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
            fundingSourceId:
              typeof a.funding_source === "object"
                ? (a.funding_source?.id ?? 0)
                : (a.funding_source ?? 0),
            fundingSourceName:
              typeof a.funding_source === "object" ? a.funding_source?.name || "" : "",
            allocator: a.allocator ?? 0,
          }));
      } catch {
        logger.warn({ fundId }, "Could not retrieve fund allocations");
      }

      let transfers: Array<{
        id: number;
        sourceFund: number;
        destFund: number;
        amount: number;
        note: string | null;
        transferTime: string;
        transferUser: number;
      }> = [];
      try {
        const transferResponse = await callOpenSRF(
          "open-ils.acq",
          "open-ils.acq.fund_transfer.search",
          [authtoken, { "-or": [{ src_fund: fundId }, { dest_fund: fundId }] }]
        );
        const transferPayload = transferResponse?.payload || [];
        const transferList = Array.isArray(transferPayload?.[0])
          ? transferPayload[0]
          : transferPayload;
        transfers = (Array.isArray(transferList) ? transferList : [])
          .filter(
            (t: unknown): t is TransferRecord =>
              t !== null &&
              typeof t === "object" &&
              !("ilsevent" in t && (t as TransferRecord).ilsevent)
          )
          .map((t: TransferRecord) => ({
            id: t.id,
            sourceFund: t.src_fund,
            destFund: t.dest_fund,
            amount: parseFloat(String(t.amount)) || 0,
            note: t.note || null,
            transferTime: t.transfer_time || "",
            transferUser: t.transfer_user ?? 0,
          }));
      } catch {
        logger.warn({ fundId }, "Could not retrieve fund transfers");
      }

      return successResponse({
        fund: {
          id: fund.id,
          name: fund.name,
          code: fund.code,
          year: fund.year,
          org: typeof fund.org === "object" ? fund.org?.id : fund.org,
          orgName: typeof fund.org === "object" ? fund.org?.shortname || fund.org?.name : null,
          currency: fund.currency_type || "USD",
          active: fund.active === "t" || fund.active === true,
          rollover: fund.rollover === "t" || fund.rollover === true,
          propagate: fund.propagate === "t" || fund.propagate === true,
          balanceWarningPercent: fund.balance_warning_percent,
          balanceStopPercent: fund.balance_stop_percent,
        },
        summary,
        allocations,
        transfers,
      });
    }

    const searchCriteria: Record<string, any> = {};
    if (!includeInactive) searchCriteria.active = "t";
    if (year) searchCriteria.year = parseInt(year, 10);
    if (orgId) searchCriteria.org = parseInt(orgId, 10);

    const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund.org.retrieve", [
      authtoken,
      searchCriteria,
      { limit: 500, limit_perm: "VIEW_FUND" },
    ]);
    const fundsPayload = response?.payload || [];
    const funds = Array.isArray(fundsPayload?.[0]) ? fundsPayload[0] : fundsPayload;

    const fundSummaries = new Map<number, FundSummary>();
    for (const fund of Array.isArray(funds) ? funds : []) {
      if (fund && !fund.ilsevent) {
        try {
          const summaryResponse = await callOpenSRF(
            "open-ils.acq",
            "open-ils.acq.fund.summary.retrieve",
            [authtoken, fund.id]
          );
          const summaryData = summaryResponse?.payload?.[0];
          if (summaryData && !summaryData.ilsevent) {
            fundSummaries.set(fund.id, {
              allocation_total: parseFloat(summaryData.allocation_total) || 0,
              spent_total: parseFloat(summaryData.spent_total) || 0,
              encumbrance_total: parseFloat(summaryData.encumbrance_total) || 0,
              debit_total: parseFloat(summaryData.debit_total) || 0,
              balance: parseFloat(summaryData.balance) || 0,
            });
          }
        } catch {
          // Skip summary for this fund
        }
      }
    }

    const mappedFunds = (Array.isArray(funds) ? funds : [])
      .filter(
        (f: unknown): f is FundRecord =>
          f !== null && typeof f === "object" && !("ilsevent" in f && (f as FundRecord).ilsevent)
      )
      .map((f: FundRecord) => {
        const summary = fundSummaries.get(f.id) || {
          allocation_total: 0,
          spent_total: 0,
          encumbrance_total: 0,
          debit_total: 0,
          balance: 0,
        };
        return {
          id: f.id,
          name: f.name || "Unknown",
          code: f.code || "",
          year: f.year,
          org: typeof f.org === "object" ? f.org?.id : f.org,
          orgName: typeof f.org === "object" ? f.org?.shortname : null,
          currency: f.currency_type || "USD",
          active: f.active === "t" || f.active === true,
          rollover: f.rollover === "t" || f.rollover === true,
          allocated: summary.allocation_total,
          spent: summary.spent_total,
          encumbered: summary.encumbrance_total,
          balance: summary.balance,
        };
      });

    return successResponse({ funds: mappedFunds });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Funds GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["ADMIN_FUND"]);
    const body = fundsPostSchema.parse(await req.json());
    const { action } = body;
    logger.debug({ route: "api.evergreen.acquisitions.funds", action }, "Funds POST");

    switch (action) {
      case "create": {
        const {
          name,
          code,
          year,
          org,
          currency,
          rollover,
          propagate,
          balanceWarningPercent,
          balanceStopPercent,
        } = body;
        if (!name || !code || !year || !org) {
          return errorResponse("Name, code, year, and org are required", 400);
        }
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund.create", [
          authtoken,
          {
            name,
            code,
            year: parseInt(String(year), 10),
            org: parseInt(String(org), 10),
            currency_type: currency || "USD",
            active: "t",
            rollover: rollover ? "t" : "f",
            propagate: propagate ? "t" : "f",
            balance_warning_percent: balanceWarningPercent || null,
            balance_stop_percent: balanceStopPercent || null,
          },
        ]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to create fund", 400);
        }
        return successResponse({ fund: result, message: "Fund created successfully" });
      }

      case "update": {
        const {
          id,
          name,
          code,
          active,
          rollover,
          propagate,
          balanceWarningPercent,
          balanceStopPercent,
        } = body;
        if (!id) {
          return errorResponse("Fund ID required", 400);
        }
        const getResponse = await callOpenSRF("open-ils.acq", "open-ils.acq.fund.retrieve", [
          authtoken,
          parseInt(String(id), 10),
        ]);
        const existingFund = getResponse?.payload?.[0];
        if (!existingFund || existingFund.ilsevent) {
          return errorResponse("Fund not found", 404);
        }
        if (name !== undefined) existingFund.name = name;
        if (code !== undefined) existingFund.code = code;
        if (active !== undefined) existingFund.active = active ? "t" : "f";
        if (rollover !== undefined) existingFund.rollover = rollover ? "t" : "f";
        if (propagate !== undefined) existingFund.propagate = propagate ? "t" : "f";
        if (balanceWarningPercent !== undefined)
          existingFund.balance_warning_percent = balanceWarningPercent;
        if (balanceStopPercent !== undefined)
          existingFund.balance_stop_percent = balanceStopPercent;
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund.update", [
          authtoken,
          existingFund,
        ]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to update fund", 400);
        }
        return successResponse({ fund: result, message: "Fund updated successfully" });
      }

      case "delete": {
        const { id } = body;
        if (!id) {
          return errorResponse("Fund ID required", 400);
        }
        const response = await callOpenSRF("open-ils.acq", "open-ils.acq.fund.delete", [
          authtoken,
          parseInt(String(id), 10),
        ]);
        const result = response?.payload?.[0];
        if (result?.ilsevent) {
          return errorResponse(result.textcode || "Failed to delete fund", 400);
        }
        return successResponse({ deleted: true, message: "Fund deleted successfully" });
      }

      default:
        return errorResponse("Invalid action. Use create, update, or delete.", 400);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AuthenticationError") {
      return errorResponse("Authentication required", 401);
    }
    return serverErrorResponse(err, "Funds POST", req);
  }
}
