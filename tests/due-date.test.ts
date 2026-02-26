import { describe, expect, it } from "vitest";
import { normalizeCheckoutDueDate } from "@/lib/circulation/due-date";

describe("normalizeCheckoutDueDate", () => {
  it("normalizes date-only input to local end-of-day timestamp", () => {
    expect(normalizeCheckoutDueDate("2026-03-01")).toBe("2026-03-01T23:59:59");
  });

  it("preserves explicit datetime input and adds seconds when omitted", () => {
    expect(normalizeCheckoutDueDate("2026-03-01T10:30")).toBe("2026-03-01T10:30:00");
    expect(normalizeCheckoutDueDate("2026-03-01T10:30:45Z")).toBe("2026-03-01T10:30:45Z");
  });

  it("returns null for invalid input", () => {
    expect(normalizeCheckoutDueDate("not-a-date")).toBeNull();
    expect(normalizeCheckoutDueDate("")).toBeNull();
    expect(normalizeCheckoutDueDate(undefined)).toBeNull();
  });
});
