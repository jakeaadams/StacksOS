/**
 * SES Email Provider Unit Tests
 *
 * Tests the Amazon SES provider path in the email service,
 * including AWS Signature V4 auth and error handling.
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
  process.env.STACKSOS_EMAIL_PROVIDER = "ses";
  process.env.STACKSOS_EMAIL_API_KEY = "AKIAIOSFODNN7EXAMPLE";
  process.env.STACKSOS_EMAIL_REGION = "us-west-2";
  process.env.STACKSOS_AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  process.env.STACKSOS_EMAIL_FROM = "noreply@library.org";
  process.env.STACKSOS_EMAIL_FROM_NAME = "Library System";
  process.env.STACKSOS_EMAIL_DRY_RUN = "false";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("SES Email Provider", () => {
  it("should call the correct SES URL with the configured region", async () => {
    const { sendEmail } = await import("@/lib/email/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ MessageId: "ses-msg-123" }),
    } as Response);

    await sendEmail({
      to: { email: "patron@example.com", name: "Test Patron" },
      subject: "Hold Ready",
      html: "<p>Your hold is ready.</p>",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://email.us-west-2.amazonaws.com/v2/email/outbound-emails");
  });

  it("should include AWS4-HMAC-SHA256 in the Authorization header", async () => {
    const { sendEmail } = await import("@/lib/email/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ MessageId: "ses-msg-456" }),
    } as Response);

    await sendEmail({
      to: { email: "patron@example.com" },
      subject: "Overdue Notice",
      html: "<p>Your items are overdue.</p>",
    });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const authHeader = (options?.headers as Record<string, string>)["Authorization"];
    expect(authHeader).toContain("AWS4-HMAC-SHA256");
    expect(authHeader).toContain("Credential=AKIAIOSFODNN7EXAMPLE");
    expect(authHeader).toContain("Signature=");
  });

  it("should throw when SES returns non-ok response", async () => {
    const { sendEmail } = await import("@/lib/email/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "MessageRejected: Email address is not verified",
    } as Response);

    await expect(
      sendEmail({
        to: { email: "patron@example.com" },
        subject: "Test",
        html: "<p>Test</p>",
      })
    ).rejects.toThrow("SES API error: 400");
  });

  it("should throw when STACKSOS_AWS_SECRET_KEY is missing", async () => {
    delete process.env.STACKSOS_AWS_SECRET_KEY;
    const { sendEmail } = await import("@/lib/email/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    await expect(
      sendEmail({
        to: { email: "patron@example.com" },
        subject: "Test",
        html: "<p>Test</p>",
      })
    ).rejects.toThrow("STACKSOS_AWS_SECRET_KEY is required");
  });

  it("should send correct JSON body structure to SES", async () => {
    const { sendEmail } = await import("@/lib/email/provider");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ MessageId: "ses-msg-789" }),
    } as Response);

    await sendEmail({
      to: { email: "patron@example.com", name: "Jane Doe" },
      subject: "Fine Bill",
      html: "<p>You owe $5.00</p>",
      text: "You owe $5.00",
    });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.Content.Simple.Subject.Data).toBe("Fine Bill");
    expect(body.Content.Simple.Body.Html.Data).toBe("<p>You owe $5.00</p>");
    expect(body.Content.Simple.Body.Text.Data).toBe("You owe $5.00");
    expect(body.Destination.ToAddresses).toEqual(["patron@example.com"]);
  });
});
