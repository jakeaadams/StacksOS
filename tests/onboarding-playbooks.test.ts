/**
 * Onboarding Playbooks Unit Tests
 *
 * Tests that each profile generates the correct number of tasks
 * and that all checkKey references are valid.
 */

import { describe, expect, it } from "vitest";
import {
  buildProfileOnboardingPlaybook,
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
});
