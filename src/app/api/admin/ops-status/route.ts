import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest } from "next/server";
import { successResponse, serverErrorResponse } from "@/lib/api";
import { requireSaaSAccess } from "@/lib/saas-rbac";
import { getRedisClient, redisEnabled } from "@/lib/redis";
import { loadAiConfig } from "@/lib/ai/config";
import { querySingle } from "@/lib/db/evergreen";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

async function systemctlShow(unit: string): Promise<Record<string, string>> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["show", unit, "--no-pager"], {
      timeout: 1500,
      maxBuffer: 1024 * 1024,
    });
    const out: Record<string, string> = {};
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx);
      const value = line.slice(idx + 1);
      if (!key) continue;
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function readOptional(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

type AiDraftHealthRow = {
  drafts_last_hour: number;
  fallback_last_hour: number;
  drafts_last_day: number;
  fallback_last_day: number;
};

type AiLatencyRow = {
  p95_latency_ms_last_hour: number | null;
  ai_calls_last_hour: number;
};

function toPositiveInt(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function ratio(percentNumerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number((percentNumerator / denominator).toFixed(4));
}

async function loadAiRuntimeStatus() {
  let aiConfig: ReturnType<typeof loadAiConfig> | null = null;
  try {
    aiConfig = loadAiConfig();
  } catch {
    aiConfig = null;
  }

  const status = {
    enabled: Boolean(aiConfig?.enabled),
    provider: aiConfig?.provider || null,
    model: aiConfig?.model || null,
    timeoutMs: aiConfig?.timeoutMs || null,
    callsLastHour: 0,
    draftsLastHour: 0,
    fallbackLastHour: 0,
    fallbackRateLastHour: 0,
    draftsLastDay: 0,
    fallbackLastDay: 0,
    fallbackRateLastDay: 0,
    p95LatencyMsLastHour: null as number | null,
    health: "inactive" as "inactive" | "healthy" | "degraded" | "no_data" | "unknown",
    note: null as string | null,
  };

  if (!status.enabled || !status.provider) {
    status.health = "inactive";
    return status;
  }

  try {
    const draftRow = await querySingle<AiDraftHealthRow>(
      `
        SELECT
          COUNT(*) FILTER (WHERE created_at > (NOW() - interval '1 hour'))::int AS drafts_last_hour,
          COUNT(*) FILTER (WHERE created_at > (NOW() - interval '1 hour') AND provider = 'fallback')::int AS fallback_last_hour,
          COUNT(*) FILTER (WHERE created_at > (NOW() - interval '1 day'))::int AS drafts_last_day,
          COUNT(*) FILTER (WHERE created_at > (NOW() - interval '1 day') AND provider = 'fallback')::int AS fallback_last_day
        FROM library.ai_drafts
        WHERE type IN ('ops_playbooks', 'staff_copilot')
      `
    );

    const latencyRow = await querySingle<AiLatencyRow>(
      `
        SELECT
          COUNT(*)::int AS ai_calls_last_hour,
          CASE
            WHEN COUNT(*) = 0 THEN NULL
            ELSE percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)::int
          END AS p95_latency_ms_last_hour
        FROM library.ai_calls
        WHERE created_at > (NOW() - interval '1 hour')
          AND type IN ('ops_playbooks', 'staff_copilot')
      `
    );

    status.callsLastHour = toPositiveInt(latencyRow?.ai_calls_last_hour);
    status.draftsLastHour = toPositiveInt(draftRow?.drafts_last_hour);
    status.fallbackLastHour = toPositiveInt(draftRow?.fallback_last_hour);
    status.fallbackRateLastHour = ratio(status.fallbackLastHour, status.draftsLastHour);
    status.draftsLastDay = toPositiveInt(draftRow?.drafts_last_day);
    status.fallbackLastDay = toPositiveInt(draftRow?.fallback_last_day);
    status.fallbackRateLastDay = ratio(status.fallbackLastDay, status.draftsLastDay);
    status.p95LatencyMsLastHour =
      typeof latencyRow?.p95_latency_ms_last_hour === "number"
        ? Math.max(0, Math.round(latencyRow.p95_latency_ms_last_hour))
        : null;

    if (status.draftsLastHour === 0) {
      status.health = "no_data";
    } else if (status.fallbackRateLastHour >= 0.25) {
      status.health = "degraded";
      status.note = "Fallback rate exceeded 25% in the last hour.";
    } else {
      status.health = "healthy";
    }
  } catch (error) {
    status.health = "unknown";
    status.note = `AI runtime metrics unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }

  return status;
}

export async function GET(req: NextRequest) {
  try {
    await requireSaaSAccess({
      target: "platform",
      minRole: "platform_admin",
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: true,
    });

    const rebootRequired = fs.existsSync("/var/run/reboot-required");
    const rebootReason = readOptional("/var/run/reboot-required")?.trim() || null;
    const rebootPkgs =
      readOptional("/var/run/reboot-required.pkgs")
        ?.split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 25) || [];

    const [stacksosService, proxyService, dbTunnelService, scheduledReportsTimer, aiRuntime] =
      await Promise.all([
        systemctlShow("stacksos.service"),
        systemctlShow("stacksos-proxy.service"),
        systemctlShow("evergreen-db-tunnel.service"),
        systemctlShow("stacksos-scheduled-reports.timer"),
        loadAiRuntimeStatus(),
      ]);

    const caPath = String(
      process.env.STACKSOS_EVERGREEN_CA_FILE || process.env.NODE_EXTRA_CA_CERTS || ""
    ).trim();
    const tlsVerificationDisabled =
      String(process.env.NODE_TLS_REJECT_UNAUTHORIZED || "").trim() === "0";

    let redisOk: boolean | null = null;
    if (redisEnabled()) {
      redisOk = false;
      const client = await getRedisClient();
      if (client) {
        try {
          redisOk = (await client.ping()) === "PONG";
        } catch {
          redisOk = false;
        }
      }
    }

    return successResponse({
      host: {
        kernel: os.release(),
        uptimeSeconds: Math.floor(os.uptime()),
        rebootRequired,
        rebootReason,
        rebootRequiredPkgs: rebootPkgs,
      },
      redis: {
        enabled: redisEnabled(),
        ok: redisOk,
      },
      services: {
        stacksos: {
          activeState: stacksosService.ActiveState || null,
          subState: stacksosService.SubState || null,
          user: stacksosService.User || null,
          execStart: stacksosService.ExecStart || null,
        },
        proxy: {
          activeState: proxyService.ActiveState || null,
          subState: proxyService.SubState || null,
          user: proxyService.User || null,
          dynamicUser: proxyService.DynamicUser || null,
          execStart: proxyService.ExecStart || null,
        },
        evergreenDbTunnel: {
          activeState: dbTunnelService.ActiveState || null,
          subState: dbTunnelService.SubState || null,
          user: dbTunnelService.User || null,
          execStart: dbTunnelService.ExecStart || null,
        },
        scheduledReportsTimer: {
          activeState: scheduledReportsTimer.ActiveState || null,
          subState: scheduledReportsTimer.SubState || null,
          unitFileState: scheduledReportsTimer.UnitFileState || null,
        },
      },
      tls: {
        caBundleConfigured: Boolean(caPath),
        tlsVerificationDisabled,
      },
      ai: aiRuntime,
    });
  } catch (error) {
    return serverErrorResponse(error, "OpsStatus GET", req);
  }
}
