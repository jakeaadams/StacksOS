import {
  callOpenSRF,
  errorResponse,
  getRequestMeta,
  successResponse,
  withErrorHandling,
} from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTenantConfig } from "@/lib/tenant/config";

/**
 * Public endpoint for OPAC library information.
 *
 * Returns the Evergreen org tree without requiring staff authentication.
 * The org tree (names, addresses, hours) is public information in every
 * Evergreen installation — patrons and anonymous visitors need it for
 * the OPAC header, footer, location picker, and login screens.
 *
 * Falls back to tenant display name if Evergreen is unreachable.
 */
export const GET = withErrorHandling(async (req: Request) => {
  const { ip } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 120,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-library-info",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  const tenant = getTenantConfig();

  try {
    const response = await callOpenSRF("open-ils.actor", "open-ils.actor.org_tree.retrieve");
    return successResponse({ orgTree: response, tenantDisplayName: tenant.displayName });
  } catch {
    // Evergreen may be down — return minimal info from tenant config
    return successResponse({
      orgTree: null,
      tenantDisplayName: tenant.displayName,
    });
  }
}, "OPAC Library Info GET");
