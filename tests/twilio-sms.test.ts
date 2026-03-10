/**
 * Twilio SMS Provider Unit Tests
 *
 * Tests the Twilio provider path in the SMS service,
 * including auth, form-encoded body, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.STACKSOS_SMS_PROVIDER = "twilio";
  process.env.STACKSOS_SMS_DRY_RUN = "false";
  process.env.STACKSOS_TWILIO_ACCOUNT_SID = "ACtest123456789";
  process.env.STACKSOS_TWILIO_AUTH_TOKEN = "test-auth-token";
  process.env.STACKSOS_TWILIO_FROM_NUMBER = "+15551234567";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Twilio SMS Provider", () => {
  it("should call Twilio Messages API with correct URL", async () => {
    const { sendSms } = await import("@/lib/sms/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sid: "SM123" }),
    } as Response);

    await sendSms({ to: "+15559876543", message: "Your hold is ready!" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest123456789/Messages.json");
  });

  it("should use Basic auth with base64 encoded credentials", async () => {
    const { sendSms } = await import("@/lib/sms/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sid: "SM456" }),
    } as Response);

    await sendSms({ to: "+15559876543", message: "Overdue notice" });

    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    const authHeader = (options?.headers as Record<string, string>)["Authorization"];
    const expectedCredentials = Buffer.from("ACtest123456789:test-auth-token").toString("base64");
    expect(authHeader).toBe(`Basic ${expectedCredentials}`);
  });

  it("should send form-encoded body with To, From, and Body", async () => {
    const { sendSms } = await import("@/lib/sms/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sid: "SM789" }),
    } as Response);

    await sendSms({ to: "+15559876543", message: "Your items are overdue." });

    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    expect((options?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );
    expect(options?.method).toBe("POST");

    const bodyStr = options?.body as string;
    const params = new URLSearchParams(bodyStr);
    expect(params.get("To")).toBe("+15559876543");
    expect(params.get("From")).toBe("+15551234567");
    expect(params.get("Body")).toBe("Your items are overdue.");
  });

  it("should throw when Twilio returns non-ok response", async () => {
    const { sendSms } = await import("@/lib/sms/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"message":"Invalid phone number"}',
    } as Response);

    await expect(sendSms({ to: "invalid", message: "test" })).rejects.toThrow(
      "Twilio API error: 400"
    );
  });

  it("should throw when STACKSOS_TWILIO_ACCOUNT_SID is missing", async () => {
    delete process.env.STACKSOS_TWILIO_ACCOUNT_SID;
    const { sendSms } = await import("@/lib/sms/provider");

    await expect(sendSms({ to: "+15559876543", message: "test" })).rejects.toThrow(
      "STACKSOS_TWILIO_ACCOUNT_SID and STACKSOS_TWILIO_AUTH_TOKEN required"
    );
  });

  it("should throw when STACKSOS_TWILIO_AUTH_TOKEN is missing", async () => {
    delete process.env.STACKSOS_TWILIO_AUTH_TOKEN;
    const { sendSms } = await import("@/lib/sms/provider");

    await expect(sendSms({ to: "+15559876543", message: "test" })).rejects.toThrow(
      "STACKSOS_TWILIO_ACCOUNT_SID and STACKSOS_TWILIO_AUTH_TOKEN required"
    );
  });

  it("should throw when STACKSOS_TWILIO_FROM_NUMBER is missing", async () => {
    delete process.env.STACKSOS_TWILIO_FROM_NUMBER;
    const { sendSms } = await import("@/lib/sms/provider");

    await expect(sendSms({ to: "+15559876543", message: "test" })).rejects.toThrow(
      "STACKSOS_TWILIO_FROM_NUMBER required"
    );
  });

  it("should throw when 'to' is empty", async () => {
    const { sendSms } = await import("@/lib/sms/provider");

    await expect(sendSms({ to: "", message: "test" })).rejects.toThrow("SMS 'to' required");
  });

  it("should throw when 'message' is empty", async () => {
    const { sendSms } = await import("@/lib/sms/provider");

    await expect(sendSms({ to: "+15559876543", message: "" })).rejects.toThrow(
      "SMS 'message' required"
    );
  });
});
