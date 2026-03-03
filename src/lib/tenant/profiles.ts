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
      heroTitle: "Discover Your Next Favorite",
      heroSubtitle: "Search books, movies, audiobooks, and digital resources in one place.",
      searchPlaceholder: "Search books, movies, music...",
      styleVariant: "classic",
      quickChips: [
        { label: "New Releases", href: "/opac/new-titles" },
        { label: "Popular", href: "/opac/search?sort=popularity" },
        { label: "Award Winners", href: "/opac/search?q=subject%3A+award+winners" },
        { label: "Book Club", href: "/opac/search?q=subject%3A+book+club" },
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
      heroTitle: "Read, Learn, and Explore",
      heroSubtitle: "Find classroom titles, research materials, and reading-level collections.",
      searchPlaceholder: "Search books, assignments, and topics...",
      styleVariant: "vibrant",
      quickChips: [
        { label: "Reading Lists", href: "/opac/search?q=subject%3A+reading+list" },
        { label: "Research", href: "/opac/search?q=subject%3A+research" },
        { label: "Graphic Novels", href: "/opac/search?format=graphic_novel" },
        { label: "STEM", href: "/opac/search?q=subject%3A+STEM+science" },
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
      heroTitle: "Discover Faith and Community Resources",
      heroSubtitle: "Find studies, devotionals, and family resources for every ministry.",
      searchPlaceholder: "Search studies, devotionals, and more...",
      styleVariant: "clean",
      quickChips: [
        { label: "Bible Studies", href: "/opac/search?q=subject%3A+bible+study" },
        { label: "Devotionals", href: "/opac/search?q=subject%3A+devotional" },
        { label: "Children's Ministry", href: "/opac/search?q=subject%3A+children+ministry" },
        { label: "Small Groups", href: "/opac/search?q=subject%3A+small+group" },
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
      heroTitle: "Research Starts Here",
      heroSubtitle:
        "Search reserves, journals, and scholarly materials across your campus libraries.",
      searchPlaceholder: "Search course reserves, journals, and topics...",
      styleVariant: "clean",
      quickChips: [
        { label: "Course Reserves", href: "/opac/course-reserves" },
        { label: "Databases", href: "/opac/search?format=database" },
        { label: "Journals", href: "/opac/search?format=serial" },
        { label: "New Acquisitions", href: "/opac/new-titles" },
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
      styleVariant: "classic",
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
