"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { clientLogger } from "@/lib/client-logger";

export default function PageError({
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
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        title="Something went wrong"
        message="An error occurred while loading this page."
        error={error}
        onRetry={reset}
        showRetry
        showHome
      />
    </div>
  );
}
