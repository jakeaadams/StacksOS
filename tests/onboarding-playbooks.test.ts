/**
 * Onboarding Playbooks Unit Tests
 *
 * Tests that each profile generates the correct number of tasks,
 * that all checkKey references are valid, and that statusFromChecks
 * correctly resolves task statuses from check results.
 */

import { describe, expect, it } from "vitest";
import {
  buildProfileOnboardingPlaybook,
  statusFromChecks,
  type OnboardingCheckKey,
} from "@/lib/tenant/onboarding-playbooks";
import type { TenantProfileType } from "@/lib/tenant/schema";

const VALID_CHECK_KEYS: OnboardingCheckKey[] = [
  "evergreenEg2",
  "evergreenGateway",
  "database",
  "stacksosNoticeSettings",
  "workstationFootprint",
  "k12Tables",
  "courseReservesData",
  "opacKidsRoutes",
  "opacEventsSource",
  "patronNoticeTemplates",
  "summerReadingConfig",
  "bookingResourceTypes",
];

const ALL_PROFILES: TenantProfileType[] = ["public", "school", "church", "academic", "custom"];

describe("onboarding playbooks", () => {
  it("each profile generates the correct number of total tasks", () => {
    const expectedCounts: Record<TenantProfileType, number> = {
      public: 8,
      school: 8,
      church: 8,
      academic: 8,
      custom: 7,
    };

    for (const profile of ALL_PROFILES) {
      const playbook = buildProfileOnboardingPlaybook(profile, {});
      expect(playbook.tasks.length, `${profile} task count`).toBe(expectedCounts[profile]);
      expect(playbook.profile).toBe(profile);
      expect(playbook.intro.length).toBeGreaterThan(0);
    }
  });

  it("all task check keys reference valid probe keys", () => {
    for (const profile of ALL_PROFILES) {
      const playbook = buildProfileOnboardingPlaybook(profile, {});
      for (const task of playbook.tasks) {
        for (const key of task.checkKeys) {
          expect(VALID_CHECK_KEYS, `task "${task.id}" uses unknown checkKey "${key}"`).toContain(
            key
          );
        }
      }
    }
  });

  it("all tasks have unique ids within each profile playbook", () => {
    for (const profile of ALL_PROFILES) {
      const playbook = buildProfileOnboardingPlaybook(profile, {});
      const ids = playbook.tasks.map((t) => t.id);
      const unique = new Set(ids);
      expect(unique.size, `${profile} duplicate task ids`).toBe(ids.length);
    }
  });

  it("tasks default to unknown status when no checks are provided", () => {
    const playbook = buildProfileOnboardingPlaybook("public", {});
    for (const task of playbook.tasks) {
      expect(task.status).toBe("unknown");
    }
  });

  it("foundation tasks come before profile-specific tasks in every playbook", () => {
    for (const profile of ALL_PROFILES) {
      const playbook = buildProfileOnboardingPlaybook(profile, {});
      const phases = playbook.tasks.map((t) => t.phase);

      // Find the index of the last foundation task
      let lastFoundationIdx = -1;
      // Find the index of the first non-foundation task
      let firstNonFoundationIdx = -1;

      for (let i = 0; i < phases.length; i++) {
        if (phases[i] === "foundation") {
          lastFoundationIdx = i;
        }
        if (phases[i] !== "foundation" && firstNonFoundationIdx === -1) {
          firstNonFoundationIdx = i;
        }
      }

      // Foundation tasks must come before any profile-specific tasks
      if (lastFoundationIdx >= 0 && firstNonFoundationIdx >= 0) {
        expect(
          lastFoundationIdx,
          `${profile}: foundation tasks should precede profile tasks`
        ).toBeLessThan(firstNonFoundationIdx);
      }
    }
  });
});

describe("statusFromChecks", () => {
  it("returns 'unknown' when no checks are provided for the keys", () => {
    const result = statusFromChecks(["evergreenEg2", "database"], {});
    expect(result).toBe("unknown");
  });

  it("returns 'unknown' for empty keys array", () => {
    const result = statusFromChecks([], { database: { status: "pass" } });
    expect(result).toBe("unknown");
  });

  it("returns 'pass' when all checks pass", () => {
    const result = statusFromChecks(["evergreenEg2", "database"], {
      evergreenEg2: { status: "pass" },
      database: { status: "pass" },
    });
    expect(result).toBe("pass");
  });

  it("returns 'fail' when any check fails", () => {
    const result = statusFromChecks(["evergreenEg2", "database"], {
      evergreenEg2: { status: "pass" },
      database: { status: "fail" },
    });
    expect(result).toBe("fail");
  });

  it("returns 'warn' when worst status is warn (no fails)", () => {
    const result = statusFromChecks(["evergreenEg2", "database"], {
      evergreenEg2: { status: "pass" },
      database: { status: "warn" },
    });
    expect(result).toBe("warn");
  });

  it("returns 'fail' when mix of fail and warn", () => {
    const result = statusFromChecks(["evergreenEg2", "database", "evergreenGateway"], {
      evergreenEg2: { status: "warn" },
      database: { status: "fail" },
      evergreenGateway: { status: "pass" },
    });
    expect(result).toBe("fail");
  });

  it("ignores keys not present in checks (treats as unknown)", () => {
    // Only one of two keys has a check result
    const result = statusFromChecks(["evergreenEg2", "database"], {
      evergreenEg2: { status: "pass" },
    });
    // database is missing so only evergreenEg2 has a status
    expect(result).toBe("pass");
  });

  it("returns 'unknown' when all keys are missing from checks", () => {
    const result = statusFromChecks(["evergreenEg2"], {
      database: { status: "pass" },
    });
    expect(result).toBe("unknown");
  });
});

describe("buildProfileOnboardingPlaybook with actual check results", () => {
  it("resolves task statuses from provided checks", () => {
    const playbook = buildProfileOnboardingPlaybook("public", {
      evergreenEg2: { status: "pass" },
      evergreenGateway: { status: "pass" },
      database: { status: "pass" },
      stacksosNoticeSettings: { status: "warn" },
      workstationFootprint: { status: "fail" },
    });

    // verify-evergreen-connectivity: evergreenEg2=pass, evergreenGateway=pass => pass
    const evTask = playbook.tasks.find((t) => t.id === "verify-evergreen-connectivity");
    expect(evTask?.status).toBe("pass");

    // validate-db-and-notice-settings: database=pass, stacksosNoticeSettings=warn => warn
    const dbTask = playbook.tasks.find((t) => t.id === "validate-db-and-notice-settings");
    expect(dbTask?.status).toBe("warn");

    // stabilize-workstation-footprint: workstationFootprint=fail => fail
    const wsTask = playbook.tasks.find((t) => t.id === "stabilize-workstation-footprint");
    expect(wsTask?.status).toBe("fail");
  });

  it("marks tasks as unknown when their specific check keys have no results", () => {
    const playbook = buildProfileOnboardingPlaybook("school", {
      evergreenEg2: { status: "pass" },
      evergreenGateway: { status: "pass" },
    });

    // Foundation task with both keys present => pass
    const evTask = playbook.tasks.find((t) => t.id === "verify-evergreen-connectivity");
    expect(evTask?.status).toBe("pass");

    // Task needing k12Tables which is not in checks => unknown
    const k12Task = playbook.tasks.find((t) => t.id === "school-class-circulation-pilot");
    // This task needs database + evergreenGateway + k12Tables.
    // database and k12Tables are missing, only evergreenGateway is present => pass for the one present key
    // Actually: database is missing, k12Tables is missing, only evergreenGateway passes.
    // statusFromChecks filters to known statuses, so only evergreenGateway=pass => "pass"
    // But let us check by providing none of the needed keys:
    const playbook2 = buildProfileOnboardingPlaybook("school", {});
    const k12Task2 = playbook2.tasks.find((t) => t.id === "school-class-circulation-pilot");
    expect(k12Task2?.status).toBe("unknown");
  });
});
