import { NextRequest } from "next/server";
import { z } from "zod";
import { callOpenSRF, errorResponse, successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import type { NoticeContext } from "@/lib/email";

const QSchema = z
  .object({
    noticeType: z.string().min(1),
    patronBarcode: z.string().trim().min(1).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    const { authtoken, actor } = await requirePermissions(["STAFF_LOGIN"]);

    const noticeType = req.nextUrl.searchParams.get("notice_type") || "";
    const patronBarcode = req.nextUrl.searchParams.get("patron_barcode") || undefined;
    const parsed = QSchema.safeParse({ noticeType, patronBarcode });
    if (!parsed.success) return errorResponse("notice_type required", 400);

    let patron: any = actor;
    if (parsed.data.patronBarcode) {
      const patronRes = await callOpenSRF(
        "open-ils.actor",
        "open-ils.actor.user.fleshed.retrieve_by_barcode",
        [authtoken, parsed.data.patronBarcode, ["card", "home_ou"]]
      );
      const found = patronRes?.payload?.[0] as any;
      if (!found || found.ilsevent) {
        return errorResponse("Patron not found for patron_barcode", 404);
      }
      patron = found;
    }

    const orgId = Number(patron?.home_ou ?? actor?.ws_ou ?? actor?.home_ou ?? 1) || 1;
    const orgRes = await callOpenSRF("open-ils.actor", "open-ils.actor.org_unit.retrieve", [
      authtoken,
      orgId,
    ]);
    const org = orgRes?.payload?.[0] as any;

    const context: NoticeContext = {
      patron: {
        id: Number(patron?.id || 0),
        firstName: String(patron?.first_given_name || ""),
        lastName: String(patron?.family_name || ""),
        email: String(
          patron?.email ||
            actor?.email ||
            process.env.STACKSOS_EMAIL_FROM ||
            "notices@invalid.local"
        ),
        barcode: String(patron?.card?.barcode || parsed.data.patronBarcode || ""),
      },
      library: {
        name: String(org?.name || "Library"),
        phone: org?.phone || undefined,
        email: org?.email || undefined,
      },
      items: [],
      holds: [],
      bills: [],
      preferencesUrl: `${process.env.STACKSOS_BASE_URL || ""}/opac/account/settings`,
      unsubscribeUrl: `${process.env.STACKSOS_BASE_URL || ""}/opac/account/settings?unsubscribe=email`,
    };

    return successResponse({
      noticeType,
      context,
      message:
        "Preview context uses live patron/library identity only. Pass patron_barcode for a specific patron context.",
    });
  } catch (error: any) {
    return serverErrorResponse(error, "Notifications sample GET", req);
  }
}
