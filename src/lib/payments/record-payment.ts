/**
 * Shared Evergreen payment recording logic.
 *
 * Used by all webhook handlers (Stripe, Square, PayPal) to record successful
 * payments back into Evergreen's open-ils.circ.money.payment API via a
 * service account.
 */

import { callOpenSRF } from "@/lib/api";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit";

export interface RecordPaymentParams {
  /** Provider name for audit/log context (e.g. "stripe", "square", "paypal") */
  provider: string;
  /** Provider-specific payment/transaction ID */
  paymentId: string;
  /** Patron's Evergreen ID */
  patronId: number;
  /** List of Evergreen fine/billing IDs to apply payment against */
  fineIds: number[];
  /** Amount in cents */
  amount: number;
  /** ISO currency code */
  currency?: string;
  /** Optional receipt URL */
  receiptUrl?: string;
}

/**
 * Record a successful payment in Evergreen using the configured service account.
 *
 * This function:
 * 1. Logs an audit event for the successful payment webhook
 * 2. Authenticates as the StacksOS service account
 * 3. Calls open-ils.circ.money.payment to apply payments to fines
 * 4. Handles rounding for even distribution across multiple fines
 *
 * Errors are logged but not thrown — webhook endpoints should always return 200
 * to the payment provider. The audit trail allows manual reconciliation if needed.
 */
export async function recordPaymentInEvergreen(params: RecordPaymentParams): Promise<void> {
  const { provider, paymentId, patronId, fineIds, amount, currency, receiptUrl } = params;

  if (!patronId || fineIds.length === 0) {
    logger.warn(
      { paymentId, patronId, fineIds, provider },
      "Webhook: payment succeeded but missing patron/fine metadata"
    );
    return;
  }

  logger.info(
    { paymentId, patronId, fineIds, amount, provider },
    "Webhook: recording payment in Evergreen"
  );

  try {
    await logAuditEvent({
      action: `opac.payment.webhook_succeeded`,
      entity: "payment_intent",
      entityId: paymentId,
      status: "success",
      details: { provider, patronId, fineIds, amount, currency, receiptUrl },
    }).catch(() => {});

    const serviceBarcode = process.env.STACKSOS_SERVICE_ACCOUNT_BARCODE;
    const servicePin = process.env.STACKSOS_SERVICE_ACCOUNT_PIN;

    if (!serviceBarcode || !servicePin) {
      logger.warn(
        { paymentId, provider },
        "Webhook: STACKSOS_SERVICE_ACCOUNT_BARCODE/PIN not configured, skipping Evergreen recording"
      );
      return;
    }

    // Authenticate as service account
    const initRes = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.init", [
      serviceBarcode,
    ]);
    const nonce = initRes?.payload?.[0];
    if (!nonce) throw new Error("Auth init returned no nonce");

    const { createHash } = await import("node:crypto");
    const hashedPin = createHash("md5")
      .update(nonce + createHash("md5").update(servicePin).digest("hex"))
      .digest("hex");

    const authRes = await callOpenSRF("open-ils.auth", "open-ils.auth.authenticate.complete", [
      { username: serviceBarcode, password: hashedPin, type: "staff" },
    ]);
    const authPayload = authRes?.payload?.[0];
    const serviceToken = authPayload?.payload?.authtoken;
    if (!serviceToken) throw new Error("Service account auth failed");

    // Distribute amount evenly across fines, giving any remainder (from rounding)
    // to the first fine to ensure the total equals the charged amount exactly.
    const perFine = Math.floor(amount / fineIds.length);
    const remainder = amount - perFine * fineIds.length;
    const payments = fineIds.map((id, idx) => [id, idx === 0 ? perFine + remainder : perFine]);

    const payResult = await callOpenSRF("open-ils.circ", "open-ils.circ.money.payment", [
      serviceToken,
      {
        userid: patronId,
        payments,
        payment_type: "credit_card_payment",
        note: `${provider} payment ${paymentId}`.trim(),
      },
      patronId,
    ]);

    const payPayload = payResult?.payload?.[0];
    if (payPayload && typeof payPayload === "object" && "ilsevent" in payPayload) {
      logger.error(
        { paymentId, ilsevent: payPayload, provider },
        "Webhook: Evergreen payment recording returned an event error"
      );
    } else {
      logger.info(
        { paymentId, patronId, fineIds, provider },
        "Webhook: payment recorded in Evergreen"
      );
    }
  } catch (error) {
    // Log but don't throw — we still return 200 to the payment provider.
    // The audit trail allows manual reconciliation if needed.
    logger.error(
      { error: String(error), paymentId, provider },
      "Webhook: failed to record payment in Evergreen"
    );
  }
}

/**
 * Log a failed payment webhook event for audit trail purposes.
 */
export async function logPaymentFailure(params: {
  provider: string;
  paymentId: string | undefined;
  patronId: number;
  status: string | undefined;
}): Promise<void> {
  await logAuditEvent({
    action: "opac.payment.webhook_failed",
    entity: "payment_intent",
    entityId: params.paymentId,
    status: "failure",
    details: {
      provider: params.provider,
      patronId: params.patronId,
      status: params.status,
    },
  }).catch(() => {});

  logger.warn(
    {
      paymentId: params.paymentId,
      patronId: params.patronId,
      status: params.status,
      provider: params.provider,
    },
    "Webhook: payment failed"
  );
}
