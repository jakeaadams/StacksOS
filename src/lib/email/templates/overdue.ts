/**
 * Overdue notification template
 */

import type { NoticeContext } from "../types";
import { renderBaseTemplate, escapeHtml, formatShortDate } from "./base";

export function renderOverdueHtml(context: NoticeContext): string {
  const { items = [] } = context;

  const content = `
    <div class="alert">
      <p style="margin: 0; font-weight: 600;">You have ${items.length} overdue item${items.length > 1 ? "s" : ""}.</p>
    </div>

    <p>The following item${items.length > 1 ? "s are" : " is"} now overdue and should be returned as soon as possible:</p>

    <div class="item-list">
      ${items
        .map(
          (item) => `
        <div class="item">
          <div class="item-title">${escapeHtml(item.title)}</div>
          ${item.author ? `<div class="item-detail">by ${escapeHtml(item.author)}</div>` : ""}
          <div class="item-detail">
            <strong>Barcode:</strong> ${escapeHtml(item.barcode)}
          </div>
          ${
            item.dueDate
              ? `<div class="item-detail">
                  <strong>Was due:</strong> ${formatShortDate(item.dueDate)}
                </div>`
              : ""
          }
          ${
            item.callNumber
              ? `<div class="item-detail">
                  <strong>Call number:</strong> ${escapeHtml(item.callNumber)}
                </div>`
              : ""
          }
        </div>
      `
        )
        .join("")}
    </div>

    <p>
      <strong>Please return ${items.length > 1 ? "these items" : "this item"} to avoid additional fines.</strong>
    </p>

    <p>
      You can return items during library hours or use our book drop for after-hours returns.
      If you need to renew your items, please contact us or visit our website.
    </p>

    <p>
      <strong>Need help?</strong> Contact the library if you have questions about your account or need assistance.
    </p>
  `;

  return renderBaseTemplate(content, context);
}

export function renderOverdueText(context: NoticeContext): string {
  const { patron, library, items = [] } = context;

  const lines = [
    `${library.name}`,
    "",
    `Dear ${patron.firstName} ${patron.lastName},`,
    "",
    `You have ${items.length} overdue item${items.length > 1 ? "s" : ""}.`,
    "",
    `The following item${items.length > 1 ? "s are" : " is"} now overdue and should be returned as soon as possible:`,
    "",
  ];

  items.forEach((item) => {
    lines.push(`- ${item.title}`);
    if (item.author) lines.push(`  by ${item.author}`);
    lines.push(`  Barcode: ${item.barcode}`);
    if (item.dueDate) lines.push(`  Was due: ${formatShortDate(item.dueDate)}`);
    if (item.callNumber) lines.push(`  Call number: ${item.callNumber}`);
    lines.push("");
  });

  lines.push(
    `Please return ${items.length > 1 ? "these items" : "this item"} to avoid additional fines.`,
    "",
    "You can return items during library hours or use our book drop for after-hours returns.",
    "If you need to renew your items, please contact us or visit our website.",
    ""
  );

  if (library.phone) lines.push(`Phone: ${library.phone}`);
  if (library.email) lines.push(`Email: ${library.email}`);
  if (library.website) lines.push(`Website: ${library.website}`);

  lines.push("", "---", "This is an automated message. Please do not reply to this email.");

  return lines.join("\n");
}
