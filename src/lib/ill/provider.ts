import type { IllPriority, IllRequestType, IllSyncStatus } from "@/lib/db/ill";
import { logger } from "@/lib/logger";

export type IllProvider = "manual" | "illiad" | "tipasa" | "reshare" | "custom-webhook";
export type IllSyncMode = "manual" | "monitor" | "enabled";

const PROVIDERS = new Set<IllProvider>(["manual", "illiad", "tipasa", "reshare", "custom-webhook"]);
const SYNC_MODES = new Set<IllSyncMode>(["manual", "monitor", "enabled"]);

interface IllProviderConfig {
  provider: IllProvider;
  syncMode: IllSyncMode;
  endpointUrl: string | null;
  apiKey: string | null;
  username: string | null;
  password: string | null;
  timeoutMs: number;
}

export interface IllProviderStatus {
  provider: IllProvider;
  syncMode: IllSyncMode;
  configured: boolean;
  activeSync: boolean;
  endpointConfigured: boolean;
  authConfigured: boolean;
  reason: string;
  requiredConfig: string[];
}

export interface IllProviderRequestPayload {
  requestId: number;
  requestType: IllRequestType;
  priority: IllPriority;
  patronId: number | null;
  patronBarcode: string;
  patronName: string | null;
  title: string;
  author: string | null;
  isbn: string | null;
  source: string | null;
  neededBy: string | null;
  notes: string | null;
}

export interface IllProviderSyncResult {
  attempted: boolean;
  syncStatus: IllSyncStatus;
  provider: Exclude<IllProvider, "manual"> | null;
  providerRequestId: string | null;
  syncError: string | null;
}

function cleanEnv(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  const value = String(raw).trim();
  return value || null;
}

function parseProvider(raw: string | null): IllProvider {
  if (raw && PROVIDERS.has(raw as IllProvider)) return raw as IllProvider;
  return "manual";
}

function parseSyncMode(raw: string | null, provider: IllProvider): IllSyncMode {
  if (raw && SYNC_MODES.has(raw as IllSyncMode)) return raw as IllSyncMode;
  return provider === "manual" ? "manual" : "monitor";
}

function parseTimeoutMs(raw: string | null): number {
  const value = Number(raw ?? "");
  if (!Number.isFinite(value) || value < 1000 || value > 120000) return 10000;
  return Math.floor(value);
}

function getConfig(): IllProviderConfig {
  const provider = parseProvider(cleanEnv("STACKSOS_ILL_PROVIDER"));
  const syncMode = parseSyncMode(cleanEnv("STACKSOS_ILL_SYNC_MODE"), provider);

  return {
    provider,
    syncMode,
    endpointUrl: cleanEnv("STACKSOS_ILL_API_URL") || cleanEnv("STACKSOS_ILL_WEBHOOK_URL"),
    apiKey: cleanEnv("STACKSOS_ILL_API_KEY"),
    username: cleanEnv("STACKSOS_ILL_USERNAME"),
    password: cleanEnv("STACKSOS_ILL_PASSWORD"),
    timeoutMs: parseTimeoutMs(cleanEnv("STACKSOS_ILL_TIMEOUT_MS")),
  };
}

export function getIllProviderStatus(): IllProviderStatus {
  const config = getConfig();

  if (config.provider === "manual") {
    return {
      provider: "manual",
      syncMode: "manual",
      configured: true,
      activeSync: false,
      endpointConfigured: false,
      authConfigured: false,
      reason: "Manual mode: requests are tracked in StacksOS and fulfilled outside provider APIs.",
      requiredConfig: [],
    };
  }

  const endpointConfigured = Boolean(config.endpointUrl);
  const authConfigured =
    config.provider === "custom-webhook" ? true : Boolean(config.apiKey || (config.username && config.password));

  const missing: string[] = [];
  if (!endpointConfigured) missing.push("STACKSOS_ILL_API_URL");
  if (!authConfigured && config.provider !== "custom-webhook") {
    missing.push("STACKSOS_ILL_API_KEY or STACKSOS_ILL_USERNAME + STACKSOS_ILL_PASSWORD");
  }

  const configured = missing.length === 0;

  if (!configured) {
    return {
      provider: config.provider,
      syncMode: config.syncMode,
      configured: false,
      activeSync: false,
      endpointConfigured,
      authConfigured,
      reason: `Provider is not fully configured. Missing: ${missing.join(", ")}`,
      requiredConfig: missing,
    };
  }

  if (config.syncMode === "monitor") {
    return {
      provider: config.provider,
      syncMode: config.syncMode,
      configured: true,
      activeSync: false,
      endpointConfigured,
      authConfigured,
      reason: "Monitor mode: requests are recorded and queued, but not posted to provider API.",
      requiredConfig: [],
    };
  }

  return {
    provider: config.provider,
    syncMode: config.syncMode,
    configured: true,
    activeSync: true,
    endpointConfigured,
    authConfigured,
    reason: "Provider sync is active. New ILL requests are posted automatically.",
    requiredConfig: [],
  };
}

function normalizeError(error: unknown): string {
  const text = String(error || "Unknown provider sync error").trim();
  if (text.length <= 500) return text;
  return `${text.slice(0, 497)}...`;
}

function buildAuthHeaders(config: IllProviderConfig): Record<string, string> {
  if (config.apiKey) {
    return {
      Authorization: `Bearer ${config.apiKey}`,
    };
  }

  if (config.username && config.password) {
    const token = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    return {
      Authorization: `Basic ${token}`,
    };
  }

  return {};
}

function extractProviderRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  const value = source.providerRequestId ?? source.requestId ?? source.transactionId ?? source.id;
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out ? out.slice(0, 200) : null;
}

export async function syncIllRequestToProvider(
  request: IllProviderRequestPayload
): Promise<IllProviderSyncResult> {
  const config = getConfig();
  const status = getIllProviderStatus();

  if (status.syncMode === "manual" || status.provider === "manual") {
    return {
      attempted: false,
      syncStatus: "manual",
      provider: null,
      providerRequestId: null,
      syncError: null,
    };
  }

  // From here on, the provider is guaranteed to be non-manual.
  const provider = status.provider;

  if (status.syncMode === "monitor") {
    return {
      attempted: false,
      syncStatus: "pending",
      provider,
      providerRequestId: null,
      syncError: "Monitor mode is enabled; provider sync is intentionally deferred.",
    };
  }

  if (!status.configured || !config.endpointUrl) {
    return {
      attempted: false,
      syncStatus: "failed",
      provider,
      providerRequestId: null,
      syncError: status.reason,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-StacksOS-ILL-Provider": provider,
        ...buildAuthHeaders(config),
      },
      body: JSON.stringify({
        provider,
        request,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })() : null;

    if (!response.ok) {
      const message = normalizeError(`Provider sync failed (${response.status}): ${text || response.statusText}`);
      logger.warn(
        { component: "ill-provider", provider, illRequestId: request.requestId, status: response.status },
        "ILL provider sync failed"
      );
      return {
        attempted: true,
        syncStatus: "failed",
        provider,
        providerRequestId: extractProviderRequestId(payload),
        syncError: message,
      };
    }

    return {
      attempted: true,
      syncStatus: "synced",
      provider,
      providerRequestId: extractProviderRequestId(payload),
      syncError: null,
    };
  } catch (error) {
    const message = normalizeError(error);
    logger.warn(
      { component: "ill-provider", provider, illRequestId: request.requestId, err: message },
      "ILL provider sync error"
    );
    return {
      attempted: true,
      syncStatus: "failed",
      provider,
      providerRequestId: null,
      syncError: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
