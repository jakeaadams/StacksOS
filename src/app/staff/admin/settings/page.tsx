"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2,
  BookOpen,
  MapPin,
  Calendar,
  ArrowRight,
  Users,
  DollarSign,
  Rocket,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Smartphone,
  Palette,
  Shield,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface SettingsCard {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  features: string[];
}

interface SetupStep {
  title: string;
  description: string;
  href: string;
}

const SETTINGS_CARDS: SettingsCard[] = [
  {
    title: "Library Settings",
    description:
      "Configure organization unit settings that control library behavior, holds, fines, and authentication policies.",
    href: "/staff/admin/settings/library",
    icon: Building2,
    iconColor: "text-blue-600",
    bgColor: "bg-blue-500/10",
    features: [
      "Holds shelf expiration",
      "Fine charging rules",
      "Authentication settings",
      "Checkout auto-renew",
    ],
  },
  {
    title: "Circulation Policies",
    description:
      "View and manage circulation matrix matchpoints that determine loan rules for different patron and item combinations.",
    href: "/staff/admin/settings/circulation",
    icon: BookOpen,
    iconColor: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    features: [
      "Loan duration rules",
      "Patron group policies",
      "Item type restrictions",
      "Renewal limits",
    ],
  },
  {
    title: "Copy Locations",
    description:
      "Manage shelving locations for library items including visibility, holdability, and circulation settings.",
    href: "/staff/admin/settings/locations",
    icon: MapPin,
    iconColor: "text-indigo-600",
    bgColor: "bg-indigo-500/10",
    features: ["Create new locations", "OPAC visibility", "Holdable settings", "Check-in alerts"],
  },
  {
    title: "Fines & Fees",
    description: "Review fine rules and maximum fine caps used by the circulation matrix.",
    href: "/staff/admin/settings/fines",
    icon: DollarSign,
    iconColor: "text-rose-600",
    bgColor: "bg-rose-500/10",
    features: ["Recurring fine rules", "Maximum fine rules", "Grace periods", "Fine cap behavior"],
  },
  {
    title: "Hours & Closures",
    description:
      "Maintain open hours, closed dates, and calendar changes that affect holds, due dates, and patron expectations.",
    href: "/staff/admin/settings/hours",
    icon: Calendar,
    iconColor: "text-sky-600",
    bgColor: "bg-sky-500/10",
    features: ["Weekly hours", "Closed dates", "Calendar versions", "Rollback support"],
  },
  {
    title: "Digital App Library",
    description:
      "Configure Libby/OverDrive, Hoopla, cloudLibrary, and Kanopy links + connector modes.",
    href: "/staff/admin/settings/econtent",
    icon: Smartphone,
    iconColor: "text-violet-600",
    bgColor: "bg-violet-500/10",
    features: [
      "Provider enablement",
      "Link-out/OAuth/API modes",
      "App deep links",
      "Transaction flags",
    ],
  },
  {
    title: "OPAC Experience",
    description:
      "Tune OPAC hero content, quick chips, section visibility, and visual style without touching Evergreen source.",
    href: "/staff/admin/settings/opac",
    icon: Palette,
    iconColor: "text-amber-600",
    bgColor: "bg-amber-500/10",
    features: [
      "Hero + search copy",
      "Quick chips curation",
      "Homepage section toggles",
      "Style variant controls",
    ],
  },
  {
    title: "Payment Processing",
    description: "Configure online payment processing for patron fines and fees.",
    href: "/staff/admin/settings/payments",
    icon: CreditCard,
    iconColor: "text-purple-600",
    bgColor: "bg-purple-500/10",
    features: [
      "Gateway selection",
      "Test vs. live mode",
      "Receipt customization",
      "Payment minimums",
    ],
  },
  {
    title: "Security",
    description:
      "Configure multi-factor authentication, session policies, and account security options.",
    href: "/staff/admin/settings/security",
    icon: Shield,
    iconColor: "text-cyan-600",
    bgColor: "bg-cyan-500/10",
    features: [
      "MFA (TOTP) enrollment",
      "Patron MFA toggle",
      "Session duration",
      "Security policies",
    ],
  },
];

const SETUP_STEPS: SetupStep[] = [
  {
    title: "Run Onboarding Wizard",
    description:
      "Use profile-guided checks to confirm Evergreen connectivity, auth, and workstation readiness.",
    href: "/staff/admin/onboarding",
  },
  {
    title: "Configure Tenant Basics",
    description:
      "Set tenant profile, discovery scope/depth defaults, and Evergreen base URL for this library environment.",
    href: "/staff/admin/tenants",
  },
  {
    title: "Configure Library Policies",
    description:
      "Set circulation rules, copy locations, and fines so staff and OPAC behavior match your local policy.",
    href: "/staff/admin/settings/library",
  },
  {
    title: "Set Hours & Closures",
    description:
      "Confirm open hours and holiday closures before validating circulation and hold behavior.",
    href: "/staff/admin/settings/hours",
  },
  {
    title: "Customize OPAC Experience",
    description:
      "Set hero text, quick links, and homepage section visibility for a polished patron discovery flow.",
    href: "/staff/admin/settings/opac",
  },
  {
    title: "Configure Digital App Library",
    description:
      "Set Libby/OverDrive, Hoopla, cloudLibrary, and Kanopy connectors so eContent links and app handoff are intentional.",
    href: "/staff/admin/settings/econtent",
  },
  {
    title: "Configure Payment Processing",
    description:
      "Select a payment gateway (Stripe, Square, or PayPal), enter API credentials, and test patron checkout.",
    href: "/staff/admin/settings/payments",
  },
  {
    title: "Review Security Settings",
    description:
      "Decide whether patron MFA is available or required before opening self-service account access broadly.",
    href: "/staff/admin/settings/security",
  },
  {
    title: "Validate End-to-End",
    description:
      "Run workstation/login checks, then verify checkout, holds, digital handoff, and OPAC discovery before go-live.",
    href: "/staff/admin/go-live",
  },
];

export default function SettingsHubPage() {
  const router = useRouter();
  const { user } = useAuth();
  const setupSteps = user?.isPlatformAdmin
    ? SETUP_STEPS
    : SETUP_STEPS.filter((step) => step.href !== "/staff/admin/tenants");

  return (
    <PageContainer>
      <PageHeader
        title="Settings Hub"
        subtitle="Move through setup in order, then tune the Evergreen-backed settings that shape staff workflows and patron discovery."
        breadcrumbs={[{ label: "Administration", href: "/staff/admin" }, { label: "Settings Hub" }]}
        actions={[
          {
            label: "Onboarding Wizard",
            onClick: () => router.push("/staff/admin/onboarding"),
            icon: Rocket,
            variant: "default",
          },
          {
            label: "Go-Live Checklist",
            onClick: () => router.push("/staff/admin/go-live"),
            icon: Users,
            variant: "outline",
          },
        ]}
      />

      <PageContent className="space-y-8">
        <Card className="rounded-2xl border-[hsl(var(--brand-1)/0.28)] bg-[hsl(var(--brand-1)/0.06)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Start Here: Library Setup Path
            </CardTitle>
            <CardDescription>
              Follow this order so tenant defaults, Evergreen policies, patron discovery, and launch
              checks stay aligned.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {setupSteps.map((step, index) => (
              <Link
                key={step.title}
                href={step.href}
                className="block rounded-xl border bg-background px-3 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--brand-1))]" />
                      <span className="text-xs font-semibold text-muted-foreground">
                        {index + 1}.
                      </span>
                      {step.title}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Settings Categories */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SETTINGS_CARDS.map((card) => (
            <Card
              key={card.title}
              className="rounded-2xl hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => router.push(card.href)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div
                    className={`h-12 w-12 rounded-xl flex items-center justify-center ${card.bgColor}`}
                  >
                    <card.icon className={`h-6 w-6 ${card.iconColor}`} />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={"Go to " + card.title}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle className="text-lg mt-3">{card.title}</CardTitle>
                <CardDescription className="text-sm">{card.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Key Features
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {card.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Additional Information */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">About Evergreen Settings</CardTitle>
            <CardDescription>
              How StacksOS settings map onto Evergreen policy behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-4">
            <p>
              Evergreen uses a hierarchical settings system where settings can be defined at
              different organizational levels (consortium, system, branch). Settings at lower levels
              override those at higher levels.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2">Organization Unit Settings</h4>
                <p className="text-xs">
                  Control behavior for specific libraries including holds policies, fine rules, and
                  authentication settings. Changes take effect immediately.
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="font-medium text-foreground mb-2">Circulation Matrix</h4>
                <p className="text-xs">
                  Define matchpoints that combine patron group, item type, and location to determine
                  loan duration, renewal limits, and fine rates.
                </p>
              </div>
            </div>
            <p className="text-xs border-l-2 border-amber-500 pl-3 bg-amber-50 dark:bg-amber-950/20 py-2 rounded-r">
              <strong>Note:</strong> Changes to circulation policies may require staff to log out
              and back in to see the effects. Some settings require specific permissions to modify.
            </p>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
