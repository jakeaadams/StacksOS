"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { clientLogger } from "@/lib/client-logger";

export default function ILLError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error("ILL error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        title="Interlibrary Loan Error"
        message="Something went wrong loading interlibrary loans. Please try again."
        error={error}
        onRetry={reset}
        showRetry
        showHome
      />
    </div>
  );
}
