"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { clientLogger } from "@/lib/client-logger";

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error("Staff area error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        title="Staff Area Error"
        message="Something went wrong in the staff area. Please try again or return to the dashboard."
        error={error}
        onRetry={reset}
        showRetry
        showHome
      />
    </div>
  );
}
