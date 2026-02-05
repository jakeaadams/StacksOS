import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { callOpenSRF, errorResponse, successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import type { NoticeContext } from "@/lib/email";

const QSchema = z.object({ noticeType: z.string().min(1) }).strict();

function readDemoData(): { demoPatronBarcode?: string; demoItemBarcode?: string; orgId?: number } | null {
  try {
    const p = path.join(process.cwd(), "audit", "demo_data.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const json = JSON.parse(raw);
    return {
      demoPatronBarcode: typeof json.demoPatronBarcode === "string" ? json.demoPatronBarcode : undefined,
      demoItemBarcode: typeof json.demoItemBarcode === "string" ? json.demoItemBarcode : undefined,
      orgId: Number.isFinite(Number(json.orgId)) ? Number(json.orgId) : undefined,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { authtoken } = await requirePermissions(["STAFF_LOGIN"]);

    const noticeType = req.nextUrl.searchParams.get("notice_type") || "";
    const parsed = QSchema.safeParse({ noticeType });
    if (!parsed.success) return errorResponse("notice_type required", 400);

    const demo = readDemoData();
    const patronBarcode = demo?.demoPatronBarcode || "";
    const orgId = demo?.orgId || 1;

    if (!patronBarcode) {
      return successResponse({
        noticeType,
        context: {
          patron: { id: 0, firstName: "Sample", lastName: "Patron", email: "patron@example.org" },
          library: { name: "Library" },
          items: [{ title: "Sample Item", barcode: "000000" }],
        } satisfies Partial<NoticeContext>,
        message: "Demo data not configured; returning generic sample context.",
      } as any);
    }

    const patronRes = await callOpenSRF("open-ils.actor", "open-ils.actor.user.fleshed.retrieve_by_barcode", [
      authtoken,
      patronBarcode,
      ["card", "home_ou"],
    ]);
    const patron = patronRes?.payload?.[0];
    if (!patron || patron.ilsevent) {
      return errorResponse("Demo patron not found", 404);
    }

    const orgRes = await callOpenSRF("open-ils.actor", "open-ils.actor.org_unit.retrieve", [authtoken, orgId]);
    const org = orgRes?.payload?.[0];

    const context: NoticeContext = {
      patron: {
        id: patron.id,
        firstName: patron.first_given_name || "",
        lastName: patron.family_name || "",
        email: patron.email || "patron@example.org",
        barcode: patron.card?.barcode || patronBarcode,
      },
      library: {
        name: org?.name || "Library",
        phone: org?.phone || undefined,
        email: org?.email || undefined,
      },
      items: [
        {
          title: demo?.demoItemBarcode ? `Item ${demo.demoItemBarcode}` : "Sample Item",
          barcode: demo?.demoItemBarcode || "000000",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        },
      ],
      holds: [
        {
          id: 1,
          title: "Sample Hold Title",
          pickupLibrary: org?.name || "Library",
          shelfExpireTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      bills: [
        { id: 1, title: "Replacement fee", amount: 5.0, balance: 5.0, billedDate: new Date().toISOString().slice(0, 10) },
      ],
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      preferencesUrl: `${process.env.STACKSOS_BASE_URL || ""}/opac/account/settings`,
      unsubscribeUrl: `${process.env.STACKSOS_BASE_URL || ""}/opac/account/settings?unsubscribe=email`,
    };

    return successResponse({ noticeType, context });
  } catch (error) {
    return serverErrorResponse(error, "Notifications sample GET", req);
  }
}
