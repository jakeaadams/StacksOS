import { z } from "zod";
import { NextRequest } from "next/server";
import {
  callOpenSRF,
  callPcrud,
  requireAuthToken,
  getRequestMeta,
  successResponse,
  errorResponse,
  serverErrorResponse,
  isSuccessResult,
  extractPayload,
  getErrorMessage,
  getCopyByBarcode,
  parseJsonBodyWithSchema,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit";
import { requirePermissions } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Zod schemas for offline transaction POST body
// ---------------------------------------------------------------------------

const offlineCheckoutSchema = z.object({
  type: z.literal("checkout"),
  data: z.object({
    patronBarcode: z.string().trim().min(1),
    itemBarcode: z.string().trim().min(1),
  }),
});

const offlineCheckinSchema = z.object({
  type: z.literal("checkin"),
  data: z.object({
    itemBarcode: z.string().trim().min(1),
    backdateDate: z.string().trim().optional(),
  }),
});

const offlineRenewalSchema = z.object({
  type: z.literal("renewal"),
  data: z.object({
    itemBarcode: z.string().trim().min(1),
  }),
});

const offlineInHouseUseSchema = z.object({
  type: z.literal("in_house_use"),
  data: z.object({
    itemBarcode: z.string().trim().min(1),
    orgId: z.number().int().positive().optional(),
    count: z.number().int().min(1).max(999).optional(),
  }),
});

const offlineTransactionSchema = z.discriminatedUnion("type", [
  offlineCheckoutSchema,
  offlineCheckinSchema,
  offlineRenewalSchema,
  offlineInHouseUseSchema,
]);

// GET - Download offline data (blocks, patrons, policies)
export async function GET(req: NextRequest) {
  try {
    const authtoken = await requireAuthToken();

    const searchParams = req.nextUrl.searchParams;
    const dataType = searchParams.get("type");

    switch (dataType) {
      case "blocks": {
        // Get patrons with standing penalties (blocks)
        const penaltiesResponse = await callOpenSRF(
          "open-ils.actor",
          "open-ils.actor.grp_penalty_threshold.ranged.retrieve",
          [authtoken, 1] // org unit 1 = consortium
        );

        const penalties = penaltiesResponse?.payload?.[0] || [];

        return successResponse(
          {
            blocks: [], // Would be populated from library-specific block list report
            penaltyThresholds: penalties,
          },
          "Block configuration downloaded. Note: Full block list requires library-specific report configuration."
        );
      }

      case "patrons": {
        // Download a subset of patron records for offline circulation.
        // Fetches patrons with active circulations so staff can check out
        // / check in when the network is down.
        const patronLimit = parseInt(process.env.STACKSOS_OFFLINE_PATRON_LIMIT || "500", 10);

        try {
          // Retrieve patron IDs with active circulations at the working org unit
          const orgId = searchParams.get("orgId") || "1";
          const patronIdsResponse = await callOpenSRF(
            "open-ils.actor",
            "open-ils.actor.user.retrieve_id_list_with_circs",
            [authtoken, parseInt(orgId, 10)]
          );

          const rawIds = patronIdsResponse?.payload?.[0];
          const patronIds: number[] = (Array.isArray(rawIds) ? rawIds : [])
            .map((id: unknown) => Number(id))
            .filter((id: number) => Number.isFinite(id) && id > 0)
            .slice(0, patronLimit);

          // Fetch minimal patron data for each ID
          const patrons: Array<{
            id: number;
            barcode: string;
            firstName: string;
            lastName: string;
            profile: number;
          }> = [];

          for (const pid of patronIds) {
            try {
              const userResponse = await callOpenSRF(
                "open-ils.actor",
                "open-ils.actor.user.fleshed.retrieve",
                [authtoken, pid, ["card"]]
              );
              const user = userResponse?.payload?.[0];
              if (user) {
                patrons.push({
                  id: pid,
                  barcode: user.card?.barcode || user.usrname || "",
                  firstName: user.first_given_name || "",
                  lastName: user.family_name || "",
                  profile: user.profile || 0,
                });
              }
            } catch {
              // Skip individual patron failures
            }
          }

          return successResponse(
            {
              patrons,
              count: patrons.length,
              cappedAt: patronLimit,
            },
            "Patron cache downloaded"
          );
        } catch (error) {
          logger.error(
            { error: String(error), component: "offline" },
            "Failed to fetch offline patron cache, returning empty set"
          );
          return successResponse(
            { patrons: [], count: 0, cappedAt: patronLimit },
            "Patron cache empty (Evergreen unavailable)"
          );
        }
      }

      case "policies": {
        // Get circulation rules/loan policies from Evergreen config
        try {
          // Prefer pcrud `*.atomic` methods (faster, no transaction management),
          // but fall back automatically when the Evergreen install does not
          // expose the atomic variant.
          const durationResponse = await callPcrud("open-ils.pcrud.search.crcd", [
            authtoken,
            { id: { "!=": null } },
            { flesh: 0, limit: 100 },
          ]);
          const durationsRaw = extractPayload<any>(durationResponse);
          const durations = Array.isArray(durationsRaw) ? durationsRaw : [];

          const fineResponse = await callPcrud("open-ils.pcrud.search.crrf", [
            authtoken,
            { id: { "!=": null } },
            { flesh: 0, limit: 100 },
          ]);
          const finesRaw = extractPayload<any>(fineResponse);
          const fines = Array.isArray(finesRaw) ? finesRaw : [];

          const maxFineResponse = await callPcrud("open-ils.pcrud.search.crmf", [
            authtoken,
            { id: { "!=": null } },
            { flesh: 0, limit: 100 },
          ]);
          const maxFinesRaw = extractPayload<any>(maxFineResponse);
          const maxFines = Array.isArray(maxFinesRaw) ? maxFinesRaw : [];

          // Build policies from Evergreen config
          const policies = durations.map((d) => ({
            id: d.id,
            name: d.name,
            loanPeriodDays: d.normal
              ? Math.floor(parseInt(d.normal.split(" ")[0]) / (d.normal.includes("day") ? 1 : 24))
              : 21,
            renewalLimit: d.max_renewals || 2,
            gracePeriodDays: d.grace_period
              ? Math.floor(
                  parseInt(d.grace_period.split(" ")[0]) / (d.grace_period.includes("day") ? 1 : 24)
                )
              : 0,
          }));

          // Add fine rules
          const fineRules = fines.map((f) => ({
            id: f.id,
            name: f.name,
            fineAmount: parseFloat(String(f.normal ?? f.normal_amount ?? "0.10")),
            fineInterval: f.recurrence_interval || "1 day",
          }));

          return successResponse({
            policies:
              policies.length > 0
                ? policies
                : [
                    {
                      id: 0,
                      name: "Default",
                      loanPeriodDays: 21,
                      renewalLimit: 2,
                      gracePeriodDays: 0,
                    },
                  ],
            fineRules:
              fineRules.length > 0
                ? fineRules
                : [{ id: 0, name: "Default Fine", fineAmount: 0.1, fineInterval: "1 day" }],
            maxFines: maxFines.map((m) => ({
              id: m.id,
              name: m.name,
              maxAmount: parseFloat(m.amount || "25.00"),
            })),
          });
        } catch (error) {
          const code =
            error && typeof error === "object" ? (error as Record<string, any>).code : undefined;
          if (code === "OSRF_METHOD_NOT_FOUND") {
            logger.warn(
              { route: "api.evergreen.offline", type: "policies" },
              "Offline policies not available on this Evergreen install"
            );
          } else {
            logger.error({ error: String(error) }, "Error fetching policies");
          }
          // Return safe defaults if fetch fails
          return successResponse({
            policies: [
              { id: 0, name: "Default", loanPeriodDays: 21, renewalLimit: 2, gracePeriodDays: 0 },
            ],
            fineRules: [{ id: 0, name: "Default Fine", fineAmount: 0.1, fineInterval: "1 day" }],
            maxFines: [],
            message: "Using default policies - could not fetch from Evergreen",
          });
        }
      }

      case "status": {
        // Get sync status - check connection to Evergreen
        try {
          await callOpenSRF("open-ils.actor", "open-ils.actor.org_tree.retrieve");
          return successResponse(
            {
              online: true,
            },
            "Connected to Evergreen"
          );
        } catch {
          return successResponse(
            {
              online: false,
            },
            "Cannot connect to Evergreen"
          );
        }
      }

      default:
        return errorResponse("Invalid data type", 400);
    }
  } catch (error) {
    return serverErrorResponse(error, "Offline API", req);
  }
}

// POST - Process offline transactions
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);

  try {
    const parsed = await parseJsonBodyWithSchema(req, offlineTransactionSchema);
    if (parsed instanceof Response) return parsed;
    const { type, data } = parsed;

    const TYPE_PERMS: Record<string, string[]> = {
      checkout: ["COPY_CHECKOUT"],
      checkin: ["COPY_CHECKIN"],
      renewal: ["RENEW_CIRC"],
      in_house_use: ["CREATE_IN_HOUSE_USE"],
    };

    const { authtoken, actor } = await requirePermissions(TYPE_PERMS[type] || ["STAFF_LOGIN"]);

    const rlResult = await checkRateLimit(ip || "unknown", {
      maxAttempts: 30,
      windowMs: 5 * 60 * 1000,
      endpoint: "eg-offline",
    });
    if (!rlResult.allowed)
      return errorResponse("Too many requests. Please try again later.", 429, {
        retryAfter: Math.ceil(rlResult.resetIn / 1000),
      });

    const audit = async (
      status: "success" | "failure",
      details?: Record<string, any>,
      error?: string
    ) => {
      await logAuditEvent({
        action: `offline.${type}`,
        status,
        actor,
        ip,
        userAgent,
        requestId,
        details,
        error: error || null,
      });
    };

    logger.info({ requestId, route: "api.evergreen.offline", type }, "Offline transaction");

    switch (type) {
      case "checkout": {
        const checkoutResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.checkout.full", [
          authtoken,
          { patron_barcode: data.patronBarcode, copy_barcode: data.itemBarcode },
        ]);

        const result = checkoutResponse?.payload?.[0];

        if (isSuccessResult(result) || result?.payload?.circ) {
          await audit("success", {
            patronBarcode: data.patronBarcode,
            itemBarcode: data.itemBarcode,
          });
          return successResponse(
            {
              action: "checkout",
            },
            "Checkout processed successfully"
          );
        } else {
          const message = getErrorMessage(result, "Checkout failed");
          await audit(
            "failure",
            { patronBarcode: data.patronBarcode, itemBarcode: data.itemBarcode },
            message
          );
          return errorResponse(message, 400, result);
        }
      }

      case "checkin": {
        const checkinResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.checkin", [
          authtoken,
          { copy_barcode: data.itemBarcode, backdate: data.backdateDate },
        ]);

        const result = checkinResponse?.payload?.[0];

        if (isSuccessResult(result) || result?.payload) {
          await audit("success", {
            itemBarcode: data.itemBarcode,
            backdateDate: data.backdateDate || null,
          });
          return successResponse(
            {
              action: "checkin",
            },
            "Checkin processed successfully"
          );
        } else {
          const message = getErrorMessage(result, "Checkin failed");
          await audit(
            "failure",
            { itemBarcode: data.itemBarcode, backdateDate: data.backdateDate || null },
            message
          );
          return errorResponse(message, 400, result);
        }
      }

      case "renewal": {
        const renewResponse = await callOpenSRF("open-ils.circ", "open-ils.circ.renew", [
          authtoken,
          { copy_barcode: data.itemBarcode },
        ]);

        const result = renewResponse?.payload?.[0];

        if (isSuccessResult(result) || result?.payload?.circ) {
          await audit("success", { itemBarcode: data.itemBarcode });
          return successResponse(
            {
              action: "renewal",
            },
            "Renewal processed successfully"
          );
        } else {
          const message = getErrorMessage(result, "Renewal failed");
          await audit("failure", { itemBarcode: data.itemBarcode }, message);
          return errorResponse(message, 400, result);
        }
      }

      case "in_house_use": {
        // Look up the copy by barcode to get copy ID
        const copy = await getCopyByBarcode(data.itemBarcode);

        if (!copy || copy.ilsevent) {
          return errorResponse("Item not found: " + data.itemBarcode, 404);
        }

        // Get the workstation org from session or use copy's circ_lib
        const orgId = data.orgId || copy.circ_lib;

        // Create in-house use record
        const inHouseResponse = await callOpenSRF(
          "open-ils.circ",
          "open-ils.circ.in_house_use.create",
          [authtoken, { copyid: copy.id, location: orgId, count: data.count || 1 }]
        );

        const result = inHouseResponse?.payload?.[0];

        if (result && !result.ilsevent) {
          await audit("success", { itemBarcode: data.itemBarcode, count: data.count || 1, orgId });
          return successResponse(
            {
              action: "in_house_use",
              count: data.count || 1,
            },
            `In-house use recorded for ${data.itemBarcode}`
          );
        } else {
          const message = getErrorMessage(result, "Failed to record in-house use");
          await audit(
            "failure",
            { itemBarcode: data.itemBarcode, count: data.count || 1, orgId },
            message
          );
          return errorResponse(message, 400, result);
        }
      }

      default:
        return errorResponse("Invalid transaction type", 400);
    }
  } catch (error) {
    return serverErrorResponse(error, "Offline API Process", req);
  }
}
