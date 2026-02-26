"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks";
import { fetchWithAuth } from "@/lib/client-fetch";
import { PageContainer, PageHeader, PageContent, EmptyState } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CircleAlert,
  CircleX,
  ListChecks,
  Loader2,
  PlusCircle,
  RefreshCw,
  Router,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Users2,
} from "lucide-react";
import { metricSurfaceClasses } from "@/lib/design-system/surfaces";

type TenantSummary = {
  tenantId: string;
  displayName: string;
  profile: string;
  region: string | null;
  evergreenBaseUrl: string;
  modifiedAt: string | null;
};

type ProfileCatalogItem = {
  type: string;
  description: string;
};

type TenantsResponse = {
  ok: boolean;
  activeTenantId: string;
  tenants: TenantSummary[];
  profileCatalog: ProfileCatalogItem[];
};

type OnboardingCheck = {
  status: "pass" | "warn" | "fail";
  detail: string;
};

type OnboardingResponse = {
  ok: boolean;
  summary: "pass" | "warn" | "fail";
  tenant: {
    tenantId: string;
    displayName: string;
    profile: string;
    evergreenBaseUrl: string;
    activeTenantId: string;
  };
  checks: Record<string, OnboardingCheck>;
  profilePlaybook?: {
    profile: string;
    intro: string;
    tasks: Array<{
      id: string;
      phase: "foundation" | "launch" | "optimization";
      title: string;
      description: string;
      deepLink: string;
      status: CheckStatus;
    }>;
  };
  recommendations: string[];
};

type SaaSRole =
  | "platform_owner"
  | "platform_admin"
  | "tenant_admin"
  | "tenant_operator"
  | "tenant_viewer";

type SaaSRoleBinding = {
  id: number;
  actorId: number | null;
  username: string | null;
  tenantId: string | null;
  role: SaaSRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type SaaSRolesResponse = {
  ok: boolean;
  roles: SaaSRole[];
  bindings: SaaSRoleBinding[];
  platformAdminCount: number;
};

type CheckStatus = OnboardingCheck["status"] | "unknown";

const initialForm = {
  tenantId: "",
  displayName: "",
  profile: "public",
  region: "",
  evergreenBaseUrl: "",
  searchScope: "local",
  copyDepth: "1",
  allowScopeOverride: true,
};

const initialRoleForm = {
  role: "tenant_operator" as SaaSRole,
  tenantId: "",
  actorId: "",
  username: "",
};

function statusVariant(status: CheckStatus): "secondary" | "outline" | "destructive" {
  if (status === "pass") return "secondary";
  if (status === "fail") return "destructive";
  return "outline";
}

function statusIcon(status: CheckStatus) {
  if (status === "pass") return CheckCircle2;
  if (status === "fail") return CircleX;
  return CircleAlert;
}

function phaseLabel(phase: "foundation" | "launch" | "optimization"): string {
  if (phase === "foundation") return "Foundation";
  if (phase === "launch") return "Launch";
  return "Optimization";
}

export default function AdminTenantsPage() {
  const [form, setForm] = useState(initialForm);
  const [roleForm, setRoleForm] = useState(initialRoleForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data: tenantsData,
    isLoading: tenantsLoading,
    refetch: refetchTenants,
  } = useApi<TenantsResponse>("/api/admin/tenants", { immediate: true });

  const {
    data: onboarding,
    isLoading: onboardingLoading,
    refetch: refetchOnboarding,
  } = useApi<OnboardingResponse>("/api/admin/onboarding", { immediate: true });

  const {
    data: saasData,
    isLoading: saasLoading,
    refetch: refetchSaas,
  } = useApi<SaaSRolesResponse>("/api/admin/saas-roles", { immediate: true });

  const profileOptions = tenantsData?.profileCatalog || [];
  const tenants = useMemo(() => tenantsData?.tenants || [], [tenantsData?.tenants]);
  const activeTenantId = tenantsData?.activeTenantId || "default";
  const roleOptions: SaaSRole[] = saasData?.roles?.length
    ? saasData.roles
    : ["platform_owner", "platform_admin", "tenant_admin", "tenant_operator", "tenant_viewer"];

  const activeTenant = useMemo(
    () => tenants.find((tenant) => tenant.tenantId === activeTenantId) || null,
    [tenants, activeTenantId]
  );

  const onboardingEntries = useMemo(
    () => Object.entries(onboarding?.checks || {}) as Array<[string, OnboardingCheck]>,
    [onboarding?.checks]
  );

  const readiness = useMemo(() => {
    const total = onboardingEntries.length;
    const pass = onboardingEntries.filter(([, check]) => check.status === "pass").length;
    const warn = onboardingEntries.filter(([, check]) => check.status === "warn").length;
    const fail = onboardingEntries.filter(([, check]) => check.status === "fail").length;
    const score = total > 0 ? Math.round(((pass + warn * 0.5) / total) * 100) : 0;
    return { total, pass, warn, fail, score };
  }, [onboardingEntries]);
  const playbookTasks = useMemo(
    () => onboarding?.profilePlaybook?.tasks || [],
    [onboarding?.profilePlaybook?.tasks]
  );
  const playbookByPhase = useMemo(
    () => ({
      foundation: playbookTasks.filter((task) => task.phase === "foundation"),
      launch: playbookTasks.filter((task) => task.phase === "launch"),
      optimization: playbookTasks.filter((task) => task.phase === "optimization"),
    }),
    [playbookTasks]
  );

  const tenantCardTone = {
    definedTenants: metricSurfaceClasses("blue"),
    platformAdmins: metricSurfaceClasses("indigo"),
    readiness: metricSurfaceClasses("emerald"),
    activeProfile: metricSurfaceClasses("amber"),
  };

  const roleBindings = useMemo(
    () => (saasData?.bindings || []).slice().sort((a, b) => a.role.localeCompare(b.role)),
    [saasData?.bindings]
  );

  const findCheckStatus = useCallback(
    (keywords: string[]): CheckStatus => {
      const found = onboardingEntries.find(([key]) => {
        const normalized = key.toLowerCase();
        return keywords.some((keyword) => normalized.includes(keyword));
      });
      return found?.[1].status || "unknown";
    },
    [onboardingEntries]
  );

  const onboardingSteps = useMemo<
    Array<{ title: string; description: string; status: CheckStatus }>
  >(
    () => [
      {
        title: "Profile and tenant identity",
        description: "Tenant ID, display name, and profile bundle are configured.",
        status: activeTenant ? "pass" : "warn",
      },
      {
        title: "Evergreen connectivity",
        description: "TLS trust and gateway reachability are healthy.",
        status: findCheckStatus(["gateway", "connect", "ping", "evergreen"]),
      },
      {
        title: "Auth and database access",
        description: "Auth route + DB access checks pass for onboarding readiness.",
        status: findCheckStatus(["auth", "db", "database", "credential"]),
      },
      {
        title: "Workstation and policy footprint",
        description: "Required workstation and baseline policy/config checks are in place.",
        status: findCheckStatus(["workstation", "policy", "settings", "org"]),
      },
    ],
    [activeTenant, findCheckStatus]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const payload = {
        action: "upsert",
        tenant: {
          tenantId: form.tenantId.trim(),
          displayName: form.displayName.trim(),
          profile: { type: form.profile },
          region: form.region.trim() || undefined,
          evergreenBaseUrl: form.evergreenBaseUrl.trim(),
          branding: {},
          featureFlags: {},
          security: {
            ipAllowlist: [],
            idleTimeoutMinutes: 30,
            mfa: { required: false, issuer: "StacksOS" },
          },
          ai: {
            enabled: false,
            maxTokens: 1024,
            temperature: 0.2,
            safetyMode: "balanced",
            budgets: { maxCallsPerHour: 2000, maxUsdPerDay: 0 },
          },
          discovery: {
            defaultSearchScope: form.searchScope,
            defaultCopyDepth: Math.max(0, Math.min(99, parseInt(form.copyDepth || "1", 10) || 1)),
            allowPatronScopeOverride: form.allowScopeOverride,
          },
          integrations: {},
        },
      };

      const res = await fetchWithAuth("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `HTTP ${res.status}`));
      }

      setMessage(json?.message || "Tenant saved.");
      setForm(initialForm);
      await Promise.all([refetchTenants(), refetchOnboarding(), refetchSaas()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function validateTenant(tenantId: string) {
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const res = await fetchWithAuth("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", tenantId }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `HTTP ${res.status}`));
      }

      const ok = Boolean(json?.connectivity?.ok);
      setMessage(
        ok
          ? `Tenant ${tenantId} connectivity check passed.`
          : `Tenant ${tenantId} connectivity check reported failures.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTenant(tenantId: string) {
    if (!confirm(`Delete tenant ${tenantId}?`)) return;

    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetchWithAuth("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", tenantId }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `HTTP ${res.status}`));
      }

      setMessage(`Deleted tenant ${tenantId}.`);
      await refetchTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveRoleBinding(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const actorIdRaw = roleForm.actorId.trim();
      const username = roleForm.username.trim();
      const role = roleForm.role;
      const tenantId = roleForm.tenantId.trim().toLowerCase();

      const actorIdParsed = actorIdRaw ? parseInt(actorIdRaw, 10) : NaN;
      const actorId = Number.isFinite(actorIdParsed) ? actorIdParsed : null;
      if (actorIdRaw && (!actorId || actorId <= 0)) {
        throw new Error("Actor ID must be a positive integer.");
      }
      if (!actorId && !username) {
        throw new Error("Provide actor ID or username.");
      }
      if (role.startsWith("tenant_") && !tenantId) {
        throw new Error("Tenant roles require a tenant ID.");
      }

      const res = await fetchWithAuth("/api/admin/saas-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          actorId: actorId ?? undefined,
          username: username || undefined,
          tenantId: role.startsWith("tenant_") ? tenantId : undefined,
          role,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `HTTP ${res.status}`));
      }

      setMessage("SaaS role binding saved.");
      setRoleForm(initialRoleForm);
      await refetchSaas();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoleBinding(id: number) {
    if (!confirm(`Remove role binding #${id}?`)) return;

    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetchWithAuth("/api/admin/saas-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) {
        throw new Error(String(json?.error || `HTTP ${res.status}`));
      }

      setMessage(`Removed role binding #${id}.`);
      await refetchSaas();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Tenant & Onboarding"
        subtitle="Provision profile-based tenants, validate install readiness, and control SaaS administration access."
        breadcrumbs={[{ label: "Administration", href: "/staff/admin" }, { label: "Tenants" }]}
        actions={[
          {
            label: "Refresh All",
            onClick: () => Promise.all([refetchTenants(), refetchOnboarding(), refetchSaas()]),
            icon: RefreshCw,
            variant: "outline",
          },
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Active: {activeTenantId}</Badge>
          <Badge variant={statusVariant(onboarding?.summary || "unknown")}>
            Readiness {readiness.score}%
          </Badge>
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        {message ? (
          <div className="rounded-xl border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-300/50 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className={tenantCardTone.definedTenants.card}>
            <CardHeader className="pb-2">
              <CardDescription className={tenantCardTone.definedTenants.description}>
                Defined Tenants
              </CardDescription>
              <CardTitle className={`text-2xl ${tenantCardTone.definedTenants.title}`}>
                {tenants.length}
              </CardTitle>
            </CardHeader>
            <CardContent className={`pt-0 text-xs ${tenantCardTone.definedTenants.body}`}>
              Tenant profiles configured on this deployment.
            </CardContent>
          </Card>

          <Card className={tenantCardTone.platformAdmins.card}>
            <CardHeader className="pb-2">
              <CardDescription className={tenantCardTone.platformAdmins.description}>
                Platform Admins
              </CardDescription>
              <CardTitle className={`text-2xl ${tenantCardTone.platformAdmins.title}`}>
                {saasData?.platformAdminCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className={`pt-0 text-xs ${tenantCardTone.platformAdmins.body}`}>
              Active privileged operators across tenant scopes.
            </CardContent>
          </Card>

          <Card className={tenantCardTone.readiness.card}>
            <CardHeader className="pb-2">
              <CardDescription className={tenantCardTone.readiness.description}>
                Readiness Score
              </CardDescription>
              <CardTitle className={`text-2xl ${tenantCardTone.readiness.title}`}>
                {readiness.score}%
              </CardTitle>
            </CardHeader>
            <CardContent className={`pt-0 text-xs ${tenantCardTone.readiness.body}`}>
              {readiness.pass} pass • {readiness.warn} warn • {readiness.fail} fail
            </CardContent>
          </Card>

          <Card className={tenantCardTone.activeProfile.card}>
            <CardHeader className="pb-2">
              <CardDescription className={tenantCardTone.activeProfile.description}>
                Active Profile
              </CardDescription>
              <CardTitle className={`text-2xl ${tenantCardTone.activeProfile.title}`}>
                {activeTenant?.profile || "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className={`pt-0 text-xs ${tenantCardTone.activeProfile.body}`}>
              {activeTenant?.displayName || "No active tenant metadata"}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Provision Tenant
              </CardTitle>
              <CardDescription>
                Profile presets apply default feature bundles for public, school, church, and
                academic libraries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tenantId">Tenant ID</Label>
                    <Input
                      id="tenantId"
                      value={form.tenantId}
                      onChange={(e) => setForm((prev) => ({ ...prev, tenantId: e.target.value }))}
                      placeholder="example: north-district"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      value={form.displayName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, displayName: e.target.value }))
                      }
                      placeholder="North District Library"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile">Profile</Label>
                    <Select
                      value={form.profile}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, profile: value }))}
                    >
                      <SelectTrigger id="profile">
                        <SelectValue placeholder="Select profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {profileOptions.map((profile) => (
                          <SelectItem key={profile.type} value={profile.type}>
                            {profile.type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {profileOptions.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {profileOptions.find((profile) => profile.type === form.profile)
                          ?.description || ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">Region (optional)</Label>
                    <Input
                      id="region"
                      value={form.region}
                      onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                      placeholder="us-east"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="evergreenBaseUrl">Evergreen Base URL</Label>
                  <Input
                    id="evergreenBaseUrl"
                    type="url"
                    value={form.evergreenBaseUrl}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, evergreenBaseUrl: e.target.value }))
                    }
                    placeholder="https://evergreen.yourlibrary.org"
                    required
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="defaultScope">Default OPAC Scope</Label>
                    <Select
                      value={form.searchScope}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          searchScope: value as "local" | "system" | "consortium",
                        }))
                      }
                    >
                      <SelectTrigger id="defaultScope">
                        <SelectValue placeholder="Select scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local branch</SelectItem>
                        <SelectItem value="system">Parent system</SelectItem>
                        <SelectItem value="consortium">Full consortium</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="copyDepth">Default Copy Depth</Label>
                    <Select
                      value={form.copyDepth}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, copyDepth: value }))}
                    >
                      <SelectTrigger id="copyDepth">
                        <SelectValue placeholder="Select depth" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 - selected library only</SelectItem>
                        <SelectItem value="1">1 - include child libraries</SelectItem>
                        <SelectItem value="99">99 - all descendants</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="allowScopeOverride">Patron Scope Override</Label>
                    <div className="flex h-10 items-center justify-between rounded-md border px-3">
                      <span className="text-sm text-muted-foreground">Allow OPAC override</span>
                      <Switch
                        id="allowScopeOverride"
                        checked={form.allowScopeOverride}
                        onCheckedChange={(checked: boolean) =>
                          setForm((prev) => ({ ...prev, allowScopeOverride: Boolean(checked) }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <div className="font-medium">World-class onboarding note</div>
                  <div>
                    Use canonical tenant IDs and stable Evergreen URLs. This keeps cross-tenant
                    RBAC, webhook routing, and audit trails consistent.
                  </div>
                </div>

                <Button type="submit" className="rounded-full" disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlusCircle className="mr-2 h-4 w-4" />
                  )}
                  Save Tenant
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-indigo-200/70 bg-indigo-50/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Onboarding Command Center
              </CardTitle>
              <CardDescription>
                Readiness checks, recommendations, and launch-critical milestones for the active
                tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border bg-white/80 px-3 py-2">
                <div className="text-sm">
                  <div className="font-medium">Active Tenant</div>
                  <div className="text-muted-foreground">
                    {onboarding?.tenant.displayName || activeTenant?.displayName || "—"}
                  </div>
                </div>
                <Badge variant={statusVariant(onboarding?.summary || "unknown")}>
                  {(onboarding?.summary || "unknown").toUpperCase()}
                </Badge>
              </div>

              <div className="grid gap-2">
                {onboardingSteps.map((step) => {
                  const Icon = statusIcon(step.status);
                  return (
                    <div
                      key={step.title}
                      className="rounded-xl border bg-white/80 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{step.title}</span>
                        </div>
                        <Badge variant={statusVariant(step.status)}>{step.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  );
                })}
              </div>

              {playbookTasks.length > 0 ? (
                <div className="rounded-xl border bg-white/80 px-3 py-2">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <ListChecks className="h-4 w-4" />
                    Profile Playbook ({onboarding?.profilePlaybook?.profile || "custom"})
                  </div>
                  {onboarding?.profilePlaybook?.intro ? (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {onboarding.profilePlaybook.intro}
                    </p>
                  ) : null}
                  <div className="space-y-3">
                    {(["foundation", "launch", "optimization"] as const).map((phase) => {
                      const tasks = playbookByPhase[phase];
                      if (tasks.length === 0) return null;
                      return (
                        <div key={phase} className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {phaseLabel(phase)}
                          </div>
                          {tasks.map((task) => (
                            <div key={task.id} className="rounded-lg border px-2 py-2 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{task.title}</span>
                                <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {task.description}
                              </p>
                              <div className="mt-2">
                                <Link
                                  href={task.deepLink}
                                  className="text-xs font-medium text-[hsl(var(--brand-1))] hover:underline"
                                >
                                  Open workflow
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {onboardingLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Running checks...
                </div>
              ) : null}

              {onboardingEntries.length > 0 ? (
                <div className="rounded-xl border bg-white/80 px-3 py-2">
                  <div className="mb-2 text-sm font-medium">Detailed checks</div>
                  <div className="space-y-2">
                    {onboardingEntries.map(([key, check]) => (
                      <div key={key} className="rounded-lg border px-2 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{key}</span>
                          <Badge variant={statusVariant(check.status)}>{check.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {onboarding?.recommendations?.length ? (
                <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm">
                  <div className="mb-1 font-medium text-amber-900 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Recommended actions
                  </div>
                  <ul className="space-y-1 text-amber-900/90">
                    {onboarding.recommendations.map((rec) => (
                      <li key={rec}>• {rec}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Button
                variant="outline"
                onClick={() => refetchOnboarding()}
                disabled={busy || onboardingLoading}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh Checks
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ServerCog className="h-4 w-4" />
              Tenant Inventory
            </CardTitle>
            <CardDescription>
              Local tenant definitions available on this deployment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tenantsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading tenants...
              </div>
            ) : tenants.length === 0 ? (
              <EmptyState
                title="No tenant files yet"
                description="Create the first tenant using the form above."
                icon={Router}
              />
            ) : (
              <div className="space-y-2">
                {tenants.map((tenant) => (
                  <div
                    key={tenant.tenantId}
                    className="flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tenant.displayName}</span>
                        <Badge variant="outline">{tenant.profile}</Badge>
                        {tenant.tenantId === activeTenantId ? <Badge>Active</Badge> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{tenant.tenantId}</span> •{" "}
                        {tenant.evergreenBaseUrl}
                        {tenant.region ? ` • ${tenant.region}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => validateTenant(tenant.tenantId)}
                        disabled={busy}
                      >
                        Validate
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteTenant(tenant.tenantId)}
                        disabled={busy || tenant.tenantId === activeTenantId}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
              <span>
                Changing the active tenant still requires setting <code>STACKSOS_TENANT_ID</code>{" "}
                and restarting the app service.
              </span>
            </div>

            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={() => refetchTenants()} disabled={busy}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh Tenants
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users2 className="h-4 w-4" />
              SaaS Access Control
            </CardTitle>
            <CardDescription>
              Assign platform and tenant roles to staff identities (actor ID or username).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">Active platform admins</span>
              <Badge variant="outline">{saasData?.platformAdminCount ?? 0}</Badge>
            </div>

            <form onSubmit={saveRoleBinding} className="space-y-3 rounded-xl border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={roleForm.role}
                    onValueChange={(value) =>
                      setRoleForm((prev) => ({ ...prev, role: value as SaaSRole }))
                    }
                  >
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenantRoleId">Tenant ID</Label>
                  <Input
                    id="tenantRoleId"
                    value={roleForm.tenantId}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, tenantId: e.target.value }))}
                    placeholder="required for tenant_* roles"
                    disabled={!roleForm.role.startsWith("tenant_")}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="actorId">Actor ID (optional)</Label>
                  <Input
                    id="actorId"
                    value={roleForm.actorId}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, actorId: e.target.value }))}
                    placeholder="example: 1234"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roleUsername">Username (optional)</Label>
                  <Input
                    id="roleUsername"
                    value={roleForm.username}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, username: e.target.value }))}
                    placeholder="example: jake"
                  />
                </div>
              </div>

              <Button type="submit" disabled={busy || saasLoading}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Role Binding
              </Button>
            </form>

            {saasLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading SaaS roles...
              </div>
            ) : (
              <div className="space-y-2">
                {roleBindings.map((binding) => (
                  <div
                    key={binding.id}
                    className="flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{binding.role}</span>
                        <Badge variant="outline">
                          {binding.tenantId ? `tenant:${binding.tenantId}` : "platform"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        actorId={binding.actorId ?? "—"} • username={binding.username ?? "—"}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteRoleBinding(binding.id)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={() => refetchSaas()} disabled={busy}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh Roles
            </Button>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
