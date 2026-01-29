import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  serverErrorResponse,
} from "@/lib/api";

/**
 * GET /api/evergreen/org-tree
 * Fetch the organization tree (library branches/locations)
 */
export async function GET(req: NextRequest) {
  try {
    // Get the full org tree with addresses
    const treeResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.org_tree.retrieve"
    );

    const tree = treeResponse?.payload?.[0];

    if (!tree) {
      return successResponse({ tree: null });
    }

    // Get org unit types for reference
    const typesResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.org_types.retrieve"
    );

    const types = typesResponse?.payload?.[0] || [];

    // Recursively flesh out the tree with addresses and hours
    const fleshNode = async (node: any): Promise<any> => {
      const fleshed: any = {
        id: node.id,
        name: node.name,
        shortname: node.shortname,
        ou_type: types.find((t: any) => t.id === node.ou_type) || node.ou_type,
        parent_ou: node.parent_ou,
        email: node.email,
        phone: node.phone,
        hours_of_operation: node.hours_of_operation,
      };

      // Get addresses if available
      if (node.billing_address || node.mailing_address || node.ill_address) {
        try {
          const addrIds = [
            node.billing_address,
            node.mailing_address,
            node.ill_address,
          ].filter(Boolean);

          if (addrIds.length > 0) {
            const addrResponse = await callOpenSRF(
              "open-ils.actor",
              "open-ils.actor.org_unit.address.retrieve",
              [addrIds[0]]
            );
            const addr = addrResponse?.payload?.[0];
            if (addr && !addr.ilsevent) {
              fleshed.billing_address = addr;
            }
          }
        } catch (_error) {
          // Address fetch failed, continue without it
        }
      }

      // Process children
      if (node.children && node.children.length > 0) {
        fleshed.children = await Promise.all(
          node.children.map((child: any) => fleshNode(child))
        );
      }

      return fleshed;
    };

    const fleshedTree = await fleshNode(tree);

    return successResponse({ tree: fleshedTree, types });
  } catch (_error) {
    return serverErrorResponse(_error, "Org Tree GET", req);
  }
}
