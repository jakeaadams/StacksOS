"use client";
import { useEffect } from "react";
import { clientLogger } from "@/lib/client-logger";
import { Button } from "@/components/ui/button";

export default function SelfCheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground">
          The self-checkout station encountered an error. Please try again or ask a librarian for
          assistance.
        </p>
        <Button onClick={reset} className="inline-flex items-center justify-center">
          Try Again
        </Button>
      </div>
    </div>
  );
}
