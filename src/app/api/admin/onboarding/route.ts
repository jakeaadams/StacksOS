import { NextRequest } from "next/server";
import { successResponse, serverErrorResponse } from "@/lib/api";
import { fetchEvergreen } from "@/lib/api/evergreen-fetch";
import { getEvergreenPool } from "@/lib/db/evergreen";
import { requireSaaSAccess } from "@/lib/saas-rbac";
import { getTenantConfig } from "@/lib/tenant/config";
import { loadTenantConfigFromDisk } from "@/lib/tenant/store";
import { buildProfileOnboardingPlaybook } from "@/lib/tenant/onboarding-playbooks";

function toStatus(ok: boolean): "pass" | "warn" | "fail" {
  if (ok) return "pass";
  return "fail";
}

export async function GET(req: NextRequest) {
  try {
    const requestedTenantId = String(req.nextUrl.searchParams.get("tenant_id") || "").trim();
    await requireSaaSAccess({
      target: "tenant",
      minRole: "tenant_admin",
      tenantId: requestedTenantId || getTenantConfig().tenantId,
      evergreenPerms: ["ADMIN_CONFIG"],
      autoBootstrapPlatformOwner: false,
    });

    const selectedTenant = requestedTenantId ? loadTenantConfigFromDisk(requestedTenantId) : null;
    const activeTenant = getTenantConfig();
    const tenant = selectedTenant || activeTenant;

    const base = tenant.evergreenBaseUrl.replace(/\/+$/, "");

    const [eg2Probe, osrfProbe, dbProbe, settingsProbe, workstationProbe] = await Promise.all([
      (async () => {
        const started = Date.now();
        try {
          const res = await fetchEvergreen(`${base}/eg2/`, {
            method: "HEAD",
            redirect: "manual",
            cache: "no-store",
          });
          const ok = res.status >= 200 && res.status < 500;
          return {
            status: toStatus(ok),
            ok,
            latencyMs: Date.now() - started,
            detail: `HTTP ${res.status}`,
          };
        } catch (error) {
          return {
            status: "fail" as const,
            ok: false,
            latencyMs: Date.now() - started,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async () => {
        const started = Date.now();
        try {
          const res = await fetchEvergreen(`${base}/osrf-gateway-v1`, {
            method: "HEAD",
            redirect: "manual",
            cache: "no-store",
          });
          const ok = res.status >= 200 && res.status < 500;
          return {
            status: toStatus(ok),
            ok,
            latencyMs: Date.now() - started,
            detail: `HTTP ${res.status}`,
          };
        } catch (error) {
          return {
            status: "fail" as const,
            ok: false,
            latencyMs: Date.now() - started,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async () => {
        const started = Date.now();
        try {
          const pool = getEvergreenPool();
          await pool.query("SELECT 1");
          return {
            status: "pass" as const,
            ok: true,
            latencyMs: Date.now() - started,
            detail: "DB connection OK",
          };
        } catch (error) {
          return {
            status: "fail" as const,
            ok: false,
            latencyMs: Date.now() - started,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      (async () => {
        try {
          const pool = getEvergreenPool();
          const email = await pool.query(
            "SELECT COUNT(*)::int AS count FROM config.usr_setting_type WHERE name LIKE 'stacksos.email.%'"
          );
          const sms = await pool.query(
            "SELECT COUNT(*)::int AS count FROM config.usr_setting_type WHERE name LIKE 'stacksos.sms.%'"
          );

          const emailCount = Number(email.rows[0]?.count || 0);
          const smsCount = Number(sms.rows[0]?.count || 0);
          const ok = emailCount >= 6 && smsCount >= 6;

          return {
            status: ok ? "pass" : "warn",
            ok,
            detail: `stacksos.email.*=${emailCount}, stacksos.sms.*=${smsCount}`,
            emailCount,
            smsCount,
          } as const;
        } catch (error) {
          return {
            status: "fail" as const,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
            emailCount: 0,
            smsCount: 0,
          };
        }
      })(),
      (async () => {
        try {
          const pool = getEvergreenPool();
          const total = await pool.query("SELECT COUNT(*)::int AS count FROM actor.workstation");
          const prefixed = await pool.query(
            "SELECT COUNT(*)::int AS count FROM actor.workstation WHERE name LIKE 'STACKSOS-%'"
          );
          const totalCount = Number(total.rows[0]?.count || 0);
          const prefixedCount = Number(prefixed.rows[0]?.count || 0);
          const ok = prefixedCount <= 500;

          return {
            status: ok ? "pass" : "warn",
            ok,
            detail: `total=${totalCount}, stacksosPrefixed=${prefixedCount}`,
            totalCount,
            prefixedCount,
          } as const;
        } catch (error) {
          return {
            status: "fail" as const,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
            totalCount: 0,
            prefixedCount: 0,
          };
        }
      })(),
    ]);

    const checks = {
      evergreenEg2: eg2Probe,
      evergreenGateway: osrfProbe,
      database: dbProbe,
      stacksosNoticeSettings: settingsProbe,
      workstationFootprint: workstationProbe,
    };
    const profileType = tenant.profile?.type || "public";
    const profilePlaybook = buildProfileOnboardingPlaybook(profileType, checks);

    const failed = Object.values(checks).filter((c) => c.status === "fail").length;
    const warned = Object.values(checks).filter((c) => c.status === "warn").length;

    const summary = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";

    const recommendations: string[] = [];
    if (!settingsProbe.ok) {
      recommendations.push(
        "Run docs/setup-evergreen-settings.sql to seed email and SMS preference setting types."
      );
    }
    if (workstationProbe.prefixedCount > 200) {
      recommendations.push(
        "High STACKSOS workstation count detected; review auto-registration reuse policy and periodic cleanup."
      );
    }
    if (selectedTenant && requestedTenantId !== activeTenant.tenantId) {
      recommendations.push(
        "DB checks are against the currently configured Evergreen DB tunnel; validate DB connectivity separately for non-active tenants."
      );
    }

    return successResponse({
      summary,
      tenant: {
        tenantId: tenant.tenantId,
        displayName: tenant.displayName,
        profile: profileType,
        evergreenBaseUrl: tenant.evergreenBaseUrl,
        activeTenantId: activeTenant.tenantId,
      },
      checks,
      profilePlaybook,
      recommendations,
    });
  } catch (error) {
    return serverErrorResponse(error, "Admin Onboarding GET", req);
  }
}
