"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { OPACFooter } from "@/components/opac/opac-footer";
import { OPACHeader } from "@/components/opac/opac-header";
import { MobileBottomNav } from "@/components/opac/mobile-bottom-nav";
import { Toaster } from "@/components/ui/sonner";
import { useAccessibilityPrefs, applyA11yPrefsToDOM } from "@/hooks/use-accessibility-prefs";
import { cn } from "@/lib/utils";

export function OpacShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isKids = pathname.startsWith("/opac/kids");
  const isTeens = pathname.startsWith("/opac/teens");
  const { dyslexiaFriendly } = useAccessibilityPrefs();

  // Apply a11y preferences to <html> on mount (covers all OPAC pages)
  React.useEffect(() => {
    applyA11yPrefsToDOM();
  }, []);

  if (isKids || isTeens) {
    // Kids and Teens pages provide their own header/footer + styling via their own layout.tsx.
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col bg-muted/30",
        dyslexiaFriendly ? "stacksos-dyslexia" : ""
      )}
    >
      {/* Skip link for keyboard navigation (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg"
      >
        Skip to content
      </a>
      <OPACHeader />
      <main id="main-content" className="flex-1 pb-16 md:pb-0" role="main">
        {children}
      </main>
      <OPACFooter />
      <MobileBottomNav />
      <Toaster />
    </div>
  );
}
