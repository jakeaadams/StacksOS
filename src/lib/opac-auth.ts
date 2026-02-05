import { cookies } from "next/headers";

import { callOpenSRF } from "@/lib/api";

export class PatronAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "PatronAuthError";
    this.status = status;
  }
}

export async function requirePatronSession(): Promise<{
  patronToken: string;
  patronId: number;
  user: any;
}> {
  const cookieStore = await cookies();
  const patronToken = cookieStore.get("patron_authtoken")?.value;

  if (!patronToken) {
    throw new PatronAuthError("Not authenticated", 401);
  }

  const sessionResponse = await callOpenSRF("open-ils.auth", "open-ils.auth.session.retrieve", [
    patronToken,
  ]);

  const user = sessionResponse?.payload?.[0];
  if (!user || user.ilsevent) {
    throw new PatronAuthError("Session expired. Please log in again.", 401);
  }

  const patronId =
    typeof user.id === "number" ? user.id : parseInt(String(user.id ?? ""), 10);
  if (!Number.isFinite(patronId) || patronId <= 0) {
    throw new PatronAuthError("Invalid session", 401);
  }

  return { patronToken, patronId, user };
}

