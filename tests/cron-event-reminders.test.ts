import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDueReminders = vi.fn();
const mockMarkReminderSent = vi.fn();
const mockGetEventById = vi.fn();
const mockCreateNotificationEvent = vi.fn();

vi.mock("@/lib/db/opac-events", () => ({
  getDueReminders: mockGetDueReminders,
  markReminderSent: mockMarkReminderSent,
}));

vi.mock("@/lib/events-data", () => ({
  getEventById: mockGetEventById,
}));

vi.mock("@/lib/db/notifications", () => ({
  createNotificationEvent: mockCreateNotificationEvent,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("cron event reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not mark reminder sent when dual-channel enqueue partially fails", async () => {
    mockGetDueReminders.mockResolvedValue([
      {
        registrationId: 123,
        patronId: 42,
        eventId: "evt-1",
        reminderChannel: "both",
      },
    ]);
    mockGetEventById.mockReturnValue({
      id: "evt-1",
      title: "Test Event",
      date: "2026-03-05T19:00:00",
    });

    let callCount = 0;
    mockCreateNotificationEvent.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error("secondary channel failure");
      }
    });

    const { GET } = await import("@/app/api/cron/event-reminders/route");
    const response = await GET(new Request("http://localhost/api/cron/event-reminders") as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sent).toBe(0);
    expect(data.failed).toBe(1);
    expect(mockMarkReminderSent).not.toHaveBeenCalled();
    expect(mockCreateNotificationEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects requests in production when CRON_SECRET is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.CRON_SECRET;

    const { GET } = await import("@/app/api/cron/event-reminders/route");
    const response = await GET(new Request("http://localhost/api/cron/event-reminders") as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
    expect(mockGetDueReminders).not.toHaveBeenCalled();
  });
});
