"use client";
/**
 * Status HUD Footer - Persistent status bar for power users
 * Shows: connection status, current branch, scanner status, latency
 */


import { useEffect, useState } from "react";
import { STATUS_CHECK_INTERVAL_MS } from "@/lib/constants";

import { 
  WifiOff, 
  MapPin, 
  Scan, 
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

interface StatusHUDProps {
  className?: string;
}

export function StatusHUD({ className }: StatusHUDProps) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState<"ready" | "scanning" | "error">("ready");

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Ping server for latency
  useEffect(() => {
    const measureLatency = async () => {
      const start = performance.now();
      try {
        await fetch("/api/evergreen/ping", { method: "GET",
        credentials: "include", cache: "no-store" });
        const end = performance.now();
        setLatency(Math.round(end - start));
      } catch (error) {
        setLatency(null);
      }
    };

    measureLatency();
    const interval = setInterval(measureLatency, STATUS_CHECK_INTERVAL_MS); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Listen for scan events (custom event from BarcodeInput)
  useEffect(() => {
    const handleScan = (e: CustomEvent) => {
      setLastAction(e.detail?.message || "Item scanned");
      setScannerStatus("scanning");
      setTimeout(() => setScannerStatus("ready"), 500);
    };

    window.addEventListener("stacksos:scan" as any, handleScan);
    return () => window.removeEventListener("stacksos:scan" as any, handleScan);
  }, []);

  // Listen for action events
  useEffect(() => {
    const handleAction = (e: CustomEvent) => {
      setLastAction(e.detail?.message || "Action completed");
    };

    window.addEventListener("stacksos:action" as any, handleAction);
    return () => window.removeEventListener("stacksos:action" as any, handleAction);
  }, []);

  const getLatencyColor = () => {
    if (latency === null) return "text-muted-foreground";
    if (latency < 100) return "text-green-500";
    if (latency < 300) return "text-yellow-500";
    return "text-red-500";
  };

  const getScannerIcon = () => {
    switch (scannerStatus) {
      case "scanning":
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case "error":
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Scan className="h-3 w-3" />;
    }
  };

  return (
    <footer
      className={cn(
        "fixed bottom-0 left-0 right-0 h-8 bg-background/95 backdrop-blur border-t border-border z-40",
        "flex items-center justify-between px-4 text-xs text-muted-foreground",
        className
      )}
    >
      <div className="flex items-center gap-4">
        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-red-500" />
              <span className="text-red-500">Offline</span>
            </>
          )}
        </div>

        {/* Current Branch */}
        {user?.homeLibrary && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            <span>{user.homeLibrary}</span>
          </div>
        )}

        {/* Scanner Status */}
        <div className="flex items-center gap-1.5">
          {getScannerIcon()}
          <span>
            {scannerStatus === "ready" ? "Scanner Ready" : 
             scannerStatus === "scanning" ? "Scanning..." : "Scanner Error"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Last Action */}
        {lastAction && (
          <div className="flex items-center gap-1.5 max-w-[300px]">
            <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
            <span className="truncate">{lastAction}</span>
          </div>
        )}

        {/* Latency */}
        <div className={cn("flex items-center gap-1.5", getLatencyColor())}>
          <Activity className="h-3 w-3" />
          <span>{latency !== null ? `${latency}ms` : "..."}</span>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="hidden md:flex items-center gap-1 text-muted-foreground/60">
          <span>Press</span>
          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">?</kbd>
          <span>for shortcuts</span>
        </div>
      </div>
    </footer>
  );
}
