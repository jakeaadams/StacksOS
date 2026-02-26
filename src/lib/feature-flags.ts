/**
 * StacksOS feature flags
 *
 * World-class rule: never show dead UI.
 * If a route or workflow is not implemented end-to-end, it must be hidden.
 */

const EXPERIMENTAL = process.env.NEXT_PUBLIC_STACKSOS_EXPERIMENTAL === "1";
const PROFILE = String(
  process.env.NEXT_PUBLIC_STACKSOS_TENANT_PROFILE || process.env.STACKSOS_TENANT_PROFILE || "public"
)
  .trim()
  .toLowerCase();

const IS_SCHOOL = PROFILE === "school";
const IS_CHURCH = PROFILE === "church";

export const featureFlags = {
  // Major modules
  ill: true,
  opacKids: true,
  opacTeens: !IS_CHURCH,
  // OPAC/Kids world-class roadmap (see docs/OPAC_COMPETITOR_RESEARCH.md)
  opacFacetsV2: true,
  opacHoldsUXV2: true,
  opacBrowseV2: true,
  opacLists: true,
  opacPersonalization: true,
  kidsEngagementV1: true,
  courseReserves: true,

  // OPAC events calendar and digital library
  opacEvents: true,
  opacDigitalLibrary: true,

  // Cataloging power tools
  recordBuckets: true,
  marcBatchEdit: true,

  // Profile-specific bundles
  k12ClassCirculation: IS_SCHOOL,
  k12AssetManagement: IS_SCHOOL,

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
  tenantConsole: true,
  developerPlatform: true,
} as const;

export type FeatureFlags = typeof featureFlags;
