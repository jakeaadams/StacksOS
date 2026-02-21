import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest } from "next/server";
import { successResponse, serverErrorResponse } from "@/lib/api";
import { requirePermissions } from "@/lib/permissions";
import { getRedisClient, redisEnabled } from "@/lib/redis";
import { z } from "zod";

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

export async function GET(req: NextRequest) {
  try {
    await requirePermissions(["ADMIN_CONFIG"]);

    const rebootRequired = fs.existsSync("/var/run/reboot-required");
    const rebootReason = readOptional("/var/run/reboot-required")?.trim() || null;
    const rebootPkgs = readOptional("/var/run/reboot-required.pkgs")
      ?.split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 25) || [];

    const [stacksosService, proxyService, dbTunnelService, scheduledReportsTimer] = await Promise.all([
      systemctlShow("stacksos.service"),
      systemctlShow("stacksos-proxy.service"),
      systemctlShow("evergreen-db-tunnel.service"),
      systemctlShow("stacksos-scheduled-reports.timer"),
    ]);

    const caPath = String(process.env.STACKSOS_EVERGREEN_CA_FILE || process.env.NODE_EXTRA_CA_CERTS || "").trim();
    const tlsVerificationDisabled = String(process.env.NODE_TLS_REJECT_UNAUTHORIZED || "").trim() === "0";

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
    });
  } catch (error) {
    return serverErrorResponse(error, "OpsStatus GET", req);
  }
}
