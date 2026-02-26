import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Declare mock fns BEFORE vi.mock (hoisting)
// ---------------------------------------------------------------------------
const mockRegisterPatronForEvent = vi.fn();
const mockCancelPatronEventRegistration = vi.fn();
const mockGetEventRegistrationMetrics = vi.fn();
const mockListPatronEventRegistrations = vi.fn();
const mockListEventRegistrations = vi.fn();
const mockListPatronEventHistory = vi.fn();
const mockUpdatePatronEventReminder = vi.fn();
const mockGetDueReminders = vi.fn();
const mockMarkReminderSent = vi.fn();
const mockGetEventById = vi.fn();
const mockCreateNotificationEvent = vi.fn();
const mockRequirePatronSession = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/db/opac-events", () => ({
  registerPatronForEvent: mockRegisterPatronForEvent,
  cancelPatronEventRegistration: mockCancelPatronEventRegistration,
  getEventRegistrationMetrics: mockGetEventRegistrationMetrics,
  listPatronEventRegistrations: mockListPatronEventRegistrations,
  listEventRegistrations: mockListEventRegistrations,
  listPatronEventHistory: mockListPatronEventHistory,
  updatePatronEventReminder: mockUpdatePatronEventReminder,
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

vi.mock("@/lib/opac-auth", () => ({
  requirePatronSession: mockRequirePatronSession,
  PatronAuthError: class PatronAuthError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.name = "PatronAuthError";
      this.status = status;
    }
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRegistrationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eventId: "evt-001",
    patronId: 100,
    status: "registered",
    waitlistPosition: null,
    reminderChannel: "email",
    reminderOptIn: true,
    reminderScheduledFor: null,
    reminderSentAt: null,
    registeredAt: "2026-03-01T10:00:00.000Z",
    canceledAt: null,
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeMockEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-001",
    title: "Toddler Storytime",
    description: "A storytime event.",
    date: "2026-03-05",
    startTime: "10:00 AM",
    endTime: "10:30 AM",
    branch: "Main Library",
    type: "Storytime",
    ageGroup: "Kids",
    registrationRequired: true,
    spotsAvailable: 5,
    capacity: 10,
    featured: false,
    ...overrides,
  };
}

function makeJsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/opac/events/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

// ---------------------------------------------------------------------------
// Registration lifecycle via the API route
// ---------------------------------------------------------------------------
describe("events lifecycle – registration API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");

    // Default: patron is authenticated
    mockRequirePatronSession.mockResolvedValue({ patronId: 100 });

    // Default: rate-limit allows
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetIn: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers patron when event has available capacity", async () => {
    const event = makeMockEvent({ capacity: 10, spotsAvailable: 5 });
    mockGetEventById.mockReturnValue(event);

    const reg = makeRegistrationRecord({ status: "registered" });
    mockRegisterPatronForEvent.mockResolvedValue({
      registration: reg,
      action: "registered",
      promotedFromWaitlist: false,
    });

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "register", eventId: "evt-001" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action).toBe("registered");
    expect(data.registration.status).toBe("registered");
    expect(mockRegisterPatronForEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-001",
        patronId: 100,
        eventDate: event.date,
        capacity: 10,
      })
    );
  });

  it("waitlists patron when event is at capacity", async () => {
    const event = makeMockEvent({ capacity: 10, spotsAvailable: 0 });
    mockGetEventById.mockReturnValue(event);

    const reg = makeRegistrationRecord({
      status: "waitlisted",
      waitlistPosition: 1,
    });
    mockRegisterPatronForEvent.mockResolvedValue({
      registration: reg,
      action: "waitlisted",
      promotedFromWaitlist: false,
    });

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "register", eventId: "evt-001" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action).toBe("waitlisted");
    expect(data.registration.status).toBe("waitlisted");
    expect(data.message).toMatch(/waitlist/i);
  });

  it("rejects duplicate registration for same event and patron", async () => {
    const event = makeMockEvent();
    mockGetEventById.mockReturnValue(event);

    const reg = makeRegistrationRecord({ status: "registered" });
    mockRegisterPatronForEvent.mockResolvedValue({
      registration: reg,
      action: "already_registered",
      promotedFromWaitlist: false,
    });

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "register", eventId: "evt-001" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action).toBe("already_registered");
  });

  it("assigns correct waitlist position", async () => {
    const event = makeMockEvent({ capacity: 10, spotsAvailable: 0 });
    mockGetEventById.mockReturnValue(event);

    const reg = makeRegistrationRecord({
      status: "waitlisted",
      waitlistPosition: 3,
    });
    mockRegisterPatronForEvent.mockResolvedValue({
      registration: reg,
      action: "waitlisted",
      promotedFromWaitlist: false,
    });

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "register", eventId: "evt-001" }));
    const data = await res.json();

    expect(data.registration.waitlistPosition).toBe(3);
  });

  it("promotes first waitlisted patron on cancellation", async () => {
    const event = makeMockEvent({ capacity: 10 });
    mockGetEventById.mockReturnValue(event);

    const canceledReg = makeRegistrationRecord({
      status: "canceled",
      canceledAt: "2026-03-02T10:00:00.000Z",
    });
    mockCancelPatronEventRegistration.mockResolvedValue({
      registration: canceledReg,
      canceled: true,
      promotedWaitlist: true,
    });

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "cancel", eventId: "evt-001" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.canceled).toBe(true);
    expect(data.promotedWaitlist).toBe(true);
    expect(data.message).toMatch(/waitlisted patron was promoted/i);
  });

  it("handles cancellation when no waitlist exists", async () => {
    const event = makeMockEvent({ capacity: 10 });
    mockGetEventById.mockReturnValue(event);

    const canceledReg = makeRegistrationRecord({
      status: "canceled",
      canceledAt: "2026-03-02T10:00:00.000Z",
    });
    mockCancelPatronEventRegistration.mockResolvedValue({
      registration: canceledReg,
      canceled: true,
      promotedWaitlist: false,
    });

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "cancel", eventId: "evt-001" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.canceled).toBe(true);
    expect(data.promotedWaitlist).toBe(false);
    expect(data.message).toBe("Registration canceled.");
  });

  it("handles event not found gracefully", async () => {
    mockGetEventById.mockReturnValue(null);

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "register", eventId: "evt-nonexistent" }));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/event not found/i);
    expect(mockRegisterPatronForEvent).not.toHaveBeenCalled();
  });

  it("returns 401 when patron is not authenticated", async () => {
    const { PatronAuthError } = await import("@/lib/opac-auth");
    mockRequirePatronSession.mockRejectedValue(new PatronAuthError("Unauthorized"));

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "register", eventId: "evt-001" }));

    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, resetIn: 30000 });

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "register", eventId: "evt-001" }));

    expect(res.status).toBe(429);
    expect(mockRegisterPatronForEvent).not.toHaveBeenCalled();
  });

  it("cancellation returns no-op when no active registration exists", async () => {
    const event = makeMockEvent();
    mockGetEventById.mockReturnValue(event);

    mockCancelPatronEventRegistration.mockResolvedValue({
      registration: null,
      canceled: false,
      promotedWaitlist: false,
    });

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(makeJsonRequest({ action: "cancel", eventId: "evt-001" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.canceled).toBe(false);
    expect(data.message).toMatch(/no active registration/i);
  });

  it("updates reminder preferences for an existing registration", async () => {
    const event = makeMockEvent();
    mockGetEventById.mockReturnValue(event);

    const updated = makeRegistrationRecord({ reminderChannel: "sms" });
    mockUpdatePatronEventReminder.mockResolvedValue(updated);

    const { POST } = await import("@/app/api/opac/events/registrations/route");
    const res = await POST(
      makeJsonRequest({
        action: "update_reminders",
        eventId: "evt-001",
        reminderChannel: "sms",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toMatch(/reminder preferences updated/i);
    expect(mockUpdatePatronEventReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-001",
        patronId: 100,
        reminderChannel: "sms",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Cron reminder tests (extends existing coverage)
// ---------------------------------------------------------------------------
describe("events lifecycle – cron reminders", () => {
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

  it("does not double-send reminders (idempotent markReminderSent)", async () => {
    mockGetDueReminders.mockResolvedValue([
      {
        registrationId: 10,
        patronId: 42,
        eventId: "evt-001",
        reminderChannel: "email",
        reminderScheduledFor: "2026-03-04T09:00:00.000Z",
      },
    ]);
    mockGetEventById.mockReturnValue({
      id: "evt-001",
      title: "Test Event",
      date: "2026-03-05",
    });
    mockCreateNotificationEvent.mockResolvedValue(undefined);
    mockMarkReminderSent.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/cron/event-reminders/route");
    const res1 = await GET(new Request("http://localhost/api/cron/event-reminders") as any);
    const data1 = await res1.json();

    expect(data1.sent).toBe(1);
    expect(mockMarkReminderSent).toHaveBeenCalledTimes(1);
    expect(mockMarkReminderSent).toHaveBeenCalledWith(10);

    // Second run: no due reminders remain
    vi.clearAllMocks();
    vi.resetModules();
    mockGetDueReminders.mockResolvedValue([]);
    mockGetEventById.mockReturnValue(null);

    const { GET: GET2 } = await import("@/app/api/cron/event-reminders/route");
    const res2 = await GET2(new Request("http://localhost/api/cron/event-reminders") as any);
    const data2 = await res2.json();

    expect(data2.processed).toBe(0);
    expect(mockMarkReminderSent).not.toHaveBeenCalled();
  });

  it("processes multiple reminders in a single cron run", async () => {
    const reminders = [
      {
        registrationId: 101,
        patronId: 1,
        eventId: "evt-001",
        reminderChannel: "email",
        reminderScheduledFor: "2026-03-04T09:00:00.000Z",
      },
      {
        registrationId: 102,
        patronId: 2,
        eventId: "evt-002",
        reminderChannel: "sms",
        reminderScheduledFor: "2026-03-04T09:00:00.000Z",
      },
      {
        registrationId: 103,
        patronId: 3,
        eventId: "evt-003",
        reminderChannel: "both",
        reminderScheduledFor: "2026-03-04T09:00:00.000Z",
      },
    ];

    mockGetDueReminders.mockResolvedValue(reminders);
    mockGetEventById.mockReturnValue({
      id: "evt-001",
      title: "Test Event",
      date: "2026-03-05",
    });
    mockCreateNotificationEvent.mockResolvedValue(undefined);
    mockMarkReminderSent.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/cron/event-reminders/route");
    const res = await GET(new Request("http://localhost/api/cron/event-reminders") as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(3);
    expect(data.sent).toBe(3);
    expect(data.failed).toBe(0);
    expect(mockMarkReminderSent).toHaveBeenCalledTimes(3);
    // "both" should create 2 notification events (email + sms)
    // email = 1, sms = 1, both = 2 => total 4
    expect(mockCreateNotificationEvent).toHaveBeenCalledTimes(4);
  });

  it("cron requires auth in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CRON_SECRET = "my-secret";

    const { GET } = await import("@/app/api/cron/event-reminders/route");

    // Without auth header
    const res1 = await GET(new Request("http://localhost/api/cron/event-reminders") as any);
    expect(res1.status).toBe(401);
    expect(mockGetDueReminders).not.toHaveBeenCalled();

    // With wrong token
    const res2 = await GET(
      new Request("http://localhost/api/cron/event-reminders", {
        headers: { authorization: "Bearer wrong-secret" },
      }) as any
    );
    expect(res2.status).toBe(401);

    // With correct token
    mockGetDueReminders.mockResolvedValue([]);
    const res3 = await GET(
      new Request("http://localhost/api/cron/event-reminders", {
        headers: { authorization: "Bearer my-secret" },
      }) as any
    );
    expect(res3.status).toBe(200);
  });

  it("returns empty-state response when no reminders are due", async () => {
    mockGetDueReminders.mockResolvedValue([]);

    const { GET } = await import("@/app/api/cron/event-reminders/route");
    const res = await GET(new Request("http://localhost/api/cron/event-reminders") as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(0);
    expect(mockMarkReminderSent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET endpoint — patron registrations listing
// ---------------------------------------------------------------------------
describe("events lifecycle – GET registrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");

    mockRequirePatronSession.mockResolvedValue({ patronId: 100 });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetIn: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns patron registrations enriched with event data", async () => {
    const reg = makeRegistrationRecord();
    mockListPatronEventRegistrations.mockResolvedValue([reg]);
    mockGetEventById.mockReturnValue(makeMockEvent());
    mockListPatronEventHistory.mockResolvedValue([]);

    const { GET } = await import("@/app/api/opac/events/registrations/route");
    const url = new URL("http://localhost/api/opac/events/registrations");
    const req = {
      nextUrl: url,
      headers: new Headers(),
      url: url.toString(),
    } as any;
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.registrations).toHaveLength(1);
    expect(data.registrations[0].event).toBeDefined();
    expect(data.registrations[0].event.id).toBe("evt-001");
    expect(data.summary.registered).toBe(1);
    expect(data.total).toBe(1);
  });

  it("returns 401 for unauthenticated GET", async () => {
    const { PatronAuthError } = await import("@/lib/opac-auth");
    mockRequirePatronSession.mockRejectedValue(new PatronAuthError("Unauthorized"));

    const { GET } = await import("@/app/api/opac/events/registrations/route");
    const url = new URL("http://localhost/api/opac/events/registrations");
    const req = {
      nextUrl: url,
      headers: new Headers(),
      url: url.toString(),
    } as any;
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
