"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { clientLogger } from "@/lib/client-logger";

export default function CatalogingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error("Cataloging error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        title="Cataloging Error"
        message="Something went wrong with cataloging. Any unsaved MARC record changes may need to be re-entered."
        error={error}
        onRetry={reset}
        showRetry
        showHome
      />
    </div>
  );
}
