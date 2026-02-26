import type { TenantConfig } from "@/lib/tenant/schema";

export const TENANT_PROFILE_TYPES = ["public", "school", "church", "academic", "custom"] as const;

export type TenantProfileType = (typeof TENANT_PROFILE_TYPES)[number];

export interface TenantProfileDefaults {
  description: string;
  branding?: {
    primaryColor?: string;
  };
  discovery: {
    defaultSearchScope: "local" | "system" | "consortium";
    defaultCopyDepth: number;
    allowPatronScopeOverride: boolean;
  };
  featureFlags: Record<string, boolean>;
}

const PROFILE_DEFAULTS: Record<TenantProfileType, TenantProfileDefaults> = {
  public: {
    description: "Public library defaults: discovery, events, digital, family-friendly OPAC.",
    branding: { primaryColor: "#0f766e" },
    discovery: {
      defaultSearchScope: "local",
      defaultCopyDepth: 1,
      allowPatronScopeOverride: true,
    },
    featureFlags: {
      opacEvents: true,
      opacDigitalLibrary: true,
      opacKids: true,
      opacTeens: true,
      courseReserves: false,
      k12ClassCirculation: false,
      k12AssetManagement: false,
      policyEditors: true,
      permissionsExplorer: true,
    },
  },
  school: {
    description: "School/K-12 defaults: class workflows, reserves, youth discovery.",
    branding: { primaryColor: "#1d4ed8" },
    discovery: {
      defaultSearchScope: "local",
      defaultCopyDepth: 0,
      allowPatronScopeOverride: true,
    },
    featureFlags: {
      opacEvents: true,
      opacDigitalLibrary: true,
      opacKids: true,
      opacTeens: true,
      courseReserves: true,
      k12ClassCirculation: true,
      k12AssetManagement: true,
      policyEditors: true,
      permissionsExplorer: true,
    },
  },
  church: {
    description: "Faith/church defaults: lightweight operations, events, groups, and outreach.",
    branding: { primaryColor: "#7c2d12" },
    discovery: {
      defaultSearchScope: "local",
      defaultCopyDepth: 0,
      allowPatronScopeOverride: true,
    },
    featureFlags: {
      opacEvents: true,
      opacDigitalLibrary: true,
      opacKids: true,
      opacTeens: false,
      courseReserves: false,
      k12ClassCirculation: false,
      k12AssetManagement: false,
      policyEditors: true,
      permissionsExplorer: true,
    },
  },
  academic: {
    description:
      "Academic defaults: broader discovery scope, course reserves, and research workflows.",
    branding: { primaryColor: "#1e3a8a" },
    discovery: {
      defaultSearchScope: "system",
      defaultCopyDepth: 1,
      allowPatronScopeOverride: true,
    },
    featureFlags: {
      opacEvents: true,
      opacDigitalLibrary: true,
      opacKids: false,
      opacTeens: false,
      courseReserves: true,
      k12ClassCirculation: false,
      k12AssetManagement: false,
      policyEditors: true,
      permissionsExplorer: true,
    },
  },
  custom: {
    description: "Custom profile: no default overrides beyond base platform values.",
    discovery: {
      defaultSearchScope: "local",
      defaultCopyDepth: 1,
      allowPatronScopeOverride: true,
    },
    featureFlags: {},
  },
};

export function getTenantProfileDefaults(profileType: TenantProfileType): TenantProfileDefaults {
  return PROFILE_DEFAULTS[profileType] || PROFILE_DEFAULTS.public;
}

export function getTenantProfileCatalog() {
  return TENANT_PROFILE_TYPES.map((type) => ({
    type,
    ...getTenantProfileDefaults(type),
  }));
}

export function applyTenantProfileDefaults(config: TenantConfig): TenantConfig {
  const profileType = config.profile?.type || "public";
  const defaults = getTenantProfileDefaults(profileType);

  return {
    ...config,
    profile: {
      type: profileType,
      notes: config.profile?.notes,
    },
    branding: {
      ...(defaults.branding || {}),
      ...(config.branding || {}),
    },
    featureFlags: {
      ...(defaults.featureFlags || {}),
      ...(config.featureFlags || {}),
    },
    discovery: {
      ...(defaults.discovery || {}),
      ...(config.discovery || {}),
    },
  };
}
