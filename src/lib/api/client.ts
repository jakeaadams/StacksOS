/**
 * OpenSRF Gateway Client
 * The ONE place that handles all Evergreen API calls
 */

import { cookies } from "next/headers";
import { decodeOpenSRFResponse } from "./fieldmapper";
import type { OpenSRFResponse, OpenSRFEvent } from "./types";
import { logger } from "@/lib/logger";
import { fetchEvergreen } from "./evergreen-fetch";
import { opensrfRequestDurationSeconds, opensrfRequestsTotal } from "@/lib/metrics";

function resolveEvergreenBaseUrl(): string {
  const raw = process.env.EVERGREEN_BASE_URL;
  if (raw && raw.trim()) return raw.trim();
  throw new Error("EVERGREEN_BASE_URL is not set. Configure it in .env.local/.env.production.");
}

// Avoid spamming logs for Evergreen capability mismatches (method not found).
// Keyed by `${service}.${method}`.
const missingMethodOnce = new Set<string>();

// ============================================================================
// Circuit Breaker (process-level singleton)
// ============================================================================

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 30_000;

type CircuitState = "closed" | "open" | "half-open";

let cbState: CircuitState = "closed";
let cbConsecutiveFailures = 0;
let cbLastFailureTime = 0;

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

function circuitBreakerPreCheck(): void {
  if (cbState === "closed") return;

  if (cbState === "open") {
    const elapsed = Date.now() - cbLastFailureTime;
    if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
      cbState = "half-open";
      logger.info(
        { component: "circuit-breaker" },
        "Circuit breaker transitioning to half-open, allowing probe request"
      );
      return;
    }
    const remaining = Math.ceil((CIRCUIT_BREAKER_RESET_MS - elapsed) / 1000);
    throw new CircuitOpenError(
      `Evergreen circuit breaker is OPEN. ${remaining}s until next probe. Recent consecutive failures: ${cbConsecutiveFailures}`
    );
  }

  // half-open: allow the request through (probe)
}

function circuitBreakerOnSuccess(): void {
  if (cbState !== "closed") {
    logger.info(
      { component: "circuit-breaker", previousState: cbState },
      "Circuit breaker closing after successful request"
    );
  }
  cbState = "closed";
  cbConsecutiveFailures = 0;
}

function circuitBreakerOnFailure(): void {
  cbConsecutiveFailures++;
  cbLastFailureTime = Date.now();

  if (cbState === "half-open") {
    cbState = "open";
    logger.warn(
      { component: "circuit-breaker", failures: cbConsecutiveFailures },
      "Circuit breaker probe failed, re-opening"
    );
    return;
  }

  if (cbConsecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    cbState = "open";
    logger.warn(
      { component: "circuit-breaker", failures: cbConsecutiveFailures },
      `Circuit breaker OPEN after ${cbConsecutiveFailures} consecutive failures`
    );
  }
}

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
  const startedNs = process.hrtime.bigint();
  let outcome: "success" | "timeout" | "method_not_found" | "error" = "success";

  try {
    // Circuit breaker pre-check: fail fast if circuit is open
    circuitBreakerPreCheck();

    // Some Evergreen installs expose pcrud reads via `open-ils.pcrud.*.atomic`
    // but require a stateful client-managed transaction for writes.
    // `open-ils.permacrud` provides CRUD methods that manage their own
    // transaction per call, which works reliably behind the stateless gateway.
    let resolvedService = service;
    let resolvedMethod = method;
    if (service === "open-ils.pcrud") {
      const match = method.match(
        /^open-ils\.pcrud\.(create|update|delete)\.([A-Za-z0-9_]+)(?:\.atomic)?$/
      );
      if (match) {
        resolvedService = "open-ils.permacrud";
        resolvedMethod = `open-ils.permacrud.${match[1]}.${match[2]}`;
      }
    }

    const evergreenBase = resolveEvergreenBaseUrl();
    const url = `${evergreenBase.replace(/\/+$/, "")}/osrf-gateway-v1`;

    // Use POST body instead of querystring to avoid leaking sensitive values
    // (e.g. authtokens, password hashes) into intermediary access logs.
    const body = new URLSearchParams({ service: resolvedService, method: resolvedMethod });
    for (const param of params) {
      body.append("param", JSON.stringify(param));
    }
    // URLSearchParams encodes spaces as "+", but the Evergreen OpenSRF gateway
    // does not consistently decode "+" back to spaces inside param payloads.
    // This breaks queries like order_by: { auact: "event_time DESC" } by turning
    // it into "event_time+DESC" on the server side. Force %20 encoding instead.
    const bodyString = body.toString().replaceAll("+", "%20");

    const timeoutMsRaw = process.env.STACKSOS_EVERGREEN_TIMEOUT_MS;
    const timeoutMs = Number.isFinite(Number(timeoutMsRaw)) ? Number(timeoutMsRaw) : 15000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchEvergreen(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyString,
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
        status === 404 &&
        debugText.toLowerCase().includes("method [") &&
        debugText.toLowerCase().includes("not found");

      if (isMethodNotFound) {
        const key = `${resolvedService}.${resolvedMethod}`;
        if (!missingMethodOnce.has(key)) {
          missingMethodOnce.add(key);
          logger.info(
            {
              component: "opensrf",
              service: resolvedService,
              method: resolvedMethod,
              status,
              paramCount: params.length,
              debug,
            },
            "OpenSRF capability mismatch: method not found"
          );
        }
      } else {
        logger.error(
          {
            component: "opensrf",
            service: resolvedService,
            method: resolvedMethod,
            status,
            paramCount: params.length,
            debug,
          },
          "OpenSRF gateway error"
        );
      }

      const err = new Error(
        `OpenSRF gateway error (${resolvedService}.${resolvedMethod}): status ${status}${debug ? ` - ${debug}` : ""}`
      );
      if (isMethodNotFound) {
        (err as any).code = "OSRF_METHOD_NOT_FOUND";
      }
      throw err;
    }

    const decoded = decodeOpenSRFResponse(json);
    circuitBreakerOnSuccess();
    return decoded;
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    const code = typeof (e as any).code === "string" ? String((e as any).code) : "";
    if (code === "OSRF_METHOD_NOT_FOUND") {
      outcome = "method_not_found";
      // Method-not-found is a capability mismatch, not a connectivity failure.
    } else if (e instanceof CircuitOpenError) {
      outcome = "error";
      // Already handled by circuit breaker, just re-throw.
    } else {
      if (e.message.startsWith("OpenSRF timeout after")) outcome = "timeout";
      else outcome = "error";
      circuitBreakerOnFailure();
    }
    throw e;
  } finally {
    const durationSeconds = Number(process.hrtime.bigint() - startedNs) / 1e9;
    try {
      const isPcrudWrite =
        service === "open-ils.pcrud" && method.match(/^open-ils\.pcrud\.(create|update|delete)\./);
      const metricService = isPcrudWrite ? "open-ils.permacrud" : service;
      const metricMethod = isPcrudWrite
        ? method.replace(/^open-ils\.pcrud\./, "open-ils.permacrud.")
        : method;
      opensrfRequestsTotal.inc({ service: metricService, method: metricMethod, outcome });
      opensrfRequestDurationSeconds.observe(
        { service: metricService, method: metricMethod, outcome },
        durationSeconds
      );
    } catch {
      // Metrics must never break production traffic.
    }
  }
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
  const response = await callOpenSRF("open-ils.actor", "open-ils.actor.user.retrieve", [
    authtoken,
    patronId,
  ]);
  return extractPayload(response);
}

/**
 * Get patron fleshed (with cards, addresses, penalties)
 */
export async function getPatronFleshed(authtoken: string, patronId: number) {
  const response = await callOpenSRF("open-ils.actor", "open-ils.actor.user.fleshed.retrieve", [
    authtoken,
    patronId,
    ["card", "cards", "standing_penalties", "addresses", "billing_address", "mailing_address"],
  ]);
  return extractPayload(response);
}

/**
 * Get org tree
 */
export async function getOrgTree() {
  const response = await callOpenSRF("open-ils.actor", "open-ils.actor.org_tree.retrieve");
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
  const payload = response?.payload;
  if (Array.isArray(payload?.[0])) return payload[0] as any;
  if (Array.isArray(payload)) return payload as any;
  return [];
}
