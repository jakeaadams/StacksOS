"use client";

import { useRouter } from "next/navigation";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, BookOpen, MapPin, ArrowRight, Users, DollarSign } from "lucide-react";

interface SettingsCard {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  features: string[];
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
];

export default function SettingsHubPage() {
  const router = useRouter();

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        subtitle="Configure library policies, circulation rules, and system behavior."
        breadcrumbs={[{ label: "Administration", href: "/staff/admin" }, { label: "Settings" }]}
        actions={[
          {
            label: "User Management",
            onClick: () => router.push("/staff/admin/users"),
            icon: Users,
            variant: "outline",
          },
        ]}
      />

      <PageContent className="space-y-8">
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
            <CardDescription>Understanding how settings work in Evergreen ILS</CardDescription>
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
