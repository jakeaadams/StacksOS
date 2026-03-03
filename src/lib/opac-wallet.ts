import { createHmac } from "node:crypto";

import { getTenantConfig } from "@/lib/tenant/config";

export type WalletPlatform = "apple" | "google";

export interface WalletPatronPayload {
  patronId: number;
  cardNumber: string;
  firstName: string;
  lastName: string;
  homeLibrary: string;
  email?: string;
}

export interface WalletCapabilities {
  appleConfigured: boolean;
  googleConfigured: boolean;
  emailEnabled: boolean;
}

function normalizeTemplate(value: string | undefined): string | null {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

function getWalletSecret(): string | null {
  const raw =
    process.env.STACKSOS_WALLET_TOKEN_SECRET ||
    process.env.STACKSOS_PASSKEY_SECRET ||
    process.env.SESSION_SECRET ||
    "";
  const secret = String(raw).trim();
  return secret.length >= 16 ? secret : null;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function getWalletCapabilities(): WalletCapabilities {
  const appleTemplate = normalizeTemplate(process.env.STACKSOS_WALLET_APPLE_URL_TEMPLATE);
  const googleTemplate = normalizeTemplate(process.env.STACKSOS_WALLET_GOOGLE_URL_TEMPLATE);
  return {
    appleConfigured: Boolean(appleTemplate),
    googleConfigured: Boolean(googleTemplate),
    emailEnabled: Boolean(
      String(process.env.STACKSOS_EMAIL_PROVIDER || "console")
        .trim()
        .toLowerCase() !== "console"
    ),
  };
}

export function createWalletEnrollmentToken(args: WalletPatronPayload): string | null {
  const secret = getWalletSecret();
  if (!secret) return null;

  const ttlSecondsRaw = Number.parseInt(
    String(process.env.STACKSOS_WALLET_TOKEN_TTL_SECONDS || "900"),
    10
  );
  const ttlSeconds = Number.isFinite(ttlSecondsRaw)
    ? Math.max(60, Math.min(86400, ttlSecondsRaw))
    : 900;
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: String(args.patronId),
    card: args.cardNumber,
    first_name: args.firstName,
    last_name: args.lastName,
    email: args.email || "",
    home_library: args.homeLibrary,
    tenant_id: getTenantConfig().tenantId,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function applyTemplate(template: string, args: WalletPatronPayload, token: string | null): string {
  const fullName = `${args.firstName} ${args.lastName}`.trim();
  const replacements: Record<string, string> = {
    token: token || "",
    patron_id: String(args.patronId),
    card_number: args.cardNumber,
    first_name: args.firstName,
    last_name: args.lastName,
    full_name: fullName,
    email: args.email || "",
    library_name: args.homeLibrary,
    tenant_id: getTenantConfig().tenantId,
  };

  return template.replace(/\{([a-z0-9_]+)\}/gi, (_, keyRaw: string) => {
    const key = keyRaw.toLowerCase();
    return encodeURIComponent(replacements[key] || "");
  });
}

export function buildWalletEnrollmentLink(
  platform: WalletPlatform,
  args: WalletPatronPayload
): string | null {
  const template =
    platform === "apple"
      ? normalizeTemplate(process.env.STACKSOS_WALLET_APPLE_URL_TEMPLATE)
      : normalizeTemplate(process.env.STACKSOS_WALLET_GOOGLE_URL_TEMPLATE);
  if (!template) return null;
  const token = createWalletEnrollmentToken(args);
  return applyTemplate(template, args, token);
}
