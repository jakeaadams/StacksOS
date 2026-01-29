import { NextRequest, NextResponse } from "next/server";
import { callOpenSRF } from "@/lib/api/client";
import { getEvergreenPool } from "@/lib/db/evergreen";

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
    // Simple check - get the version
    const response = await callOpenSRF(
      "open-ils.auth",
      "open-ils.auth.authenticate.init",
      ["__health_check__"]
    );
    // Even if user doesn't exist, a successful response means Evergreen is up
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

export async function GET(req: NextRequest) {
  const [dbCheck, evergreenCheck] = await Promise.all([
    checkDatabase(),
    checkEvergreen(),
  ]);

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
