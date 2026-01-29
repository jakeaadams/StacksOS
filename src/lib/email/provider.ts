/**
 * Email Service Provider Integration
 * Supports Resend, SendGrid, and Amazon SES
 */

import { logger } from "@/lib/logger";
import type { EmailOptions } from "./types";

type EmailProvider = "resend" | "sendgrid" | "ses" | "console";

interface ProviderConfig {
  provider: EmailProvider;
  apiKey?: string;
  region?: string; // For SES
  fromEmail: string;
  fromName: string;
  dryRun: boolean;
}

function getConfig(): ProviderConfig {
  const provider = (process.env.STACKSOS_EMAIL_PROVIDER || "console") as EmailProvider;
  const apiKey = process.env.STACKSOS_EMAIL_API_KEY;
  const region = process.env.STACKSOS_EMAIL_REGION || "us-east-1";
  const fromEmail = process.env.STACKSOS_EMAIL_FROM || "noreply@library.org";
  const fromName = process.env.STACKSOS_EMAIL_FROM_NAME || "Library System";
  const dryRun = process.env.STACKSOS_EMAIL_DRY_RUN === "true";

  return { provider, apiKey, region, fromEmail, fromName, dryRun };
}

async function sendViaResend(options: EmailOptions, apiKey: string): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: options.from?.email || `${getConfig().fromName} <${getConfig().fromEmail}>`,
      to: [options.to.email],
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: options.replyTo?.email,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  logger.info(
    { component: "email", provider: "resend", messageId: result.id, to: options.to.email },
    "Email sent via Resend"
  );
}

async function sendViaSendGrid(options: EmailOptions, apiKey: string): Promise<void> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: options.to.email, name: options.to.name }],
        },
      ],
      from: {
        email: options.from?.email || getConfig().fromEmail,
        name: options.from?.name || getConfig().fromName,
      },
      subject: options.subject,
      content: [
        { type: "text/html", value: options.html },
        ...(options.text ? [{ type: "text/plain", value: options.text }] : []),
      ],
      reply_to: options.replyTo
        ? { email: options.replyTo.email, name: options.replyTo.name }
        : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid API error: ${response.status} - ${error}`);
  }

  logger.info(
    { component: "email", provider: "sendgrid", to: options.to.email },
    "Email sent via SendGrid"
  );
}

async function sendViaSES(options: EmailOptions, apiKey: string, region: string): Promise<void> {
  // Note: AWS SES requires AWS SDK and signature v4 signing.
  // This is a placeholder that would need the AWS SDK for Node.js
  throw new Error("Amazon SES integration requires AWS SDK - not yet implemented");
}

function logToConsole(options: EmailOptions): void {
  const log = {
    component: "email",
    provider: "console",
    dryRun: true,
    to: options.to,
    from: options.from,
    subject: options.subject,
    htmlLength: options.html.length,
    textLength: options.text?.length || 0,
  };

  logger.info(log, "Email would be sent (dry run)");

  // Also output to console for easy debugging
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const config = getConfig();

  // Validate recipient
  if (!options.to.email || !isValidEmail(options.to.email)) {
    throw new Error(`Invalid recipient email: ${options.to.email}`);
  }

  // Dry run mode - just log
  if (config.dryRun || config.provider === "console") {
    logToConsole(options);
    return;
  }

  // Ensure API key is present for real providers
  if (!config.apiKey) {
    throw new Error(`Email provider ${config.provider} requires STACKSOS_EMAIL_API_KEY`);
  }

  try {
    switch (config.provider) {
      case "resend":
        await sendViaResend(options, config.apiKey!);
        break;
      case "sendgrid":
        await sendViaSendGrid(options, config.apiKey!);
        break;
      case "ses":
        await sendViaSES(options, config.apiKey!, config.region || "us-east-1");
        break;
      default:
        logToConsole(options);
    }
  } catch (error) {
    logger.error(
      {
        component: "email",
        provider: config.provider,
        to: options.to.email,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to send email"
    );
    throw error;
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function getEmailConfig(): ProviderConfig {
  return getConfig();
}
