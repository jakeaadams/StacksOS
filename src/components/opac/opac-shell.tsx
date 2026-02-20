"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { OPACFooter } from "@/components/opac/opac-footer";
import { OPACHeader } from "@/components/opac/opac-header";
import { Toaster } from "@/components/ui/sonner";
import { useAccessibilityPrefs } from "@/hooks/use-accessibility-prefs";
import { cn } from "@/lib/utils";

export function OpacShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isKids = pathname.startsWith("/opac/kids");
  const { dyslexiaFriendly } = useAccessibilityPrefs();

  if (isKids) {
    // Kids pages provide their own header/footer + styling via /opac/kids/layout.tsx.
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col bg-muted/30",
        dyslexiaFriendly ? "stacksos-dyslexia" : ""
      )}
    >
      {/* Skip link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0
                 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2
                 focus:outline-none"
      >
        Skip to main content
      </a>
      <OPACHeader />
      <main id="main-content" className="flex-1" role="main">
        {children}
      </main>
      <OPACFooter />
      <Toaster />
    </div>
  );
}
