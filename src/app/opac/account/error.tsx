"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { clientLogger } from "@/lib/client-logger";

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error("OPAC account error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        title="Account Error"
        message="Something went wrong loading your account. Your account data is safe. Please try again or contact library staff for assistance."
        error={error}
        onRetry={reset}
        showRetry
        showHome
      />
    </div>
  );
}
