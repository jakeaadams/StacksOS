"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  CreditCard,
  Globe,
  MapPin,
  Palette,
  Rocket,
  Shield,
  Sliders,
  Smartphone,
  BookOpen,
  DollarSign,
  CheckCircle2,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const workflowItems: NavItem[] = [
  { label: "Onboarding", href: "/staff/admin/onboarding", icon: Rocket },
  { label: "Settings Hub", href: "/staff/admin/settings", icon: Sliders },
  { label: "Go-Live", href: "/staff/admin/go-live", icon: CheckCircle2 },
];

const settingsItems: NavItem[] = [
  { label: "Library", href: "/staff/admin/settings/library", icon: Globe },
  { label: "Circulation", href: "/staff/admin/settings/circulation", icon: BookOpen },
  { label: "Locations", href: "/staff/admin/settings/locations", icon: MapPin },
  { label: "Hours", href: "/staff/admin/settings/hours", icon: Calendar },
  { label: "Fines", href: "/staff/admin/settings/fines", icon: DollarSign },
  { label: "OPAC", href: "/staff/admin/settings/opac", icon: Palette },
  { label: "Digital", href: "/staff/admin/settings/econtent", icon: Smartphone },
  { label: "Payments", href: "/staff/admin/settings/payments", icon: CreditCard },
  { label: "Security", href: "/staff/admin/settings/security", icon: Shield },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavRow({ title, items }: { title: string; items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-[hsl(var(--brand-1))]/25 bg-[hsl(var(--brand-1))]/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-[hsl(var(--brand-1))]" : "text-muted-foreground"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function StaffSettingsNav() {
  return (
    <div className="border-b border-border/70 bg-background/95">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Setup & Settings</p>
          <p className="text-sm text-muted-foreground">
            Follow the setup path first, then move through the settings that shape staff workflows,
            patron discovery, and go-live readiness.
          </p>
        </div>
        <NavRow title="Workflow" items={workflowItems} />
        <NavRow title="Configuration" items={settingsItems} />
      </div>
    </div>
  );
}
