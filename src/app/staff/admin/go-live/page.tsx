"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageContainer, PageHeader, PageContent, StatusBadge, ErrorMessage } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export default function GoLiveChecklistPage() {
  const [status, setStatus] = useState<any>(null);
  const [env, setEnv] = useState<any>(null);
  const [ops, setOps] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHttps, setIsHttps] = useState<boolean | null>(null);

  const load = async () => {
    try {
      setError(null);
      const [sRes, eRes, oRes] = await Promise.all([
        fetch("/api/status", { cache: "no-store" }),
        fetch("/api/env", { cache: "no-store" }),
        fetch("/api/admin/ops-status", { cache: "no-store" }),
      ]);
      const sJson = await sRes.json();
      const eJson = await eRes.json();
      const oJson = await oRes.json();
      if (!sRes.ok || sJson.ok === false) throw new Error(sJson.error || "Failed to load status");
      if (!eRes.ok || eJson.ok === false) throw new Error(eJson.error || "Failed to load env");
      if (!oRes.ok || oJson.ok === false) throw new Error(oJson.error || "Failed to load ops status");
      setStatus(sJson);
      setEnv(eJson.env);
      setOps(oJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
      setEnv(null);
      setOps(null);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setIsHttps(window.location.protocol === "https:");
  }, []);

  const evergreenOk = status?.evergreen?.ok === true;
  const rbacStrict = String(env?.rbacMode || "").toLowerCase() === "strict";
  const idleConfigured = typeof env?.idleTimeoutMinutes === "number";
  const rebootRequired = ops?.host?.rebootRequired === true;
  const proxyActive = ops?.services?.proxy?.activeState === "active";
  const dbTunnelActive = ops?.services?.evergreenDbTunnel?.activeState === "active";
  const dbTunnelUser = typeof ops?.services?.evergreenDbTunnel?.user === "string" ? ops.services.evergreenDbTunnel.user : null;
  const dbTunnelHardened = dbTunnelActive && Boolean(dbTunnelUser) && dbTunnelUser !== "jake";
  const tlsBypass = ops?.tls?.tlsVerificationDisabled === true;
  const caConfigured = ops?.tls?.caBundleConfigured === true;
  const redisEnabled = ops?.redis?.enabled === true;
  const redisOk = ops?.redis?.ok === true;

  const baseUrl = typeof env?.baseUrl === "string" ? env.baseUrl : null;
  const baseUrlHttps = typeof baseUrl === "string" ? baseUrl.startsWith("https://") : false;
  const cookieSecureExplicit = env?.cookieSecureExplicit;
  const cookieSecureOk =
    cookieSecureExplicit === true ? true :
    cookieSecureExplicit === false ? false :
    isHttps === true;

  const Row = ({ label, ok, details }: { label: string; ok: boolean; details?: string }) => (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="font-medium flex items-center gap-2">
          {ok ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <XCircle className="h-4 w-4 text-red-700" />}
          {label}
        </div>
        {details ? <div className="text-xs text-muted-foreground mt-1">{details}</div> : null}
      </div>
      <StatusBadge label={ok ? "OK" : "Action required"} status={ok ? "success" : "error"} />
    </div>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Go-live checklist"
        subtitle="Operational readiness checks for pilots"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Go-live" }]}
      />
      <PageContent className="space-y-6">
        {error ? <ErrorMessage message={error} onRetry={load} /> : null}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Readiness</CardTitle>
            <CardDescription>These are necessary (not sufficient) checks for pilot operations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Evergreen reachable" ok={evergreenOk} details={`HTTP ${status?.evergreen?.status ?? "—"}`} />
            <Row label="RBAC strict mode enabled" ok={rbacStrict} details={`STACKSOS_RBAC_MODE=${env?.rbacMode ?? "—"}`} />
            <Row label="Idle timeout configured" ok={idleConfigured} details={idleConfigured ? `${env.idleTimeoutMinutes} minutes` : "Set STACKSOS_IDLE_TIMEOUT_MINUTES"} />
            <Row
              label="StacksOS is served over HTTPS"
              ok={isHttps === true}
              details={isHttps === true ? window.location.origin : "Terminate TLS (recommended: Caddy) and use https://"}
            />
            <Row
              label="Base URL configured for HTTPS"
              ok={baseUrlHttps}
              details={baseUrl ? `STACKSOS_BASE_URL=${baseUrl}` : "Set STACKSOS_BASE_URL=https://..."}
            />
            <Row
              label="Secure cookies enabled"
              ok={cookieSecureOk}
              details={
                cookieSecureExplicit === false
                  ? "STACKSOS_COOKIE_SECURE=false is unsafe on LAN. Set it to true after enabling HTTPS."
                  : cookieSecureExplicit === true
                    ? "STACKSOS_COOKIE_SECURE=true"
                    : isHttps === true
                      ? "STACKSOS_COOKIE_SECURE not set (auto: HTTPS detected)"
                      : "STACKSOS_COOKIE_SECURE not set (auto: currently HTTP)"
              }
            />
            <Row
              label="Redis configured (multi-instance ready)"
              ok={redisEnabled && redisOk}
              details={
                redisEnabled
                  ? redisOk
                    ? "STACKSOS_REDIS_URL configured and reachable"
                    : "STACKSOS_REDIS_URL configured but Redis is not reachable"
                  : "Optional for single instance; set STACKSOS_REDIS_URL for shared rate limiting + idempotency"
              }
            />
            <Row
              label="Host reboot required"
              ok={!rebootRequired}
              details={
                rebootRequired
                  ? "Kernel update pending (/var/run/reboot-required). Reboot the StacksOS host in a maintenance window."
                  : `Kernel ${ops?.host?.kernel ?? "—"}`
              }
            />
            <Row label="LAN proxy is running" ok={proxyActive} details="stacksos-proxy.service" />
            <Row
              label="DB tunnel is hardened (dedicated user + restricted key)"
              ok={dbTunnelHardened}
              details={
                dbTunnelActive
                  ? `evergreen-db-tunnel.service user=${dbTunnelUser || "—"}`
                  : "evergreen-db-tunnel.service is not active"
              }
            />
            <Row
              label="Evergreen TLS verification is enabled"
              ok={!tlsBypass}
              details={
                tlsBypass
                  ? "NODE_TLS_REJECT_UNAUTHORIZED=0 is unsafe; use a proper cert + CA bundle."
                  : caConfigured
                    ? "CA bundle configured"
                    : "No CA bundle configured (ok if Evergreen has a publicly trusted cert)"
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Next steps</CardTitle>
            <CardDescription>Operator tasks to run before opening for a pilot shift.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>1) Run the one-command quality gate on the host: <span className="font-mono">BASE_URL=http://127.0.0.1:3000 ./audit/run_all.sh</span></div>
            <div>2) Confirm backups: Evergreen nightly backup + StacksOS backup units (see runbook).</div>
            <div>3) Confirm a non-dev can restart production safely (see runbook).</div>
            <div className="pt-2">
              <Link className="underline underline-offset-2" href="/staff/help#runbook">
                Open runbook <ArrowRight className="inline h-4 w-4 ml-1" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
