import { callOpenSRF } from "@/lib/api";
import { hashPassword, hashPasswordFromDigest, passwordDigest } from "@/lib/password";
import { getTenantConfig } from "@/lib/tenant/config";
import { isPasskeyConfigured } from "@/lib/passkey-secret";

export type PasskeyRpConfig = {
  origin: string;
  rpID: string;
  rpName: string;
};

export type OpacAuthSuccess = {
  authtoken: string;
  patron: {
    id: number;
    firstName: string;
    lastName: string;
    email?: string;
    cardNumber: string;
    homeLibrary: number | null;
  };
};

function envEnabled(value: string | undefined): boolean {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function envDisabled(value: string | undefined): boolean {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off"
  );
}

export function isPasskeyFeatureEnabled(): boolean {
  const flag = process.env.STACKSOS_OPAC_PASSKEYS_ENABLED;
  if (flag && envDisabled(flag)) return false;
  if (flag && envEnabled(flag)) return isPasskeyConfigured();
  return isPasskeyConfigured();
}

export function normalizeAuthIdentifier(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "");
}

function deriveOriginFromRequest(req: Request): string {
  const forcedOrigin = String(process.env.STACKSOS_PASSKEY_EXPECTED_ORIGIN || "").trim();
  if (forcedOrigin) return forcedOrigin;

  const forwardedProto = String(req.headers.get("x-forwarded-proto") || "").trim();
  const forwardedHost = String(
    req.headers.get("x-forwarded-host") || req.headers.get("host") || ""
  ).trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(req.url).origin;
}

export function getPasskeyRpConfig(req: Request): PasskeyRpConfig {
  const origin = deriveOriginFromRequest(req);
  const explicitRpId = String(process.env.STACKSOS_PASSKEY_RP_ID || "").trim();
  const rpID = explicitRpId || new URL(origin).hostname;
  const explicitRpName = String(process.env.STACKSOS_PASSKEY_RP_NAME || "").trim();
  const tenantName = getTenantConfig().displayName;
  const rpName = explicitRpName || tenantName || "StacksOS Library";
  return { origin, rpID, rpName };
}

async function authenticateWithHash(
  authIdentifier: string,
  passwordHash: string
): Promise<OpacAuthSuccess | null> {
  const authResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.complete", [
    {
      barcode: authIdentifier,
      password: passwordHash,
      type: "opac",
      agent: "stacksos-passkey",
    },
  ]);

  const authResult = authResponse?.payload?.[0];
  const authtoken = authResult?.payload?.authtoken;
  if (!(authResult?.ilsevent === 0 && typeof authtoken === "string" && authtoken.length > 0)) {
    return null;
  }

  const sessionResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.session.retrieve", [
    authtoken,
  ]);
  const user = sessionResponse?.payload?.[0];
  if (!user || user.ilsevent) return null;

  const patronId = typeof user.id === "number" ? user.id : parseInt(String(user.id ?? ""), 10);
  if (!Number.isFinite(patronId) || patronId <= 0) return null;

  return {
    authtoken,
    patron: {
      id: patronId,
      firstName: String(user.first_given_name || ""),
      lastName: String(user.family_name || ""),
      email: user.email ? String(user.email) : undefined,
      cardNumber: authIdentifier,
      homeLibrary:
        typeof user.home_ou === "number"
          ? user.home_ou
          : Number.isFinite(parseInt(String(user.home_ou ?? ""), 10))
            ? parseInt(String(user.home_ou), 10)
            : null,
    },
  };
}

export async function authenticateOpacWithPin(
  authIdentifier: string,
  pin: string
): Promise<(OpacAuthSuccess & { pinDigest: string }) | null> {
  const seedResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.init", [
    authIdentifier,
  ]);
  const seed = seedResponse?.payload?.[0];
  if (!seed) return null;

  const pinDigest = passwordDigest(pin);
  const finalHash = hashPasswordFromDigest(String(seed), pinDigest);
  const auth = await authenticateWithHash(authIdentifier, finalHash);
  if (!auth) return null;
  return { ...auth, pinDigest };
}

export async function authenticateOpacWithPinDigest(
  authIdentifier: string,
  pinDigest: string
): Promise<OpacAuthSuccess | null> {
  const seedResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.init", [
    authIdentifier,
  ]);
  const seed = seedResponse?.payload?.[0];
  if (!seed) return null;

  const finalHash = hashPasswordFromDigest(String(seed), pinDigest);
  return authenticateWithHash(authIdentifier, finalHash);
}

export async function validatePatronPin(authIdentifier: string, pin: string): Promise<boolean> {
  const seedResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.init", [
    authIdentifier,
  ]);
  const seed = seedResponse?.payload?.[0];
  if (!seed) return false;

  const finalHash = hashPassword(pin, String(seed));
  const authResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.complete", [
    {
      barcode: authIdentifier,
      password: finalHash,
      type: "opac",
      agent: "stacksos-passkey-validate",
    },
  ]);

  const authResult = authResponse?.payload?.[0];
  const authtoken = authResult?.payload?.authtoken;
  if (!(authResult?.ilsevent === 0 && typeof authtoken === "string" && authtoken.length > 0)) {
    return false;
  }

  // Validation succeeds; close this transient Evergreen auth session.
  await callOpenSRF("open-ils.auth", "open-ils.auth.session.delete", [authtoken]).catch(() => {});
  return true;
}
