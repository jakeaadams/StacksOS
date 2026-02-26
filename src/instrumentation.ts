/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the Next.js server starts. Used to validate environment
 * variables and apply pending database migrations before the app accepts
 * traffic.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run server-side validation (skip edge runtime and client bundles).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@/lib/logger");
    const { validateEnv } = await import("@/lib/env-validation");
    validateEnv();

    const { runMigrations } = await import("@/lib/db/migrations");
    try {
      const result = await runMigrations();
      if (result.applied.length > 0) {
        logger.info(
          { component: "instrumentation", appliedMigrations: result.applied },
          `[instrumentation] Applied ${result.applied.length} migration(s): ${result.applied.join(", ")}`
        );
      } else {
        logger.info(
          { component: "instrumentation" },
          "[instrumentation] Database schema is up to date."
        );
      }
    } catch (err) {
      logger.error(
        { component: "instrumentation", error: String(err) },
        "[instrumentation] Migration failed"
      );
      // Do not throw - let the app start even if migrations fail, so operators
      // can inspect logs and retry. The DB layer will surface errors on first
      // query if the schema is out of date.
    }
  }
}
