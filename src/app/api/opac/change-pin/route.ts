import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit";
import { cookies } from "next/headers";
import { hashPassword } from "@/lib/password";

// POST /api/opac/change-pin - Change patron PIN
export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  try {
    const cookieStore = await cookies();
    const patronToken = cookieStore.get("patron_authtoken")?.value;

    if (!patronToken) {
      return errorResponse("Not authenticated", 401);
    }

    const { currentPin, newPin } = await req.json();

    if (!currentPin || !newPin) {
      return errorResponse("Current PIN and new PIN are required");
    }

    if (newPin.length < 4) {
      return errorResponse("New PIN must be at least 4 characters");
    }

    const sessionResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.session.retrieve",
      [patronToken]
    );

    const user = sessionResponse?.payload?.[0];
    if (!user || user.ilsevent) {
      return errorResponse("Session expired", 401);
    }

    const seedResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.init",
      [user.usrname]
    );

    const seed = seedResponse?.payload?.[0];
    if (!seed) {
      return errorResponse("Authentication error", 500);
    }

    const currentHash = hashPassword(currentPin, seed);

    const verifyResponse = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.verify",
      [{
        username: user.usrname,
        password: currentHash,
        type: "opac",
      }]
    );

    const verifyResult = verifyResponse?.payload?.[0];
    if (!verifyResult || verifyResult.ilsevent !== 0) {
      await logAuditEvent({
        action: "patron.pin.change",
        entity: "patron",
        entityId: user.id,
        status: "failure",
        actor: { id: user.id, username: user.usrname },
        ip,
        userAgent,
        requestId,
        details: { reason: "incorrect_current_pin" },
      });
      
      return errorResponse("Current PIN is incorrect");
    }

    const updateResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.user.password",
      [patronToken, newPin, currentPin]
    );

    const updateResult = updateResponse?.payload?.[0];

    if (updateResult?.ilsevent && updateResult.ilsevent !== 0) {
      logger.error({ error: String(updateResult) }, "PIN change error");
      
      await logAuditEvent({
        action: "patron.pin.change",
        entity: "patron",
        entityId: user.id,
        status: "failure",
        actor: { id: user.id, username: user.usrname },
        ip,
        userAgent,
        requestId,
        details: { reason: updateResult.desc },
      });
      
      return errorResponse(updateResult.desc || "Failed to change PIN", 500);
    }

    await logAuditEvent({
      action: "patron.pin.change",
      entity: "patron",
      entityId: user.id,
      status: "success",
      actor: { id: user.id, username: user.usrname },
      ip,
      userAgent,
      requestId,
    });

    logger.info({ patronId: user.id, username: user.usrname }, "PIN changed successfully");

    return successResponse({ success: true, message: "PIN changed successfully" });
  } catch (error) {
    logger.error({ error: String(error) }, "Error changing PIN");
    return serverErrorResponse(error, "OPAC Change PIN POST", req);
  }
}
