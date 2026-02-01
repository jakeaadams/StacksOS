"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Save } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { clientLogger } from "@/lib/client-logger";

interface SessionTimeoutWarningProps {
  /** Session duration in minutes (default: 480 = 8 hours) */
  sessionDurationMinutes?: number;
  /** Warning shown X minutes before expiry (default: 5) */
  warningBeforeMinutes?: number;
  /** Check interval in seconds (default: 60) */
  checkIntervalSeconds?: number;
  /** Callback when session is about to expire (for saving work) */
  onSessionExpiring?: () => Promise<void> | void;
  /** Callback when session has expired */
  onSessionExpired?: () => void;
}

const SESSION_START_KEY = "stacksos_session_start";
const SESSION_EXTENDED_KEY = "stacksos_session_extended";

export function SessionTimeoutWarning({
  sessionDurationMinutes = 480, // 8 hours default
  warningBeforeMinutes = 5,
  checkIntervalSeconds = 60,
  onSessionExpiring,
  onSessionExpired,
}: SessionTimeoutWarningProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isExtending, setIsExtending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const hasCalledExpiringRef = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize session start time when user logs in
  useEffect(() => {
    if (user && typeof window !== "undefined") {
      const existingStart = localStorage.getItem(SESSION_START_KEY);
      if (!existingStart) {
        localStorage.setItem(SESSION_START_KEY, Date.now().toString());
      }
    }
  }, [user]);

  // Calculate time remaining until session expires
  const getTimeRemaining = useCallback((): number => {
    if (typeof window === "undefined") return sessionDurationMinutes * 60 * 1000;

    const sessionStart = localStorage.getItem(SESSION_START_KEY);
    const sessionExtended = localStorage.getItem(SESSION_EXTENDED_KEY);

    const startTime = sessionExtended
      ? parseInt(sessionExtended, 10)
      : sessionStart
        ? parseInt(sessionStart, 10)
        : Date.now();

    const expiryTime = startTime + sessionDurationMinutes * 60 * 1000;
    return Math.max(0, expiryTime - Date.now());
  }, [sessionDurationMinutes]);

  // Check session status
  const checkSession = useCallback(async () => {
    if (!user) return;

    const remaining = getTimeRemaining();
    const warningThreshold = warningBeforeMinutes * 60 * 1000;

    if (remaining <= 0) {
      // Session has expired
      setShowWarning(false);
      setShowExpired(true);
      onSessionExpired?.();
      return;
    }

    if (remaining <= warningThreshold && !showWarning && !showExpired) {
      // Show warning
      setTimeRemaining(remaining);
      setShowWarning(true);

      // Call expiring callback once
      if (!hasCalledExpiringRef.current && onSessionExpiring) {
        hasCalledExpiringRef.current = true;
        setIsSaving(true);
        try {
          await onSessionExpiring();
        } catch (error) {
          clientLogger.error("Error in onSessionExpiring callback:", error);
        } finally {
          setIsSaving(false);
        }
      }

      // Start countdown
      if (!countdownIntervalRef.current) {
        countdownIntervalRef.current = setInterval(() => {
          const newRemaining = getTimeRemaining();
          setTimeRemaining(newRemaining);

          if (newRemaining <= 0) {
            setShowWarning(false);
            setShowExpired(true);
            onSessionExpired?.();
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
          }
        }, 1000);
      }
    }
  }, [user, getTimeRemaining, warningBeforeMinutes, showWarning, showExpired, onSessionExpiring, onSessionExpired]);

  // Set up check interval
  useEffect(() => {
    if (!user) return;

    // Initial check
    checkSession();

    // Set up interval
    checkIntervalRef.current = setInterval(checkSession, checkIntervalSeconds * 1000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [user, checkSession, checkIntervalSeconds]);

  // Listen for auth expired events from API calls
  useEffect(() => {
    const handleAuthExpired = () => {
      setShowWarning(false);
      setShowExpired(true);
      onSessionExpired?.();
    };

    window.addEventListener("stacksos:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("stacksos:auth-expired", handleAuthExpired);
  }, [onSessionExpired]);

  // Extend session
  const handleExtendSession = async () => {
    setIsExtending(true);
    try {
      // Call the auth check endpoint to refresh the session
      const response = await fetch("/api/evergreen/auth", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.authenticated) {
          // Session is still valid, update the extended timestamp
          localStorage.setItem(SESSION_EXTENDED_KEY, Date.now().toString());
          setShowWarning(false);
          hasCalledExpiringRef.current = false;

          // Clear countdown
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        } else {
          // Session is no longer valid
          setShowWarning(false);
          setShowExpired(true);
        }
      } else {
        // Request failed, session may be expired
        setShowWarning(false);
        setShowExpired(true);
      }
    } catch (error) {
      clientLogger.error("Failed to extend session:", error);
      setShowWarning(false);
      setShowExpired(true);
    } finally {
      setIsExtending(false);
    }
  };

  // Handle logout/redirect
  const handleLogout = async () => {
    // Clear session storage
    localStorage.removeItem(SESSION_START_KEY);
    localStorage.removeItem(SESSION_EXTENDED_KEY);

    await logout();
    router.push("/login");
  };

  // Format time remaining
  const formatTimeRemaining = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${seconds} seconds`;
  };

  if (!user) return null;

  return (
    <>
      {/* Session expiring warning */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <AlertDialogTitle>Session Expiring Soon</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-3">
              <p>
                Your session will expire in{" "}
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {timeRemaining !== null ? formatTimeRemaining(timeRemaining) : "a few minutes"}
                </span>
                .
              </p>
              {isSaving && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Save className="h-4 w-4 animate-pulse" />
                  <span>Saving your work...</span>
                </div>
              )}
              <p className="text-sm">
                Click &quot;Extend Session&quot; to continue working, or you will be signed out automatically.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleLogout}>Sign Out Now</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={handleExtendSession}
                disabled={isExtending}
                className="bg-primary hover:bg-primary/90"
              >
                {isExtending ? "Extending..." : "Extend Session"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Session expired dialog */}
      <AlertDialog open={showExpired}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Session Expired</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-3">
              <p>
                Your session has expired for security reasons. Please sign in again to continue.
              </p>
              <p className="text-sm text-muted-foreground">
                Any unsaved work may have been lost. We recommend saving your work frequently.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction asChild>
              <Button onClick={handleLogout} className="w-full sm:w-auto">
                Sign In Again
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default SessionTimeoutWarning;
