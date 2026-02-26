import { NextRequest, NextResponse } from "next/server";
import { fetchEvergreen } from "@/lib/api/evergreen-fetch";
import { getEvergreenPool } from "@/lib/db/evergreen";
import { cookies } from "next/headers";
import { z as _z } from "zod";
import { getTenantConfig } from "@/lib/tenant/config";

const startTime = Date.now();

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: HealthCheck;
    evergreen: HealthCheck;
  };
}

interface HealthCheck {
  status: "up" | "down";
  latency?: number;
  error?: string;
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const pool = getEvergreenPool();
    await pool.query("SELECT 1");
    return {
      status: "up",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "down",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkEvergreen(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const evergreenBase = getTenantConfig().evergreenBaseUrl;
    if (!evergreenBase) {
      return {
        status: "down",
        latency: Date.now() - start,
        error: "Tenant evergreenBaseUrl is not set",
      };
    }

    // Hit the OpenSRF gateway directly so we can treat "unknown user" as a
    // successful Evergreen connection. Evergreen frequently returns `status: 404`
    // for nonexistent users in `authenticate.init`, which should not fail the
    // service liveness/readiness check.
    const url = `${evergreenBase.replace(/\/+$/, "")}/osrf-gateway-v1`;

    const body = new URLSearchParams({
      service: "open-ils.auth",
      method: "open-ils.auth.authenticate.init",
    });
    body.append("param", JSON.stringify("__health_check__"));
    const bodyString = body.toString().replaceAll("+", "%20");

    const res = await fetchEvergreen(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyString,
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        status: "down",
        latency: Date.now() - start,
        error: `OpenSRF HTTP error: ${res.status} ${res.statusText}`,
      };
    }

    const json: unknown = await res.json();
    const statusRaw = (json as Record<string, any>)?.status;
    const status =
      typeof statusRaw === "number"
        ? statusRaw
        : Number.isFinite(Number(statusRaw))
          ? Number(statusRaw)
          : null;

    const debugRaw = (json as Record<string, any>)?.debug;
    const debug = typeof debugRaw === "string" ? debugRaw : "";
    const methodNotFound =
      status === 404 &&
      debug.toLowerCase().includes("method [") &&
      debug.toLowerCase().includes("not found");

    if (methodNotFound) {
      return {
        status: "down",
        latency: Date.now() - start,
        error: debug || "OpenSRF method not found",
      };
    }

    // `authenticate.init` returns status 404 for nonexistent users, which is
    // expected for this check. Any 2xx/404 response means Evergreen is reachable.
    if (status === 200 || status === 404) {
      return {
        status: "up",
        latency: Date.now() - start,
      };
    }

    return {
      status: "down",
      latency: Date.now() - start,
      error: `OpenSRF gateway returned status ${status ?? "unknown"}`,
    };
  } catch (error) {
    return {
      status: "down",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET(_req: NextRequest) {
  // Check if the request is from an authenticated staff user
  const cookieStore = await cookies();
  const authtoken = cookieStore.get("authtoken")?.value;

  if (!authtoken) {
    // Unauthenticated: return only basic status for load balancers
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  // Authenticated staff: return full detailed health info
  const [dbCheck, evergreenCheck] = await Promise.all([checkDatabase(), checkEvergreen()]);

  const allHealthy = dbCheck.status === "up" && evergreenCheck.status === "up";
  const anyDown = dbCheck.status === "down" || evergreenCheck.status === "down";

  const health: HealthStatus = {
    status: anyDown ? "unhealthy" : allHealthy ? "healthy" : "degraded",
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: {
      database: dbCheck,
      evergreen: evergreenCheck,
    },
  };

  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
