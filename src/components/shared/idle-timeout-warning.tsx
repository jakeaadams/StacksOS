"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { fetchWithAuth } from "@/lib/client-fetch";

interface IdleTimeoutWarningProps {
  idleTimeoutMinutes: number;
  warningBeforeMinutes?: number;
}

const LAST_ACTIVITY_KEY = "stacksos_last_activity";

export function IdleTimeoutWarning({ idleTimeoutMinutes, warningBeforeMinutes = 2 }: IdleTimeoutWarningProps) {
  const { user, logout } = useAuth();
  const idleMs = Math.max(1, idleTimeoutMinutes) * 60_000;
  const warnMs = Math.min(idleMs, Math.max(30_000, warningBeforeMinutes * 60_000));

  const [open, setOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(idleMs);
  const intervalRef = useRef<number | null>(null);

  const setActivityNow = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  }, []);

  const getLastActivity = useCallback(() => {
    if (typeof window === "undefined") return Date.now();
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const t = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(t) ? t : Date.now();
  }, []);

  const format = useCallback((ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }, []);

  const tick = useCallback(() => {
    const last = getLastActivity();
    const remaining = idleMs - (Date.now() - last);
    setRemainingMs(remaining);

    if (remaining <= 0) {
      setOpen(false);
      void logout();
      return;
    }

    if (remaining <= warnMs) {
      setOpen(true);
    } else if (open) {
      setOpen(false);
    }
  }, [getLastActivity, idleMs, logout, open, warnMs]);

  useEffect(() => {
    if (!user) return;
    setActivityNow();

    const onActivity = () => setActivityNow();
    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });

    intervalRef.current = window.setInterval(tick, 1000);

    return () => {
      for (const ev of events) window.removeEventListener(ev, onActivity as any);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [setActivityNow, tick, user]);

  const staySignedIn = useCallback(async () => {
    try {
      // Touch the server session to keep last_seen_at fresh.
      await fetchWithAuth("/api/evergreen/auth", { method: "GET" });
      setActivityNow();
      setOpen(false);
    } catch {
      // If refresh fails, logout will handle redirect.
      await logout();
    }
  }, [logout, setActivityNow]);

  if (!user) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Session expiring due to inactivity
          </AlertDialogTitle>
          <AlertDialogDescription>
            You’ll be signed out in <span className="font-mono">{format(remainingMs)}</span> unless you confirm you’re still here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => void logout()}>
            Sign out now
          </Button>
          <Button onClick={() => void staySignedIn()}>
            Stay signed in
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
