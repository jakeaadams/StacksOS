"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  Clock,
  CreditCard,
  Heart,
  History,
  Library,
  MessageSquare,
  QrCode,
  Settings,
} from "lucide-react";

import { featureFlags } from "@/lib/feature-flags";
import { usePatronSession } from "@/hooks/use-patron-session";
import { cn } from "@/lib/utils";

type AccountNavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

function isAccountActive(pathname: string, href: string) {
  if (href === "/opac/account/settings") {
    return (
      pathname === href ||
      pathname.startsWith("/opac/account/settings/") ||
      pathname.startsWith("/opac/account/security/")
    );
  }
  if (href === "/opac/account/fines") {
    return (
      pathname === href ||
      pathname.startsWith(href + "/") ||
      pathname === "/opac/account/payment-result"
    );
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function AccountNav() {
  const pathname = usePathname();
  const { isLoggedIn, isLoading } = usePatronSession();

  if (isLoading || !isLoggedIn) {
    return null;
  }

  const items: AccountNavItem[] = [
    { label: "Overview", href: "/opac/account", icon: Library },
    { label: "Checkouts", href: "/opac/account/checkouts", icon: BookOpen },
    { label: "Holds", href: "/opac/account/holds", icon: Clock },
    { label: "Fines", href: "/opac/account/fines", icon: CreditCard },
    ...(featureFlags.opacLists
      ? [{ label: "Lists", href: "/opac/account/lists", icon: Heart } satisfies AccountNavItem]
      : []),
    { label: "Messages", href: "/opac/account/messages", icon: MessageSquare },
    { label: "History", href: "/opac/account/history", icon: History },
    ...(featureFlags.opacEvents
      ? [
          {
            label: "Events",
            href: "/opac/account/events",
            icon: CalendarDays,
          } satisfies AccountNavItem,
        ]
      : []),
    { label: "Library Card", href: "/opac/account/library-card", icon: QrCode },
    { label: "Settings", href: "/opac/account/settings", icon: Settings },
  ];

  return (
    <div className="border-b border-border/70 bg-card/90">
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">My Account</p>
          <p className="text-sm text-muted-foreground">
            Keep loans, holds, payments, saved lists, and account security in one place with a clear
            next step on every screen.
          </p>
        </div>
        <nav className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {items.map((item) => {
            const active = isAccountActive(pathname, item.href);
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
        </nav>
      </div>
    </div>
  );
}
