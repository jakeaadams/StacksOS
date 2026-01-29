/**
 * Fine/bill notification template
 */

import type { NoticeContext } from "../types";
import { renderBaseTemplate, escapeHtml, formatShortDate } from "./base";

export function renderFineBillHtml(context: NoticeContext): string {
  const { bills = [] } = context;

  const totalBalance = bills.reduce((sum, bill) => sum + bill.balance, 0);

  const content = `
    <div class="alert alert-warning">
      <p style="margin: 0; font-weight: 600;">You have outstanding fines or fees on your account.</p>
    </div>

    <p>
      Your library account currently has a balance of <strong>$${totalBalance.toFixed(2)}</strong>.
    </p>

    <p>Please see the details below:</p>

    <div class="item-list">
      ${bills
        .map(
          (bill) => `
        <div class="item">
          <div class="item-title">${escapeHtml(bill.title)}</div>
          <div class="item-detail">
            <strong>Amount:</strong> $${bill.amount.toFixed(2)}
          </div>
          <div class="item-detail">
            <strong>Balance due:</strong> $${bill.balance.toFixed(2)}
          </div>
          ${
            bill.billedDate
              ? `<div class="item-detail">
                  <strong>Billed on:</strong> ${formatShortDate(bill.billedDate)}
                </div>`
              : ""
          }
        </div>
      `
        )
        .join("")}
    </div>

    <p>
      <strong>Payment options:</strong>
    </p>

    <ul>
      <li>Pay in person at the library (cash, check, or card)</li>
      <li>Pay online through our website (if available)</li>
      <li>Mail a check to the library</li>
    </ul>

    <p>
      <strong>Important:</strong> High balances may result in restrictions on your account,
      including the inability to check out materials or place holds.
    </p>

    <p>
      If you have questions about these charges or need to make payment arrangements,
      please contact the library.
    </p>
  `;

  return renderBaseTemplate(content, context);
}

export function renderFineBillText(context: NoticeContext): string {
  const { patron, library, bills = [] } = context;

  const totalBalance = bills.reduce((sum, bill) => sum + bill.balance, 0);

  const lines = [
    `${library.name}`,
    "",
    `Dear ${patron.firstName} ${patron.lastName},`,
    "",
    "You have outstanding fines or fees on your account.",
    "",
    `Your library account currently has a balance of $${totalBalance.toFixed(2)}.`,
    "",
    "Please see the details below:",
    "",
  ];

  bills.forEach((bill) => {
    lines.push(`- ${bill.title}`);
    lines.push(`  Amount: $${bill.amount.toFixed(2)}`);
    lines.push(`  Balance due: $${bill.balance.toFixed(2)}`);
    if (bill.billedDate) lines.push(`  Billed on: ${formatShortDate(bill.billedDate)}`);
    lines.push("");
  });

  lines.push(
    "Payment options:",
    "",
    "- Pay in person at the library (cash, check, or card)",
    "- Pay online through our website (if available)",
    "- Mail a check to the library",
    "",
    "Important: High balances may result in restrictions on your account,",
    "including the inability to check out materials or place holds.",
    "",
    "If you have questions about these charges or need to make payment arrangements,",
    "please contact the library.",
    ""
  );

  if (library.phone) lines.push(`Phone: ${library.phone}`);
  if (library.email) lines.push(`Email: ${library.email}`);
  if (library.website) lines.push(`Website: ${library.website}`);

  lines.push("", "---", "This is an automated message. Please do not reply to this email.");

  return lines.join("\n");
}
