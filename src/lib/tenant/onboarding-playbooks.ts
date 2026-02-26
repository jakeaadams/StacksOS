import type { TenantProfileType } from "@/lib/tenant/schema";

export type OnboardingTaskPhase = "foundation" | "launch" | "optimization";
export type OnboardingTaskStatus = "pass" | "warn" | "fail" | "unknown";

export type OnboardingCheckKey =
  | "evergreenEg2"
  | "evergreenGateway"
  | "database"
  | "stacksosNoticeSettings"
  | "workstationFootprint";

export interface OnboardingTaskDefinition {
  id: string;
  phase: OnboardingTaskPhase;
  title: string;
  description: string;
  deepLink: string;
  checkKeys: OnboardingCheckKey[];
}

export interface OnboardingTaskState extends OnboardingTaskDefinition {
  status: OnboardingTaskStatus;
}

export interface ProfileOnboardingPlaybook {
  profile: TenantProfileType;
  intro: string;
  tasks: OnboardingTaskState[];
}

type OnboardingChecksInput = Partial<
  Record<OnboardingCheckKey, { status: "pass" | "warn" | "fail" }>
>;

const FOUNDATION_TASKS: OnboardingTaskDefinition[] = [
  {
    id: "verify-evergreen-connectivity",
    phase: "foundation",
    title: "Verify Evergreen connectivity",
    description: "Confirm EG2 and OSRF gateway connectivity before staff rollout.",
    deepLink: "/staff/help#evergreen-setup",
    checkKeys: ["evergreenEg2", "evergreenGateway"],
  },
  {
    id: "validate-db-and-notice-settings",
    phase: "foundation",
    title: "Validate DB and notice settings",
    description:
      "Confirm DB connectivity and seeded notice preference settings for patron messaging.",
    deepLink: "/staff/admin/notifications",
    checkKeys: ["database", "stacksosNoticeSettings"],
  },
  {
    id: "stabilize-workstation-footprint",
    phase: "foundation",
    title: "Stabilize workstation footprint",
    description: "Ensure workstation auto-registration remains controlled and reusable per branch.",
    deepLink: "/staff/admin/workstations",
    checkKeys: ["workstationFootprint"],
  },
];

const PROFILE_TASKS: Record<
  TenantProfileType,
  Omit<ProfileOnboardingPlaybook, "tasks"> & { tasks: OnboardingTaskDefinition[] }
> = {
  public: {
    profile: "public",
    intro: "Public profile emphasizes discovery UX, events, and family account workflows.",
    tasks: [
      {
        id: "public-opac-launch",
        phase: "launch",
        title: "Launch OPAC discovery surfaces",
        description:
          "Enable kids/teens/events digital discovery entry points and verify language/location filters.",
        deepLink: "/opac/search",
        checkKeys: ["evergreenGateway"],
      },
      {
        id: "public-patron-communications",
        phase: "launch",
        title: "Harden patron communications",
        description: "Verify holds/bills notice previews and outbound messaging provider behavior.",
        deepLink: "/staff/admin/notifications",
        checkKeys: ["stacksosNoticeSettings"],
      },
    ],
  },
  school: {
    profile: "school",
    intro: "School profile emphasizes class circulation, reserves, and student-safe workflows.",
    tasks: [
      {
        id: "school-class-circulation-pilot",
        phase: "launch",
        title: "Pilot class circulation by branch",
        description:
          "Run classroom circulation pilot, validate teacher roster handling, and verify return workflows.",
        deepLink: "/staff/circulation/class-circulation",
        checkKeys: ["database", "evergreenGateway"],
      },
      {
        id: "school-course-reserves",
        phase: "optimization",
        title: "Configure course reserves workflows",
        description:
          "Validate reserve course/term setup and reserve visibility in student discovery paths.",
        deepLink: "/staff/course-reserves",
        checkKeys: ["database"],
      },
    ],
  },
  church: {
    profile: "church",
    intro: "Church profile emphasizes volunteer-friendly circulation and event-led engagement.",
    tasks: [
      {
        id: "church-simplified-circulation",
        phase: "launch",
        title: "Enable simplified circulation desk flow",
        description:
          "Validate quick checkout/checkin patterns for volunteer operators and part-time staff.",
        deepLink: "/staff/circulation",
        checkKeys: ["database", "workstationFootprint"],
      },
      {
        id: "church-events-and-groups",
        phase: "optimization",
        title: "Operationalize events and group engagement",
        description:
          "Verify events publishing and patron communications for ministry and community programs.",
        deepLink: "/opac/events",
        checkKeys: ["stacksosNoticeSettings"],
      },
    ],
  },
  academic: {
    profile: "academic",
    intro: "Academic profile emphasizes research discovery, reserves, and governed policy changes.",
    tasks: [
      {
        id: "academic-discovery-scope",
        phase: "launch",
        title: "Validate system/consortium discovery scope",
        description:
          "Confirm scope/depth defaults align with multi-campus resource sharing expectations.",
        deepLink: "/opac/search",
        checkKeys: ["evergreenGateway"],
      },
      {
        id: "academic-reserves-and-governance",
        phase: "optimization",
        title: "Harden reserves and governance workflow",
        description:
          "Validate course reserves operations and audit-ready change management for policy updates.",
        deepLink: "/staff/course-reserves",
        checkKeys: ["database", "stacksosNoticeSettings"],
      },
    ],
  },
  custom: {
    profile: "custom",
    intro: "Custom profile gives you a baseline and expects tenant-specific launch decisions.",
    tasks: [
      {
        id: "custom-feature-bundle-review",
        phase: "launch",
        title: "Review custom feature bundle",
        description: "Confirm enabled modules and RBAC scope for this tenant before go-live.",
        deepLink: "/staff/admin/settings/library",
        checkKeys: ["database", "evergreenGateway"],
      },
      {
        id: "custom-governance-check",
        phase: "optimization",
        title: "Establish governance and rollback routines",
        description:
          "Define change approvals, incident ownership, and rollback procedures for tenant config.",
        deepLink: "/staff/admin/ops",
        checkKeys: ["database"],
      },
    ],
  },
};

function statusFromChecks(
  keys: OnboardingCheckKey[],
  checks: OnboardingChecksInput
): OnboardingTaskStatus {
  if (keys.length === 0) return "unknown";
  const statuses = keys
    .map((key) => checks[key]?.status)
    .filter((status): status is "pass" | "warn" | "fail" => Boolean(status));
  if (statuses.length === 0) return "unknown";
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

export function buildProfileOnboardingPlaybook(
  profile: TenantProfileType,
  checks: OnboardingChecksInput
): ProfileOnboardingPlaybook {
  const profileSpec = PROFILE_TASKS[profile] || PROFILE_TASKS.public;
  const definitions = [...FOUNDATION_TASKS, ...profileSpec.tasks];

  return {
    profile: profileSpec.profile,
    intro: profileSpec.intro,
    tasks: definitions.map((task) => ({
      ...task,
      status: statusFromChecks(task.checkKeys, checks),
    })),
  };
}
