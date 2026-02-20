"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, User, Sparkles, MoreHorizontal } from "lucide-react";
import { featureFlags } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

/**
 * Mobile bottom navigation bar for the OPAC.
 *
 * Shown only on mobile viewports (hidden at md+). Fixed to the bottom of the
 * viewport with safe-area padding for notched phones.
 *
 * Hidden on /opac/login and /opac/register pages.
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  // Hide on login and register pages
  if (pathname === "/opac/login" || pathname === "/opac/register") {
    return null;
  }

  const primaryTabs: NavItem[] = [
    { href: "/opac", label: "Home", icon: Home },
    { href: "/opac/search", label: "Search", icon: Search },
    { href: "/opac/account", label: "Account", icon: User },
  ];

  const hasKids = featureFlags.opacKids;
  const hasTeens = featureFlags.opacTeens;
  const hasOverflow = hasKids && hasTeens;

  // Build the extra tabs
  const overflowItems: NavItem[] = [];
  if (hasKids) {
    overflowItems.push({ href: "/opac/kids", label: "Kids", icon: Sparkles });
  }
  if (hasTeens) {
    overflowItems.push({ href: "/opac/teens", label: "Teens", icon: Sparkles });
  }

  const isActive = (href: string) => {
    if (href === "/opac") return pathname === "/opac";
    return pathname.startsWith(href);
  };

  const isOverflowActive = overflowItems.some((item) => isActive(item.href));

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16">
        {primaryTabs.map((tab) => {
          const active = isActive(tab.href);
          const TabIcon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full px-1 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <TabIcon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}

        {/* If both Kids and Teens are enabled, show a "More" overflow menu */}
        {hasOverflow ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full px-1 transition-colors",
                isOverflowActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">More</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="mb-2">
              {overflowItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className="flex items-center gap-2">
                      <ItemIcon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : overflowItems.length === 1 ? (
          /* If only one of Kids/Teens is enabled, show it as a direct tab */
          <SingleNavTab item={overflowItems[0]} isActive={isActive(overflowItems[0].href)} />
        ) : null}
      </div>
    </nav>
  );
}

function SingleNavTab({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-col items-center justify-center gap-1 flex-1 h-full px-1 transition-colors",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none">{item.label}</span>
    </Link>
  );
}
