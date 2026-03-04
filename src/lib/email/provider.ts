/**
 * Email Service Provider Integration
 * Supports SMTP (recommended for pilots), Resend, SendGrid, and Amazon SES.
 */

import { createHmac, createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import type { EmailOptions } from "./types";

type EmailProvider = "smtp" | "resend" | "sendgrid" | "ses" | "console";

interface ProviderConfig {
  provider: EmailProvider;
  apiKey?: string;
  region?: string; // For SES
  fromEmail: string;
  fromName: string;
  dryRun: boolean;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
  };
}

function getConfig(): ProviderConfig {
  const provider = (process.env.STACKSOS_EMAIL_PROVIDER || "console") as EmailProvider;
  const apiKey = process.env.STACKSOS_EMAIL_API_KEY;
  const region = process.env.STACKSOS_EMAIL_REGION || "us-east-1";
  const fromEmail = process.env.STACKSOS_EMAIL_FROM || "noreply@library.org";
  const fromName = process.env.STACKSOS_EMAIL_FROM_NAME || "Library System";
  const dryRun = process.env.STACKSOS_EMAIL_DRY_RUN === "true";

  const smtpHost = process.env.STACKSOS_SMTP_HOST;
  const smtpPort = Number.isFinite(Number(process.env.STACKSOS_SMTP_PORT))
    ? Number(process.env.STACKSOS_SMTP_PORT)
    : 587;
  const smtpSecure = process.env.STACKSOS_SMTP_SECURE === "true";
  const smtpUser = process.env.STACKSOS_SMTP_USER;
  const smtpPass = process.env.STACKSOS_SMTP_PASS;

  return {
    provider,
    apiKey,
    region,
    fromEmail,
    fromName,
    dryRun,
    smtp: smtpHost
      ? {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          user: smtpUser,
          pass: smtpPass,
        }
      : undefined,
  };
}

async function sendViaSmtp(options: EmailOptions, config: ProviderConfig): Promise<void> {
  if (!config.smtp) throw new Error("SMTP config missing (STACKSOS_SMTP_HOST)");
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
  });

  const from = options.from?.email
    ? options.from.name
      ? `${options.from.name} <${options.from.email}>`
      : options.from.email
    : config.fromName
      ? `${config.fromName} <${config.fromEmail}>`
      : config.fromEmail;

  const replyTo = options.replyTo?.email
    ? options.replyTo.name
      ? `${options.replyTo.name} <${options.replyTo.email}>`
      : options.replyTo.email
    : undefined;

  const info = await transport.sendMail({
    from,
    to: options.to.name ? `${options.to.name} <${options.to.email}>` : options.to.email,
    replyTo,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  logger.info(
    { component: "email", provider: "smtp", to: options.to.email, messageId: info?.messageId },
    "Email sent via SMTP"
  );
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

/**
 * AWS Signature V4 signing — pure Node.js, no AWS SDK.
 */
function hmacSHA256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmacSHA256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSHA256(kDate, region);
  const kService = hmacSHA256(kRegion, service);
  return hmacSHA256(kService, "aws4_request");
}

async function sendViaSES(
  options: EmailOptions,
  accessKeyId: string,
  region: string
): Promise<void> {
  const secretKey = process.env.STACKSOS_AWS_SECRET_KEY;
  if (!secretKey) throw new Error("STACKSOS_AWS_SECRET_KEY is required for SES provider");

  const config = getConfig();
  const host = `email.${region}.amazonaws.com`;
  const url = `https://${host}/v2/email/outbound-emails`;
  const method = "POST";
  const service = "ses";

  const fromAddress = options.from?.email
    ? options.from.name
      ? `${options.from.name} <${options.from.email}>`
      : options.from.email
    : config.fromName
      ? `${config.fromName} <${config.fromEmail}>`
      : config.fromEmail;

  const body = JSON.stringify({
    Content: {
      Simple: {
        Subject: { Data: options.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: options.html, Charset: "UTF-8" },
          ...(options.text ? { Text: { Data: options.text, Charset: "UTF-8" } } : {}),
        },
      },
    },
    Destination: { ToAddresses: [options.to.email] },
    FromEmailAddress: fromAddress,
    ...(options.replyTo?.email ? { ReplyToAddresses: [options.replyTo.email] } : {}),
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = `${method}\n/v2/email/outbound-emails\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Amz-Date": amzDate,
      Authorization: authorization,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SES API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as { MessageId?: string };
  logger.info(
    { component: "email", provider: "ses", messageId: result.MessageId, to: options.to.email },
    "Email sent via Amazon SES"
  );
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

  try {
    switch (config.provider) {
      case "smtp":
        await sendViaSmtp(options, config);
        break;
      case "resend":
        if (!config.apiKey)
          throw new Error(`Email provider ${config.provider} requires STACKSOS_EMAIL_API_KEY`);
        await sendViaResend(options, config.apiKey!);
        break;
      case "sendgrid":
        if (!config.apiKey)
          throw new Error(`Email provider ${config.provider} requires STACKSOS_EMAIL_API_KEY`);
        await sendViaSendGrid(options, config.apiKey!);
        break;
      case "ses":
        if (!config.apiKey)
          throw new Error(`Email provider ${config.provider} requires STACKSOS_EMAIL_API_KEY`);
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
