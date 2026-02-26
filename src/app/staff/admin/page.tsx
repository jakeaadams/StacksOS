"use client";

import type { ComponentType } from "react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { PageContainer, PageHeader, PageContent, StatusBadge } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks";
import { featureFlags } from "@/lib/feature-flags";

import {
  Cable,
  ShieldCheck,
  Users,
  Monitor,
  Settings2,
  Server,
  Tag,
  KeyRound,
  Mail,
  ShieldAlert,
  ClipboardList,
  ClipboardCheck,
  SlidersHorizontal,
  ArrowRight,
  Globe,
  Rocket,
  Sparkles,
} from "lucide-react";

type AdminCard = {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  enabled?: boolean;
  badge?: string;
};

export default function AdminHubPage() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: ping } = useApi<any>("/api/evergreen/ping", { immediate: true });
  const { data: envData } = useApi<any>("/api/env", {
    immediate: true,
    revalidateInterval: 5 * 60_000,
  });

  const evergreenOnline = ping?.ok === true;
  const envLabel = String(envData?.env?.label || "").trim();
  const envTone = String(envData?.env?.tone || "")
    .trim()
    .toLowerCase();

  const cards = useMemo<AdminCard[]>(
    () => [
      {
        title: "Policy Inspector",
        description: "Understand why checkout/holds/statuses behave the way they do.",
        href: "/staff/admin/policy-inspector",
        icon: ShieldCheck,
        tone: "bg-emerald-500/10 text-emerald-600",
      },
      {
        title: "Users",
        description: "View staff accounts and permission profiles from Evergreen.",
        href: "/staff/admin/users",
        icon: Users,
        tone: "bg-blue-500/10 text-blue-600",
        enabled: featureFlags.userManagement,
      },
      {
        title: "Permissions",
        description: "See what your account can do (and why).",
        href: "/staff/admin/permissions",
        icon: KeyRound,
        tone: "bg-indigo-500/10 text-indigo-700",
      },
      {
        title: "Workstations",
        description: "Register circulation workstations per branch.",
        href: "/staff/admin/workstations",
        icon: Monitor,
        tone: "bg-sky-500/10 text-sky-700",
        enabled: featureFlags.adminWorkstations,
      },
      {
        title: "Settings",
        description: "Library settings, circulation policies, and copy locations.",
        href: "/staff/admin/settings",
        icon: Settings2,
        tone: "bg-amber-500/10 text-amber-700",
      },
      {
        title: "Tenants",
        description: "Profile-based tenant onboarding and SaaS readiness checks.",
        href: "/staff/admin/tenants",
        icon: Globe,
        tone: "bg-emerald-500/10 text-emerald-700",
        enabled: featureFlags.tenantConsole && Boolean(user?.isPlatformAdmin),
      },
      {
        title: "Developer Platform",
        description: "Webhook contracts, delivery telemetry, and extension integrations.",
        href: "/staff/admin/developer-platform",
        icon: Cable,
        tone: "bg-cyan-500/10 text-cyan-700",
        enabled: featureFlags.developerPlatform && Boolean(user?.isPlatformAdmin),
      },
      {
        title: "Policy Editors",
        description: "Advanced Evergreen-backed policy views (experimental).",
        href: "/staff/admin/policies",
        icon: SlidersHorizontal,
        tone: "bg-slate-500/10 text-slate-700",
        badge: "Experimental",
        enabled: featureFlags.policyEditors,
      },
      {
        title: "Notifications",
        description: "Edit notice templates and review delivery logs.",
        href: "/staff/admin/notifications",
        icon: Mail,
        tone: "bg-cyan-500/10 text-cyan-700",
      },
      {
        title: "Ops",
        description: "Incident banners, release notes, and support workflows.",
        href: "/staff/admin/ops",
        icon: ShieldAlert,
        tone: "bg-orange-500/10 text-orange-700",
      },
      {
        title: "Go-live",
        description: "Operational checklist for pilot readiness.",
        href: "/staff/admin/go-live",
        icon: ClipboardCheck,
        tone: "bg-teal-500/10 text-teal-700",
      },
      {
        title: "Onboarding Wizard",
        description: "Profile-guided onboarding with phased task execution and probes.",
        href: "/staff/admin/onboarding",
        icon: Rocket,
        tone: "bg-violet-500/10 text-violet-700",
      },
      {
        title: "AI Audit Trail",
        description: "Review AI-generated drafts, decisions, and provider telemetry.",
        href: "/staff/admin/ai-audit",
        icon: Sparkles,
        tone: "bg-purple-500/10 text-purple-700",
        enabled: featureFlags.ai,
      },
      {
        title: "Item Statuses",
        description: "Configure copy statuses (holdable, OPAC visibility, availability).",
        href: "/staff/admin/item-statuses",
        icon: Tag,
        tone: "bg-rose-500/10 text-rose-600",
      },
      {
        title: "Server Health",
        description: "Read-only Evergreen gateway + OpenSRF service status.",
        href: "/staff/admin/server",
        icon: Server,
        tone: "bg-slate-500/10 text-slate-700",
        badge: "Read-only",
        enabled: featureFlags.serverAdmin,
      },
    ],
    [user?.isPlatformAdmin]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Administration"
        subtitle="Find and configure the settings that control how StacksOS behaves (Evergreen-backed)."
        breadcrumbs={[{ label: "Administration" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          {envLabel ? (
            <Badge variant="secondary" className="rounded-full">
              {envLabel}
              {envTone ? ` • ${envTone}` : ""}
            </Badge>
          ) : null}
          <StatusBadge
            label={evergreenOnline ? "Evergreen Online" : "Evergreen Offline"}
            status={evergreenOnline ? "success" : "error"}
          />
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl md:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Your Session</CardTitle>
              <CardDescription>
                Who you are, and what org/workstation you’re acting in.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">User</span>
                <span className="font-medium">{user?.displayName || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Role</span>
                <span className="font-medium">{user?.profileName || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">SaaS Role</span>
                <span className="font-medium">{user?.saasRole || "staff"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Home Library</span>
                <span className="font-medium">{user?.homeLibrary || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active Org</span>
                <span className="font-medium">{user?.activeOrgName || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Workstation</span>
                <span className="font-mono text-xs">{user?.workstation || "—"}</span>
              </div>
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push("/staff/settings")}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Staff Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Admin Hub</CardTitle>
              <CardDescription>Common admin destinations (no dead UI).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {cards
                  .filter((c) => c.enabled !== false)
                  .map((card) => {
                    const Icon = card.icon;
                    return (
                      <Card
                        key={card.href}
                        className="rounded-2xl hover:shadow-sm transition-shadow cursor-pointer group"
                        onClick={() => router.push(card.href)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div
                                className={`h-10 w-10 rounded-xl flex items-center justify-center ${card.tone}`}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium truncate">{card.title}</div>
                                  {card.badge ? (
                                    <Badge
                                      variant="outline"
                                      className="rounded-full text-[10px] px-2 py-0.5"
                                    >
                                      {card.badge}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="text-xs text-muted-foreground line-clamp-2">
                                  {card.description}
                                </div>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                Missing something? Some advanced Evergreen configuration still lives in the
                Evergreen admin UI until StacksOS editors exist. Start with{" "}
                <Link href="/staff/admin/policy-inspector" className="underline underline-offset-2">
                  Policy Inspector
                </Link>{" "}
                to understand what setting you need.
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </PageContainer>
  );
}
