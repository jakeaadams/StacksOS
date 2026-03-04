/**
 * Payment receipt email template
 */

import type { NoticeContext } from "../types";
import { renderBaseTemplate, escapeHtml, formatShortDate } from "./base";

interface PaymentReceiptBill {
  title: string;
  amount: number;
}

interface PaymentReceiptContext extends NoticeContext {
  paymentAmount: number;
  paymentDate: string;
  transactionId: string;
  paymentMethod: string;
  receiptUrl?: string;
  remainingBalance: number;
  paidBills: PaymentReceiptBill[];
  customMessage?: string;
}

export function renderPaymentReceiptHtml(context: PaymentReceiptContext): string {
  const {
    paymentAmount,
    paymentDate,
    transactionId,
    receiptUrl,
    remainingBalance,
    paidBills,
    customMessage,
  } = context;

  const content = `
    <div class="alert alert-success" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-weight: 600; color: #166534;">✓ Payment Received — Thank You!</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Amount Paid</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600;">$${paymentAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Date</td>
        <td style="padding: 8px 0; text-align: right;">${formatShortDate(paymentDate)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Transaction ID</td>
        <td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 13px;">${escapeHtml(transactionId)}</td>
      </tr>
      ${
        remainingBalance > 0
          ? `<tr>
              <td style="padding: 8px 0; color: #6b7280;">Remaining Balance</td>
              <td style="padding: 8px 0; text-align: right; color: #d97706; font-weight: 600;">$${remainingBalance.toFixed(2)}</td>
            </tr>`
          : `<tr>
              <td style="padding: 8px 0; color: #6b7280;">Account Balance</td>
              <td style="padding: 8px 0; text-align: right; color: #166534; font-weight: 600;">$0.00</td>
            </tr>`
      }
    </table>

    ${
      paidBills.length > 0
        ? `
      <p style="font-weight: 600; margin-bottom: 8px;">Fees Paid:</p>
      <div class="item-list">
        ${paidBills
          .map(
            (bill) => `
          <div class="item" style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between;">
              <span>${escapeHtml(bill.title)}</span>
              <span>$${bill.amount.toFixed(2)}</span>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `
        : ""
    }

    ${
      receiptUrl
        ? `<p style="margin-top: 16px;">
            <a href="${escapeHtml(receiptUrl)}" style="color: #2563eb; text-decoration: underline;">
              View full receipt from Stripe
            </a>
          </p>`
        : ""
    }

    ${
      customMessage
        ? `<div style="margin-top: 24px; padding: 12px; background-color: #f9fafb; border-radius: 6px; border-left: 3px solid #3b82f6;">
            <p style="margin: 0; font-size: 14px; color: #374151;">${escapeHtml(customMessage)}</p>
          </div>`
        : ""
    }

    <p style="margin-top: 24px; font-size: 13px; color: #6b7280;">
      This is your official payment receipt. Please keep this email for your records.
      If you have questions about this payment, please contact the library.
    </p>
  `;

  return renderBaseTemplate(content, context);
}

export function renderPaymentReceiptText(context: PaymentReceiptContext): string {
  const {
    patron,
    library,
    paymentAmount,
    paymentDate,
    transactionId,
    remainingBalance,
    paidBills,
    customMessage,
  } = context;

  const lines = [
    library.name,
    "",
    `Dear ${patron.firstName} ${patron.lastName},`,
    "",
    "Payment Received — Thank You!",
    "",
    `Amount Paid: $${paymentAmount.toFixed(2)}`,
    `Date: ${formatShortDate(paymentDate)}`,
    `Transaction ID: ${transactionId}`,
    remainingBalance > 0
      ? `Remaining Balance: $${remainingBalance.toFixed(2)}`
      : "Account Balance: $0.00",
    "",
  ];

  if (paidBills.length > 0) {
    lines.push("Fees Paid:");
    for (const bill of paidBills) {
      lines.push(`  - ${bill.title}: $${bill.amount.toFixed(2)}`);
    }
    lines.push("");
  }

  if (customMessage) {
    lines.push(customMessage, "");
  }

  lines.push(
    "This is your official payment receipt.",
    "Please keep this email for your records.",
    "",
    "If you have questions about this payment, please contact the library."
  );

  if (library.phone) lines.push(`Phone: ${library.phone}`);
  if (library.email) lines.push(`Email: ${library.email}`);
  if (library.website) lines.push(`Website: ${library.website}`);

  lines.push("", "---", "This is an automated message. Please do not reply to this email.");

  return lines.join("\n");
}
