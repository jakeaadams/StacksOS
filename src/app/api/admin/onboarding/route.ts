import { NextRequest } from "next/server";
import { successResponse, serverErrorResponse } from "@/lib/api";
import { fetchEvergreen } from "@/lib/api/evergreen-fetch";
import { getEvergreenPool } from "@/lib/db/evergreen";
import { requireSaaSAccess } from "@/lib/saas-rbac";
import { getTenantConfig } from "@/lib/tenant/config";
import { loadTenantConfigFromDisk } from "@/lib/tenant/store";
import { buildProfileOnboardingPlaybook } from "@/lib/tenant/onboarding-playbooks";
import { logger } from "@/lib/logger";

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

    const [
      eg2Probe,
      osrfProbe,
      dbProbe,
      settingsProbe,
      workstationProbe,
      k12TablesProbe,
      courseReservesProbe,
      opacKidsProbe,
      opacEventsProbe,
      patronNoticeProbe,
      summerReadingProbe,
      bookingResourceProbe,
    ] = await Promise.all([
      // --- evergreenEg2 ---
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
      // --- evergreenGateway ---
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
      // --- database ---
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
      // --- stacksosNoticeSettings ---
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
      // --- workstationFootprint ---
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
      // --- k12Tables ---
      (async () => {
        try {
          const pool = getEvergreenPool();
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'library' AND table_name = 'k12_classes'
            ) AS exists`
          );
          const exists = result.rows[0]?.exists === true;
          return {
            status: exists ? ("pass" as const) : ("warn" as const),
            ok: exists,
            detail: exists
              ? "library.k12_classes table exists"
              : "library.k12_classes table not found",
          };
        } catch (error) {
          return {
            status: "fail" as const,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      // --- courseReservesData ---
      (async () => {
        try {
          const pool = getEvergreenPool();
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'asset' AND table_name = 'course_module_course'
            ) AS exists`
          );
          const tableExists = result.rows[0]?.exists === true;
          if (!tableExists) {
            return {
              status: "warn" as const,
              ok: false,
              detail: "Course reserves table (asset.course_module_course) not found",
              courseCount: 0,
            };
          }
          const countResult = await pool.query(
            "SELECT COUNT(*)::int AS count FROM asset.course_module_course"
          );
          const courseCount = Number(countResult.rows[0]?.count || 0);
          const ok = courseCount > 0;
          return {
            status: ok ? ("pass" as const) : ("warn" as const),
            ok,
            detail: `courseCount=${courseCount}`,
            courseCount,
          };
        } catch (error) {
          return {
            status: "fail" as const,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
            courseCount: 0,
          };
        }
      })(),
      // --- opacKidsRoutes ---
      (async () => {
        const started = Date.now();
        try {
          // Lightweight internal health check for /opac/kids route availability
          const appBase =
            process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3000";
          const res = await fetch(`${appBase}/opac/kids`, {
            method: "HEAD",
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          });
          const ok = res.status >= 200 && res.status < 400;
          return {
            status: toStatus(ok),
            ok,
            latencyMs: Date.now() - started,
            detail: `HTTP ${res.status}`,
          };
        } catch (error) {
          logger.debug({ error: String(error) }, "opacKidsRoutes probe failed (non-blocking)");
          return {
            status: "warn" as const,
            ok: false,
            latencyMs: Date.now() - started,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      // --- opacEventsSource ---
      (async () => {
        const started = Date.now();
        try {
          const appBase =
            process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3000";
          const res = await fetch(`${appBase}/api/opac/events?limit=1`, {
            method: "GET",
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          });
          const ok = res.status >= 200 && res.status < 400;
          return {
            status: toStatus(ok),
            ok,
            latencyMs: Date.now() - started,
            detail: ok ? "Events API reachable" : `HTTP ${res.status}`,
          };
        } catch (error) {
          logger.debug({ error: String(error) }, "opacEventsSource probe failed (non-blocking)");
          return {
            status: "warn" as const,
            ok: false,
            latencyMs: Date.now() - started,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      // --- patronNoticeTemplates ---
      (async () => {
        try {
          const pool = getEvergreenPool();
          const result = await pool.query(
            `SELECT COUNT(*)::int AS count FROM library.notification_templates WHERE status = 'active'`
          );
          const count = Number(result.rows[0]?.count || 0);
          const ok = count > 0;
          return {
            status: ok ? ("pass" as const) : ("warn" as const),
            ok,
            detail: `activeTemplates=${count}`,
            templateCount: count,
          };
        } catch (error) {
          // Table may not exist yet if migrations haven't run
          return {
            status: "warn" as const,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
            templateCount: 0,
          };
        }
      })(),
      // --- summerReadingConfig ---
      (async () => {
        try {
          const pool = getEvergreenPool();
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'library' AND table_name = 'summer_reading_config'
            ) AS exists`
          );
          const tableExists = result.rows[0]?.exists === true;
          if (!tableExists) {
            return {
              status: "warn" as const,
              ok: false,
              detail: "library.summer_reading_config table not found",
            };
          }
          const countResult = await pool.query(
            "SELECT COUNT(*)::int AS count FROM library.summer_reading_config"
          );
          const count = Number(countResult.rows[0]?.count || 0);
          const ok = count > 0;
          return {
            status: ok ? ("pass" as const) : ("warn" as const),
            ok,
            detail: `summerReadingConfigs=${count}`,
          };
        } catch (error) {
          return {
            status: "warn" as const,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      })(),
      // --- bookingResourceTypes ---
      (async () => {
        try {
          const pool = getEvergreenPool();
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'booking' AND table_name = 'resource_type'
            ) AS exists`
          );
          const tableExists = result.rows[0]?.exists === true;
          if (!tableExists) {
            return {
              status: "warn" as const,
              ok: false,
              detail: "booking.resource_type table not found",
            };
          }
          const countResult = await pool.query(
            "SELECT COUNT(*)::int AS count FROM booking.resource_type"
          );
          const count = Number(countResult.rows[0]?.count || 0);
          const ok = count > 0;
          return {
            status: ok ? ("pass" as const) : ("warn" as const),
            ok,
            detail: `bookingResourceTypes=${count}`,
          };
        } catch (error) {
          return {
            status: "warn" as const,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
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
      k12Tables: k12TablesProbe,
      courseReservesData: courseReservesProbe,
      opacKidsRoutes: opacKidsProbe,
      opacEventsSource: opacEventsProbe,
      patronNoticeTemplates: patronNoticeProbe,
      summerReadingConfig: summerReadingProbe,
      bookingResourceTypes: bookingResourceProbe,
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
    if (!k12TablesProbe.ok) {
      recommendations.push(
        "K-12 tables not found. Run migrations to create library.k12_classes and related tables."
      );
    }
    if (!patronNoticeProbe.ok) {
      recommendations.push(
        "No active patron notice templates found. Configure email templates in Administration > Notifications."
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
