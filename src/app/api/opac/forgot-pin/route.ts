import { NextRequest } from "next/server";
import {
  callOpenSRF,
  successResponse,
  errorResponse,
  serverErrorResponse,
  getRequestMeta,
} from "@/lib/api";
import { payloadFirst } from "@/lib/api/extract-payload";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "your registered email";
  const parts = email.split("@");
  const localPart = parts[0] ?? "";
  const domain = parts[1] ?? "";
  const maskedLocal =
    localPart.length > 2
      ? localPart[0] +
        "*".repeat(Math.min(localPart.length - 2, 5)) +
        localPart[localPart.length - 1]!
      : "**";
  const domainParts = domain.split(".");
  const maskedDomain =
    domainParts[0]!.length > 2
      ? domainParts[0]![0] + "***" + domainParts[0]![domainParts[0]!.length - 1]
      : "***";
  return maskedLocal + "@" + maskedDomain + "." + domainParts.slice(1).join(".");
}

/**
 * POST /api/opac/forgot-pin
 * Request a PIN reset email via Evergreen's password reset system
 */
const forgotPinSchema = z
  .object({
    barcode: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    username: z.string().trim().min(1).optional(),
  })
  .refine((b) => Boolean(b.barcode) || Boolean(b.email) || Boolean(b.username), {
    message: "barcode, email, or username required",
  });

export async function POST(req: NextRequest) {
  let identifier: string | undefined;
  const { ip, userAgent, requestId } = getRequestMeta(req);

  // Rate limiting - 5 attempts per 15 minutes per IP
  const rateLimit = await checkRateLimit(ip || "unknown", {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    endpoint: "forgot-pin",
  });

  if (!rateLimit.allowed) {
    const waitMinutes = Math.ceil(rateLimit.resetIn / 60000);
    logger.warn({ ip, requestId, rateLimit }, "Forgot PIN rate limit exceeded");
    return errorResponse(
      `Too many reset attempts. Please try again in ${waitMinutes} minute(s).`,
      429
    );
  }
  try {
    const body = forgotPinSchema.parse(await req.json());
    identifier = body.barcode || body.email || body.username;
    const method = body.barcode ? "barcode" : body.email ? "email" : "username";

    if (!identifier) {
      return errorResponse("Please provide your library card number or username");
    }

    const username = identifier.trim();

    // Call Evergreen's password reset request method
    // This sends an email to the patron with a reset link
    const resetResponse = await callOpenSRF(
      "open-ils.actor",
      "open-ils.actor.patron.password_reset.request",
      [username]
    );

    const result = payloadFirst(resetResponse);

    // Check for errors
    if (result?.ilsevent && result.ilsevent !== 0) {
      // SECURITY FIX: Log failed reset attempt
      await logAuditEvent({
        action: "patron.pin.reset.request",
        status: "failure",
        actor: { username },
        ip,
        userAgent,
        requestId,
        details: {
          method: method || "unknown",
          textcode: result.textcode,
        },
      });

      // Do not reveal if user exists for security
      if (result.textcode === "PATRON_NOT_FOUND" || result.textcode === "ACTOR_USR_NOT_FOUND") {
        // Return success anyway to not reveal user existence
        return successResponse({
          success: true,
          maskedEmail: "your registered email",
          message: "If an account exists with this information, reset instructions have been sent.",
        });
      }

      if (result.textcode === "PATRON_NO_EMAIL_ADDRESS") {
        return errorResponse(
          "No email address is on file for this account. Please visit the library to reset your PIN."
        );
      }

      logger.error({ error: String(result) }, "Password reset error");
      return errorResponse(
        "Unable to process your request. Please try again or contact the library.",
        500
      );
    }

    // SECURITY FIX: Log successful reset request
    await logAuditEvent({
      action: "patron.pin.reset.request",
      status: "success",
      actor: { username },
      ip,
      userAgent,
      requestId,
      details: {
        method: method || "email",
        maskedEmail: maskEmail(result?.email || ""),
      },
    });

    logger.info({ username, method }, "PIN reset request successful");

    // Success - Evergreen has sent the reset email
    return successResponse({
      success: true,
      maskedEmail: maskEmail(result?.email || ""),
      message: "PIN reset instructions have been sent to your email.",
    });
  } catch (error: unknown) {
    // SECURITY FIX: Log exception during reset
    await logAuditEvent({
      action: "patron.pin.reset.request",
      status: "failure",
      actor: { username: identifier || "unknown" },
      ip,
      userAgent,
      requestId,
      details: { error: String(error) },
    });

    logger.error({ error: String(error) }, "Forgot PIN error");
    return serverErrorResponse(error, "Forgot PIN POST", req);
  }
}
