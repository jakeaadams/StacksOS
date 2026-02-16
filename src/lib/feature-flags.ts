/**
 * StacksOS feature flags
 *
 * World-class rule: never show dead UI.
 * If a route or workflow isn't implemented end-to-end, it must be hidden.
 */

const EXPERIMENTAL = process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL === "1";

export const featureFlags = {
    // Major modules
    ill: true,
    opacKids: true,
    // OPAC/Kids world-class roadmap (see docs/OPAC_COMPETITOR_RESEARCH.md)
    opacFacetsV2: true,
    opacHoldsUXV2: true,
    opacBrowseV2: true,
    opacLists: true,
    opacPersonalization: true,
    kidsEngagementV1: true,
    courseReserves: true,

    // Cataloging power tools
    recordBuckets: true,
    marcBatchEdit: true,

    // AI (must never ship demo responses in production workflows)
    ai: EXPERIMENTAL,

    // Reports submodules
    reportTemplates: true,
    myReports: true,
    scheduledReports: true,

    // Admin submodules
    serverAdmin: true,
    adminWorkstations: true,
    userManagement: true,
    copyTags: true,
    statCategories: true,

    // Advanced admin tooling
    policyEditors: true,
    permissionsExplorer: true,
} as const;

export type FeatureFlags = typeof featureFlags;
