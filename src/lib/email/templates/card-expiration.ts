/**
 * Card expiration notification template
 */

import type { NoticeContext } from "../types";
import { renderBaseTemplate, escapeHtml, formatDate } from "./base";

export function renderCardExpirationHtml(context: NoticeContext): string {
  const { expirationDate, patron } = context;

  const content = `
    <div class="alert alert-warning">
      <p style="margin: 0; font-weight: 600;">Your library card is expiring soon.</p>
    </div>

    <p>
      This is a reminder that your library card is set to expire on <strong>${formatDate(expirationDate)}</strong>.
    </p>

    <p>
      To continue enjoying library services, you'll need to renew your card before the expiration date.
      Once your card expires, you will not be able to:
    </p>

    <ul>
      <li>Check out materials</li>
      <li>Place holds on items</li>
      <li>Access digital resources</li>
      <li>Use library computers</li>
    </ul>

    <p>
      <strong>How to renew:</strong>
    </p>

    <ul>
      <li>Visit the library with a valid photo ID and proof of current address</li>
      <li>Call us during business hours</li>
      <li>Check our website for online renewal options</li>
    </ul>

    ${
      patron.barcode
        ? `<p>
            <strong>Your library card barcode:</strong> ${escapeHtml(patron.barcode)}
          </p>`
        : ""
    }

    <p>
      <strong>Questions?</strong> Contact us for assistance with renewing your card.
    </p>
  `;

  return renderBaseTemplate(content, context);
}

export function renderCardExpirationText(context: NoticeContext): string {
  const { patron, library, expirationDate } = context;

  const lines = [
    `${library.name}`,
    "",
    `Dear ${patron.firstName} ${patron.lastName},`,
    "",
    "Your library card is expiring soon.",
    "",
    `This is a reminder that your library card is set to expire on ${formatDate(expirationDate)}.`,
    "",
    "To continue enjoying library services, you'll need to renew your card before the expiration date.",
    "Once your card expires, you will not be able to:",
    "",
    "- Check out materials",
    "- Place holds on items",
    "- Access digital resources",
    "- Use library computers",
    "",
    "How to renew:",
    "",
    "- Visit the library with a valid photo ID and proof of current address",
    "- Call us during business hours",
    "- Check our website for online renewal options",
    "",
  ];

  if (patron.barcode) {
    lines.push(`Your library card barcode: ${patron.barcode}`, "");
  }

  lines.push("Questions? Contact us for assistance with renewing your card.", "");

  if (library.phone) lines.push(`Phone: ${library.phone}`);
  if (library.email) lines.push(`Email: ${library.email}`);
  if (library.website) lines.push(`Website: ${library.website}`);

  lines.push("", "---", "This is an automated message. Please do not reply to this email.");

  return lines.join("\n");
}
