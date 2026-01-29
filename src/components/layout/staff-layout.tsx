"use client";

import { useState, useEffect, useCallback } from "react";
import { TopNav } from "./top-nav";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { KeyboardProvider } from "@/components/keyboard/keyboard-shortcuts";
import { AlertTriangle, Loader2 } from "lucide-react";
import { KeyboardShortcutsOverlay, SessionTimeoutWarning } from "@/components/shared";
import { useApi } from "@/hooks";

interface StaffLayoutProps {
  children: React.ReactNode;
}

const SIDEBAR_KEY = "stacksos_sidebar_collapsed";

export function StaffLayout({ children }: StaffLayoutProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();
  const { user, orgs, isLoading, isAuthenticated, logout } = useAuth();

  // Single source of truth for backend connectivity indicators.
  const { data: pingData } = useApi<any>("/api/evergreen/ping", {
    immediate: true,
    revalidateOnFocus: true,
    revalidateInterval: 60_000,
  });

  const evergreenOk = !!pingData?.ok;
  const evergreenStatus = typeof pingData?.status === "number" ? pingData.status : undefined;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const next =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/staff";
      router.push(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored) setSidebarCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
      if (e.key === "q" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        logout();
      }
    },
    [logout]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Handle session expiring - could save drafts here
  const handleSessionExpiring = useCallback(async () => {
    // This is where we could save any unsaved work
    // For now, we just log it - individual components can listen to this event
    console.log("[StacksOS] Session expiring soon - consider saving work");
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 surface-glass rounded-2xl px-8 py-10 shadow-xl animate-float-in">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-1))] via-[hsl(var(--brand-3))] to-[hsl(var(--brand-2))] flex items-center justify-center shadow-lg">
            <span className="text-white font-semibold text-sm">SO</span>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--brand-1))]" />
          <p className="text-sm text-muted-foreground">Loading StacksOS...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <KeyboardProvider>
      <div className="app-shell min-h-screen flex flex-col">
        <TopNav
          onCommandOpen={() => setCommandOpen(true)}
          currentLibrary={user?.activeOrgName || user?.homeLibrary || "Library"}
          userName={user?.displayName || "Staff User"}
          userInitials={
            user?.displayName
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase() || "SU"
          }
          onLogout={logout}
          orgs={orgs}
          evergreenOk={evergreenOk}
          evergreenStatus={evergreenStatus}
        />
        <div className="flex flex-1 min-h-0">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            evergreenOk={evergreenOk}
            evergreenStatus={evergreenStatus}
          />
          <main className="flex-1 min-h-0 overflow-auto pb-10">
            <div className="mx-auto w-full max-w-[1600px] px-5 py-6 sm:px-6 lg:px-8">
              {evergreenOk ? null : (
                <div className="mb-6 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                        <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Evergreen is unreachable</p>
                        <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                          Some actions may fail. If you are at the circulation desk, switch to Offline Mode.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="outline" className="border-amber-300/70 bg-white/60 hover:bg-white dark:border-amber-900/60 dark:bg-amber-950/30">
                        <Link href="/staff/circulation/offline">Open Offline Mode</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
        <KeyboardShortcutsOverlay />
        <SessionTimeoutWarning
          sessionDurationMinutes={480}
          warningBeforeMinutes={5}
          onSessionExpiring={handleSessionExpiring}
        />
        <Toaster position="top-right" richColors />
      </div>
    </KeyboardProvider>
  );
}
