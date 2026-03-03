import type { TenantConfig } from "@/lib/tenant/schema";

export const TENANT_PROFILE_TYPES = ["public", "school", "church", "academic", "custom"] as const;

export type TenantProfileType = (typeof TENANT_PROFILE_TYPES)[number];

export interface TenantProfileDefaults {
  description: string;
  branding?: {
    primaryColor?: string;
  };
  opac?: {
    heroTitle?: string;
    heroSubtitle?: string;
    searchPlaceholder?: string;
    styleVariant?: "classic" | "vibrant" | "clean";
    quickChips?: Array<{ label: string; href: string }>;
    sections?: {
      showQuickChips?: boolean;
      showBrowseByFormat?: boolean;
      showEvents?: boolean;
      showRecommended?: boolean;
      showNewArrivals?: boolean;
      showPopular?: boolean;
      showStaffPicks?: boolean;
      showLibraryInfo?: boolean;
    };
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
    opac: {
      heroTitle: "Discover Something Great Today",
      heroSubtitle:
        "Find books, audiobooks, movies, and digital resources with real-time availability.",
      searchPlaceholder: "Search titles, authors, subjects, or ISBN...",
      styleVariant: "classic",
      quickChips: [
        { label: "New Arrivals", href: "/opac/new-titles" },
        { label: "Popular Now", href: "/opac/search?sort=popularity" },
        { label: "Staff Picks", href: "/opac/lists" },
        { label: "Browse Subjects", href: "/opac/browse" },
      ],
    },
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
    opac: {
      heroTitle: "Read, Learn, and Grow",
      heroSubtitle:
        "Support classroom learning with reading-level discovery, research tools, and youth-friendly browsing.",
      searchPlaceholder: "Search assignments, reading lists, and topics...",
      styleVariant: "vibrant",
      quickChips: [
        { label: "Kids Search", href: "/opac/kids/search" },
        { label: "Graphic Novels", href: "/opac/search?q=graphic+novel" },
        { label: "STEM Explorer", href: "/opac/search?q=science" },
        { label: "Homework Help", href: "/opac/events" },
      ],
    },
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
    opac: {
      heroTitle: "Grow Faith, Family, and Community",
      heroSubtitle:
        "Discover resources for study groups, family reading, outreach events, and lifelong learning.",
      searchPlaceholder: "Search faith, family, and community resources...",
      styleVariant: "clean",
      quickChips: [
        { label: "Community Reads", href: "/opac/search?q=community" },
        { label: "Family Collection", href: "/opac/search?q=family" },
        { label: "Programs & Events", href: "/opac/events" },
        { label: "Kids Corner", href: "/opac/kids" },
      ],
    },
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
    opac: {
      heroTitle: "Research, Discover, and Cite with Confidence",
      heroSubtitle:
        "Find scholarly resources, digital collections, and current acquisitions across your library system.",
      searchPlaceholder: "Search research topics, authors, and titles...",
      styleVariant: "clean",
      quickChips: [
        { label: "Advanced Search", href: "/opac/advanced-search" },
        { label: "New Acquisitions", href: "/opac/new-titles" },
        { label: "Digital Library", href: "/opac/digital" },
        { label: "Subject Browse", href: "/opac/browse" },
      ],
    },
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
    opac: {
      heroTitle: "Welcome to Your Library Discovery Experience",
      heroSubtitle: "Customize this homepage from Staff > Admin > Settings > OPAC Experience.",
      searchPlaceholder: "Search your catalog...",
      styleVariant: "classic",
      quickChips: [
        { label: "New Arrivals", href: "/opac/new-titles" },
        { label: "Popular Now", href: "/opac/search?sort=popularity" },
        { label: "Browse", href: "/opac/browse" },
        { label: "Events", href: "/opac/events" },
      ],
    },
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
    opac: {
      ...(defaults.opac || {}),
      ...(config.opac || {}),
      sections: {
        ...(defaults.opac?.sections || {}),
        ...(config.opac?.sections || {}),
      },
      quickChips:
        config.opac?.quickChips !== undefined ? config.opac.quickChips : defaults.opac?.quickChips,
    },
  };
}
