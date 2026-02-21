"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { clientLogger } from "@/lib/client-logger";
import { useTranslations } from "next-intl";

export default function CatalogingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary.staffCataloging");

  useEffect(() => {
    clientLogger.error("Cataloging error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorState
        title={t("title")}
        message={t("message")}
        error={error}
        onRetry={reset}
        showRetry
        showHome
      />
    </div>
  );
}
