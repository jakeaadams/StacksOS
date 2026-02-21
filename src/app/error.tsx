"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { clientLogger } from "@/lib/client-logger";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary.root");

  useEffect(() => {
    // Log the error to an error reporting service
    clientLogger.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8 max-w-md">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-6">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("message")}
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("tryAgain")}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              {t("goHome")}
            </Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {t("persistMessage")}
        </p>
      </div>
    </div>
  );
}
