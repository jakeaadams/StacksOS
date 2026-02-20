"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { clientLogger } from "@/lib/client-logger";

export default function CirculationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error("Circulation error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        title="Circulation Error"
        message="Something went wrong with circulation. If you need to continue checking out or checking in, try switching to Offline Mode."
        error={error}
        onRetry={reset}
        showRetry
        showHome
      />
    </div>
  );
}
