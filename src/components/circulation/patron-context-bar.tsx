"use client";

import { useCirculationPatron } from "@/contexts/patron-context";
import { AlertTriangle, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A thin bar rendered below the top nav during circulation routes.
 * Shows the currently loaded patron's name, barcode, alerts, and balance.
 */
export function PatronContextBar() {
  const { patron, clearPatron } = useCirculationPatron();

  if (!patron) return null;

  return (
    <div className="border-b border-border/70 bg-primary-50/60 dark:bg-primary-950/20 px-4 py-1.5 text-sm">
      <div className="mx-auto flex max-w-[1620px] items-center justify-between gap-4 px-1 sm:px-2 lg:px-4">
        <div className="flex items-center gap-3 min-w-0">
          <User className="h-4 w-4 text-primary-600 shrink-0" />
          <span className="font-medium text-foreground truncate">{patron.displayName}</span>
          <span className="font-mono text-xs text-muted-foreground hidden sm:inline">
            {patron.barcode}
          </span>

          {patron.isBlocked && (
            <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-[hsl(var(--status-error-bg))] text-[hsl(var(--status-error-text))]">
              <AlertTriangle className="h-3 w-3" />
              Blocked
            </span>
          )}

          {patron.alerts && patron.alerts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-text))]">
              <AlertTriangle className="h-3 w-3" />
              {patron.alerts.length} alert{patron.alerts.length !== 1 ? "s" : ""}
            </span>
          )}

          {typeof patron.balance === "number" && patron.balance > 0 && (
            <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-text))]">
              ${patron.balance.toFixed(2)} owed
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={clearPatron}
          aria-label="Clear patron"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
