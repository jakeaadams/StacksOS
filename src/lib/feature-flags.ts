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
    opacKids: EXPERIMENTAL,
    // OPAC/Kids world-class roadmap (see docs/OPAC_COMPETITOR_RESEARCH.md)
    opacFacetsV2: EXPERIMENTAL,
    opacHoldsUXV2: EXPERIMENTAL,
    opacBrowseV2: EXPERIMENTAL,
    opacLists: EXPERIMENTAL,
    opacPersonalization: EXPERIMENTAL,
    kidsEngagementV1: EXPERIMENTAL,
    courseReserves: true,

    // Cataloging power tools (not yet implemented end-to-end)
    recordBuckets: EXPERIMENTAL,
    marcBatchEdit: EXPERIMENTAL,

    // AI (must never ship demo responses in production workflows)
    ai: EXPERIMENTAL,

    // Reports submodules (not yet implemented)
    reportTemplates: EXPERIMENTAL,
    myReports: EXPERIMENTAL,
    scheduledReports: true,

    // Admin submodules (not yet implemented)
    serverAdmin: EXPERIMENTAL,
    adminWorkstations: true,
    userManagement: true,
    copyTags: true,
    statCategories: true,

    // Advanced admin tooling (read-only by default; enable editors later)
    policyEditors: EXPERIMENTAL,
    permissionsExplorer: EXPERIMENTAL,
} as const;

export type FeatureFlags = typeof featureFlags;
