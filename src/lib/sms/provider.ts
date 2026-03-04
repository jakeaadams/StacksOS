import { logger } from "@/lib/logger";

type SmsProvider = "webhook" | "twilio" | "console";

interface SmsConfig {
  provider: SmsProvider;
  webhookUrl?: string;
  dryRun: boolean;
}

function getConfig(): SmsConfig {
  const provider = (process.env.STACKSOS_SMS_PROVIDER || "console") as SmsProvider;
  const dryRun = process.env.STACKSOS_SMS_DRY_RUN === "true";
  const webhookUrl = process.env.STACKSOS_SMS_WEBHOOK_URL || undefined;
  return { provider, dryRun, webhookUrl };
}

export interface SmsOptions {
  to: string;
  message: string;
}

export async function sendSms(options: SmsOptions): Promise<void> {
  const config = getConfig();
  const to = String(options.to || "").trim();
  const message = String(options.message || "").trim();

  if (!to) throw new Error("SMS 'to' required");
  if (!message) throw new Error("SMS 'message' required");

  if (config.dryRun || config.provider === "console") {
    logger.info(
      { component: "sms", provider: "console", to, messageLength: message.length },
      "SMS would be sent (dry run)"
    );
    return;
  }

  if (config.provider === "webhook") {
    if (!config.webhookUrl)
      throw new Error("STACKSOS_SMS_WEBHOOK_URL required for webhook provider");
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`SMS webhook error: ${res.status} ${text}`.trim());
    }
    return;
  }

  if (config.provider === "twilio") {
    const accountSid = process.env.STACKSOS_TWILIO_ACCOUNT_SID;
    const authToken = process.env.STACKSOS_TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.STACKSOS_TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken)
      throw new Error(
        "STACKSOS_TWILIO_ACCOUNT_SID and STACKSOS_TWILIO_AUTH_TOKEN required for Twilio"
      );
    if (!fromNumber) throw new Error("STACKSOS_TWILIO_FROM_NUMBER required for Twilio");

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const body = new URLSearchParams({ To: to, From: fromNumber, Body: message });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`Twilio API error: ${res.status} ${errorBody}`.trim());
    }

    const result = (await res.json()) as { sid?: string };
    logger.info(
      { component: "sms", provider: "twilio", to, messageSid: result.sid },
      "SMS sent via Twilio"
    );
    return;
  }

  throw new Error(`Unsupported SMS provider: ${config.provider}`);
}
