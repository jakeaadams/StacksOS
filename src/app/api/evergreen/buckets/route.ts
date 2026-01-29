import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";

/**
 * Record Buckets API
 * Manages biblio record buckets (containers) in Evergreen
 */

interface Bucket {
  id: number;
  name: string;
  description?: string;
  owner: number;
  ownerName?: string;
  btype: string;
  pub: boolean;
  createTime: string;
  itemCount: number;
}

async function getStaffIdFromSession(authtoken: string): Promise<number> {
  const sessionRes = await callOpenSRF(
    "open-ils.auth",
    "open-ils.auth.session.retrieve",
    [authtoken]
  );
  const session = sessionRes?.payload?.[0];
  if (!session || session.ilsevent) {
    throw new Error("Failed to get session");
  }
  return session.usrname ? session.id : session;
}

export async function GET(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);
    const staffId = await getStaffIdFromSession(authtoken);
    const searchParams = req.nextUrl.searchParams;
    const includeShared = searchParams.get("shared") === "true";

    // Fetch user's record buckets
    const bucketsRes = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.retrieve_by_class.authoritative",
      [authtoken, staffId, "biblio", "staff_client"]
    );

    const buckets: Bucket[] = [];
    const rawBuckets = bucketsRes?.payload?.[0];

    if (Array.isArray(rawBuckets)) {
      for (const b of rawBuckets) {
        let itemCount = 0;
        try {
          const itemsRes = await callOpenSRF(
            "open-ils.actor",
            "open-ils.actor.container.flesh",
            [authtoken, "biblio", b.id]
          );
          const fleshed = itemsRes?.payload?.[0];
          if (fleshed && fleshed.items) {
            itemCount = fleshed.items.length;
          }
        } catch (error) {
          // Continue with 0 count
        }

        buckets.push({
          id: b.id,
          name: b.name,
          description: b.description || "",
          owner: b.owner,
          btype: b.btype,
          pub: b.pub === "t" || b.pub === true,
          createTime: b.create_time,
          itemCount,
        });
      }
    }

    return successResponse({
      buckets,
      count: buckets.length,
    });

  } catch (error) {
    return serverErrorResponse(error, "Buckets GET", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);
    const staffId = await getStaffIdFromSession(authtoken);
    const body = await req.json();

    const { action, name, description, bucketId, recordId, pub } = body;

    if (action === "create") {
      if (!name) {
        return errorResponse("Bucket name is required", 400);
      }

      const createRes = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.container.create",
        [
          authtoken,
          "biblio",
          {
            owner: staffId,
            name,
            description: description || "",
            btype: "staff_client",
            pub: pub === true ? "t" : "f",
          },
        ]
      );

      const result = createRes?.payload?.[0];
      if (!result || result.ilsevent) {
        return errorResponse(result?.desc || "Failed to create bucket", 400);
      }

      return successResponse({
        bucket: {
          id: result,
          name,
          description: description || "",
          owner: staffId,
          btype: "staff_client",
          pub: pub === true,
          createTime: new Date().toISOString(),
          itemCount: 0,
        },
      });
    }

    if (action === "add_record") {
      if (!bucketId || !recordId) {
        return errorResponse("Bucket ID and record ID are required", 400);
      }

      const addRes = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.container.item.create",
        [
          authtoken,
          "biblio",
          {
            bucket: bucketId,
            target_biblio_record_entry: recordId,
          },
        ]
      );

      const result = addRes?.payload?.[0];
      if (!result || result.ilsevent) {
        return errorResponse(result?.desc || "Failed to add record to bucket", 400);
      }

      return successResponse({ itemId: result });
    }

    if (action === "remove_record") {
      if (!bucketId || !recordId) {
        return errorResponse("Bucket ID and record ID are required", 400);
      }

      const fleshRes = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.container.flesh",
        [authtoken, "biblio", bucketId]
      );

      const bucket = fleshRes?.payload?.[0];
      if (!bucket || !bucket.items) {
        return errorResponse("Bucket not found", 404);
      }

      const item = bucket.items.find((i: any) => i.target_biblio_record_entry === recordId);
      if (!item) {
        return errorResponse("Record not found in bucket", 404);
      }

      const deleteRes = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.container.item.delete",
        [authtoken, "biblio", item.id]
      );

      const result = deleteRes?.payload?.[0];
      if (result?.ilsevent) {
        return errorResponse(result.desc || "Failed to remove record", 400);
      }

      return successResponse({ removed: true });
    }

    return errorResponse("Invalid action", 400);

  } catch (error) {
    return serverErrorResponse(error, "Buckets POST", req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);
    const searchParams = req.nextUrl.searchParams;
    const bucketId = searchParams.get("id");

    if (!bucketId) {
      return errorResponse("Bucket ID is required", 400);
    }

    const deleteRes = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.container.delete",
      [authtoken, "biblio", parseInt(bucketId, 10)]
    );

    const result = deleteRes?.payload?.[0];
    if (result?.ilsevent) {
      return errorResponse(result.desc || "Failed to delete bucket", 400);
    }

    return successResponse({ deleted: true });

  } catch (error) {
    return serverErrorResponse(error, "Buckets DELETE", req);
  }
}
