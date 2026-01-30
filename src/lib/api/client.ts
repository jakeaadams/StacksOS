/**
 * OpenSRF Gateway Client
 * The ONE place that handles all Evergreen API calls
 */

import { cookies } from "next/headers";
import { decodeOpenSRFResponse } from "./fieldmapper";
import type { OpenSRFResponse, OpenSRFEvent } from "./types";
import { logger } from "@/lib/logger";

function resolveEvergreenBaseUrl(): string {
  const raw = process.env.EVERGREEN_BASE_URL;
  if (raw && raw.trim()) return raw.trim();
  throw new Error("EVERGREEN_BASE_URL is not set. Configure it in .env.local/.env.production.");
}

const EVERGREEN_BASE = resolveEvergreenBaseUrl();

// ============================================================================
// Core OpenSRF Gateway
// ============================================================================

/**
 * Call OpenSRF gateway - the ONLY function that makes direct Evergreen calls
 */
export async function callOpenSRF<T = any>(
  service: string,
  method: string,
  params: any[] = []
): Promise<OpenSRFResponse<T>> {
  const url = `${EVERGREEN_BASE.replace(/\/+$/, "")}/osrf-gateway-v1`;

  // Use POST body instead of querystring to avoid leaking sensitive values
  // (e.g. authtokens, password hashes) into intermediary access logs.
  const body = new URLSearchParams({ service, method });
  for (const param of params) {
    body.append("param", JSON.stringify(param));
  }

  const timeoutMsRaw = process.env.STACKSOS_EVERGREEN_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(Number(timeoutMsRaw)) ? Number(timeoutMsRaw) : 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "AbortError") {
      throw new Error(`OpenSRF timeout after ${timeoutMs}ms (${service}.${method})`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`OpenSRF HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  // osrf-gateway encodes many failures in the JSON "status" field (often while
  // still returning HTTP 200). If we ignore this, missing methods/signature
  // issues look like empty payloads and the UI feels "fake".
  const statusRaw = (json as any)?.status;
  const status =
    typeof statusRaw === "number"
      ? statusRaw
      : Number.isFinite(Number(statusRaw))
        ? Number(statusRaw)
        : null;

  if (status && status !== 200) {
    const debug = (json as any)?.debug;
    const debugText = typeof debug === "string" ? debug : "";
    const isMethodNotFound =
      status === 404 && debugText.toLowerCase().includes("method [") && debugText.toLowerCase().includes("not found");

    const log = isMethodNotFound ? logger.warn : logger.error;
    log(
      { component: "opensrf", service, method, status, paramCount: params.length, debug },
      "OpenSRF gateway error"
    );

    const err = new Error(
      `OpenSRF gateway error (${service}.${method}): status ${status}${
        debug ? ` - ${debug}` : ""
      }`
    );
    if (isMethodNotFound) {
      (err as any).code = "OSRF_METHOD_NOT_FOUND";
    }
    throw err;
  }

  return decodeOpenSRFResponse(json);
}

// ============================================================================
// Authentication Helpers
// ============================================================================

/**
 * Get auth token from cookies
 */
export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("authtoken")?.value || null;
}

/**
 * Require auth - throws if not authenticated
 */
export async function requireAuthToken(): Promise<string> {
  const authtoken = await getAuthToken();
  if (!authtoken) {
    throw new AuthenticationError("Authentication required");
  }
  return authtoken;
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

// ============================================================================
// Result Checking Helpers
// ============================================================================

/**
 * Check if OpenSRF result indicates success
 */
export function isSuccessResult(result: any): boolean {
  if (result === 1) return true;
  if (result === true) return true;
  if (typeof result === "number" && result > 0) return true;
  if (result && !result.ilsevent) return true;
  if (result?.ilsevent === 0) return true;
  return false;
}

/**
 * Check if result is an OpenSRF event (error)
 */
export function isOpenSRFEvent(result: any): result is OpenSRFEvent {
  return result && typeof result.ilsevent === "number" && result.ilsevent !== 0;
}

/**
 * Get error message from OpenSRF result
 */
export function getErrorMessage(result: any, fallback: string): string {
  if (!result) return fallback;
  return (
    result.textcode ||
    result.desc ||
    result.last_event?.textcode ||
    result.last_event?.desc ||
    fallback
  );
}

/**
 * Extract payload from OpenSRF response, handling events
 */
export function extractPayload<T>(response: OpenSRFResponse<T>): T | null {
  const result = response?.payload?.[0];
  if (!result) return null;
  if (isOpenSRFEvent(result)) return null;
  return result as T;
}

// ============================================================================
// Common Queries (reusable across routes)
// ============================================================================

/**
 * Look up copy by barcode
 */
export async function getCopyByBarcode(barcode: string) {
  const response = await callOpenSRF(
    "open-ils.search",
    "open-ils.search.asset.copy.find_by_barcode",
    [barcode]
  );
  return extractPayload(response);
}

/**
 * Look up patron by barcode (requires auth)
 */
export async function getPatronByBarcode(authtoken: string, barcode: string) {
  const response = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.user.fleshed.retrieve_by_barcode",
    [authtoken, barcode]
  );
  return extractPayload(response);
}

/**
 * Get patron by ID (requires auth)
 */
export async function getPatronById(authtoken: string, patronId: number) {
  const response = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.user.retrieve",
    [authtoken, patronId]
  );
  return extractPayload(response);
}

/**
 * Get patron fleshed (with cards, addresses, penalties)
 */
export async function getPatronFleshed(authtoken: string, patronId: number) {
  const response = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.user.fleshed.retrieve",
    [
      authtoken,
      patronId,
      [
        "card",
        "cards",
        "standing_penalties",
        "addresses",
        "billing_address",
        "mailing_address",
      ],
    ]
  );
  return extractPayload(response);
}

/**
 * Get org tree
 */
export async function getOrgTree() {
  const response = await callOpenSRF(
    "open-ils.actor",
    "open-ils.actor.org_tree.retrieve"
  );
  return extractPayload(response);
}

/**
 * Get copy statuses
 */
export async function getCopyStatuses() {
  const response = await callOpenSRF(
    "open-ils.search",
    "open-ils.search.config.copy_status.retrieve.all"
  );
  return response?.payload || [];
}
