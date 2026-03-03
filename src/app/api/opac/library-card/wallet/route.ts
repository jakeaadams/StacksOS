import { NextRequest } from "next/server";
import { z } from "zod";

import {
  callOpenSRF,
  errorResponse,
  getRequestMeta,
  parseJsonBodyWithSchema,
  serverErrorResponse,
  successResponse,
} from "@/lib/api";
import { logAuditEvent } from "@/lib/audit";
import { getEmailConfig, sendEmail } from "@/lib/email/provider";
import {
  buildWalletEnrollmentLink,
  getWalletCapabilities,
  type WalletPatronPayload,
} from "@/lib/opac-wallet";
import { PatronAuthError, requirePatronSession } from "@/lib/opac-auth";
import { checkRateLimit } from "@/lib/rate-limit";

const postSchema = z
  .object({
    action: z.literal("email"),
    platform: z.enum(["apple", "google", "both"]).default("both"),
  })
  .strict();

function fallbackHomeLibrary(user: unknown): string {
  if (!user || typeof user !== "object") return "Your Library";
  const record = user as Record<string, unknown>;
  const raw = record.home_ou_name || record.home_ou || "Your Library";
  return String(raw || "Your Library").trim();
}

async function getWalletPatronPayload(
  patronToken: string,
  patronId: number,
  user: unknown
): Promise<WalletPatronPayload | null> {
  const patronResponse = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.user.fleshed.retrieve",
    [patronToken, patronId, ["card", "home_ou"]]
  );
  const patron = patronResponse?.payload?.[0];
  if (!patron || patron.ilsevent) return null;

  const cardNumber = String(patron?.card?.barcode || "").trim();
  if (!cardNumber) return null;

  return {
    patronId,
    cardNumber,
    firstName: String(patron.first_given_name || "").trim() || "Patron",
    lastName: String(patron.family_name || "").trim() || "",
    homeLibrary: String(patron?.home_ou?.name || fallbackHomeLibrary(user)),
    email: String(patron.email || "").trim() || undefined,
  };
}

function buildWalletLinkSet(payload: WalletPatronPayload) {
  const apple = buildWalletEnrollmentLink("apple", payload);
  const google = buildWalletEnrollmentLink("google", payload);
  return { apple, google };
}

export async function GET(req: NextRequest) {
  try {
    const { patronToken, patronId, user } = await requirePatronSession();
    const payload = await getWalletPatronPayload(patronToken, patronId, user);
    if (!payload) {
      return errorResponse("Unable to resolve library card details for wallet enrollment.", 400);
    }

    const capabilities = getWalletCapabilities();
    const links = buildWalletLinkSet(payload);
    return successResponse({
      capabilities,
      links,
      patron: {
        cardNumber: payload.cardNumber,
        firstName: payload.firstName,
        lastName: payload.lastName,
        homeLibrary: payload.homeLibrary,
        email: payload.email || null,
      },
      configured:
        Boolean(links.apple) || Boolean(links.google)
          ? "Wallet provider links are configured."
          : "Wallet links are not configured yet for this library.",
    });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse(error.message, error.status);
    }
    return serverErrorResponse(error, "GET /api/opac/library-card/wallet", req);
  }
}

export async function POST(req: NextRequest) {
  const { ip, userAgent, requestId } = getRequestMeta(req);
  const rate = await checkRateLimit(ip || "unknown", {
    maxAttempts: 8,
    windowMs: 5 * 60 * 1000,
    endpoint: "opac-library-card-wallet",
  });
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", 429, {
      retryAfter: Math.ceil(rate.resetIn / 1000),
    });
  }

  try {
    const { patronToken, patronId, user } = await requirePatronSession();
    const parsed = await parseJsonBodyWithSchema(req, postSchema);
    if (parsed instanceof Response) return parsed;

    const payload = await getWalletPatronPayload(patronToken, patronId, user);
    if (!payload) {
      return errorResponse("Unable to resolve library card details for wallet enrollment.", 400);
    }
    if (!payload.email) {
      return errorResponse(
        "Add an email address in Account Settings before requesting wallet links.",
        400
      );
    }
    const emailConfig = getEmailConfig();
    if (emailConfig.provider === "console" || emailConfig.dryRun) {
      return errorResponse(
        "Wallet email delivery is disabled for this environment (console/dry-run email mode).",
        503
      );
    }

    const links = buildWalletLinkSet(payload);
    const selected =
      parsed.platform === "both"
        ? [links.apple, links.google].filter(Boolean)
        : [parsed.platform === "apple" ? links.apple : links.google].filter(Boolean);

    if (selected.length === 0) {
      return errorResponse("Wallet provider links are not configured by this library.", 503);
    }

    const fullName = `${payload.firstName} ${payload.lastName}`.trim();
    const listHtml = selected
      .map(
        (url) =>
          `<li style="margin:8px 0;"><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></li>`
      )
      .join("");
    const listText = selected.map((url) => `- ${url}`).join("\n");
    await sendEmail({
      to: {
        email: payload.email,
        name: fullName || undefined,
      },
      subject: `Your ${payload.homeLibrary} digital library card links`,
      html: `
        <p>Hello ${fullName || "there"},</p>
        <p>Use the links below to add your ${payload.homeLibrary} card to your wallet apps.</p>
        <ul>${listHtml}</ul>
        <p>If a link expires, request a fresh one from your account page.</p>
      `,
      text: `Hello ${fullName || "there"},\n\nUse these links to add your ${payload.homeLibrary} card to your wallet apps:\n${listText}\n\nIf a link expires, request a fresh one from your account page.`,
    });

    await logAuditEvent({
      action: "opac.wallet.email",
      entity: "wallet_link",
      entityId: String(payload.patronId),
      status: "success",
      actor: { id: payload.patronId },
      ip,
      userAgent,
      requestId,
      details: {
        platform: parsed.platform,
        sentTo: payload.email,
      },
    }).catch(() => {});

    return successResponse({ sent: true, recipient: payload.email, count: selected.length });
  } catch (error) {
    if (error instanceof PatronAuthError) {
      return errorResponse(error.message, error.status);
    }
    return serverErrorResponse(error, "POST /api/opac/library-card/wallet", req);
  }
}
