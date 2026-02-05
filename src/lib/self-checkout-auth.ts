import { cookies } from "next/headers";

import { callOpenSRF } from "@/lib/api";

export class SelfCheckoutAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "SelfCheckoutAuthError";
    this.status = status;
  }
}

export async function requireSelfCheckoutSession(): Promise<{
  selfCheckoutToken: string;
  patronId: number;
  user: any;
}> {
  const cookieStore = await cookies();
  const selfCheckoutToken = cookieStore.get("self_checkout_token")?.value;

  if (!selfCheckoutToken) {
    throw new SelfCheckoutAuthError("Session expired. Please scan your card again.", 401);
  }

  const sessionResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.session.retrieve", [
    selfCheckoutToken,
  ]);

  const user = sessionResponse?.payload?.[0];
  if (!user || user.ilsevent) {
    throw new SelfCheckoutAuthError("Session expired. Please scan your card again.", 401);
  }

  const patronId =
    typeof user.id === "number" ? user.id : parseInt(String(user.id ?? ""), 10);
  if (!Number.isFinite(patronId) || patronId <= 0) {
    throw new SelfCheckoutAuthError("Invalid session", 401);
  }

  return { selfCheckoutToken, patronId, user };
}

