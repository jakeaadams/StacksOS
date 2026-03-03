import { NextRequest } from "next/server";

import { serverErrorResponse, successResponse } from "@/lib/api";
import { listEcontentConnections } from "@/lib/db/econtent-connections";
import { getEContentProviders } from "@/lib/econtent-providers";
import { getTenantId } from "@/lib/tenant/config";

type ProviderCardModel = {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  browseUrl: string;
  appUrl?: string;
  types: string[];
  color: string;
  featured: boolean;
  alwaysAvailableTitles?: number;
  supportedModes: string[];
  supportsPatronTransactions: {
    checkout: boolean;
    hold: boolean;
  };
  enabled: boolean;
  mode: string;
  source: "default" | "tenant_config";
};

export async function GET(req: NextRequest) {
  try {
    const tenantId = getTenantId();
    const [catalog, connections] = await Promise.all([
      Promise.resolve(getEContentProviders()),
      listEcontentConnections(tenantId),
    ]);

    const connectionByProvider = new Map(connections.map((row) => [row.providerId, row]));
    const providers: ProviderCardModel[] = catalog.map((provider) => {
      const connection = connectionByProvider.get(provider.id);
      const enabled = connection ? connection.enabled : provider.featured;
      const mode = connection?.mode || "linkout";
      const browseUrl = connection?.browseUrl || provider.browseUrl;
      const appUrl = connection?.appUrl || provider.appUrl;
      return {
        id: provider.id,
        name: provider.name,
        description: provider.description,
        logoUrl: provider.logoUrl,
        browseUrl,
        appUrl,
        types: provider.types,
        color: provider.color,
        featured: provider.featured,
        alwaysAvailableTitles: provider.alwaysAvailableTitles,
        supportedModes: provider.supportedModes,
        supportsPatronTransactions: {
          checkout:
            connection?.supportsCheckout !== undefined
              ? connection.supportsCheckout
              : provider.supportsPatronTransactions.checkout,
          hold:
            connection?.supportsHold !== undefined
              ? connection.supportsHold
              : provider.supportsPatronTransactions.hold,
        },
        enabled,
        mode,
        source: connection ? "tenant_config" : "default",
      };
    });

    return successResponse({
      tenantId,
      providers: providers.filter((provider) => provider.enabled),
    });
  } catch (error) {
    return serverErrorResponse(error, "GET /api/opac/econtent/providers", req);
  }
}
