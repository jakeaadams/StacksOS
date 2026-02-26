"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientLogger } from "@/lib/client-logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error("Global application error:", error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-muted/30">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4 py-16">
          <div className="w-full rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h1 className="mb-2 text-2xl font-bold text-foreground">Critical Error</h1>

            <p className="mb-6 text-muted-foreground">
              A critical error has occurred. Please try refreshing the page.
            </p>

            {error.digest ? (
              <p className="mb-6 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground">
                Error ID: {error.digest}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={reset} className="stx-action-primary">
                Try Again
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Go Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
