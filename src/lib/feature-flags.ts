/**
 * StacksOS feature flags
 *
 * World-class rule: never show dead UI.
 * If a route or workflow isn't implemented end-to-end, it must be hidden.
 */

const EXPERIMENTAL = process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL === "1";

export const featureFlags = {
    // Major modules
    // Keep disabled until we have a real provider/integration.
    ill: EXPERIMENTAL,

    // Cataloging power tools (not yet implemented end-to-end)
    recordBuckets: EXPERIMENTAL,
    marcBatchEdit: EXPERIMENTAL,

    // Reports submodules (not yet implemented)
    reportTemplates: EXPERIMENTAL,
    myReports: EXPERIMENTAL,
    scheduledReports: EXPERIMENTAL,

    // Admin submodules (not yet implemented)
    serverAdmin: EXPERIMENTAL,
    adminWorkstations: EXPERIMENTAL,
    userManagement: EXPERIMENTAL,
} as const;

export type FeatureFlags = typeof featureFlags;
