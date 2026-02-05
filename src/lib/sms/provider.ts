import { logger } from "@/lib/logger";

type SmsProvider = "webhook" | "console";

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
    logger.info({ component: "sms", provider: "console", to, messageLength: message.length }, "SMS would be sent (dry run)");
    return;
  }

  if (config.provider === "webhook") {
    if (!config.webhookUrl) throw new Error("STACKSOS_SMS_WEBHOOK_URL required for webhook provider");
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

  throw new Error(`Unsupported SMS provider: ${config.provider}`);
}

