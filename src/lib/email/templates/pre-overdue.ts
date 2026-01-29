/**
 * Pre-overdue (courtesy) notification template
 */

import type { NoticeContext } from "../types";
import { renderBaseTemplate, escapeHtml, formatShortDate } from "./base";

export function renderPreOverdueHtml(context: NoticeContext): string {
  const { items = [] } = context;

  const content = `
    <div class="alert alert-warning">
      <p style="margin: 0; font-weight: 600;">Reminder: ${items.length} item${items.length > 1 ? "s are" : " is"} due soon!</p>
    </div>

    <p>This is a courtesy reminder that the following item${items.length > 1 ? "s are" : " is"} due soon:</p>

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
                  <strong>Due date:</strong> ${formatShortDate(item.dueDate)}
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
      <strong>Action needed:</strong> Please return or renew ${items.length > 1 ? "these items" : "this item"} before the due date${items.length > 1 ? "s" : ""} to avoid fines.
    </p>

    <p>
      You can renew eligible items online through our catalog, by phone, or in person at the library.
      Not all items can be renewed (holds may prevent renewal).
    </p>

    <p>
      <strong>Need more time?</strong> Visit our website or contact us to check if renewal is available.
    </p>
  `;

  return renderBaseTemplate(content, context);
}

export function renderPreOverdueText(context: NoticeContext): string {
  const { patron, library, items = [] } = context;

  const lines = [
    `${library.name}`,
    "",
    `Dear ${patron.firstName} ${patron.lastName},`,
    "",
    `Reminder: ${items.length} item${items.length > 1 ? "s are" : " is"} due soon!`,
    "",
    `This is a courtesy reminder that the following item${items.length > 1 ? "s are" : " is"} due soon:`,
    "",
  ];

  items.forEach((item) => {
    lines.push(`- ${item.title}`);
    if (item.author) lines.push(`  by ${item.author}`);
    lines.push(`  Barcode: ${item.barcode}`);
    if (item.dueDate) lines.push(`  Due date: ${formatShortDate(item.dueDate)}`);
    if (item.callNumber) lines.push(`  Call number: ${item.callNumber}`);
    lines.push("");
  });

  lines.push(
    `Please return or renew ${items.length > 1 ? "these items" : "this item"} before the due date${items.length > 1 ? "s" : ""} to avoid fines.`,
    "",
    "You can renew eligible items online through our catalog, by phone, or in person.",
    "Not all items can be renewed (holds may prevent renewal).",
    ""
  );

  if (library.phone) lines.push(`Phone: ${library.phone}`);
  if (library.email) lines.push(`Email: ${library.email}`);
  if (library.website) lines.push(`Website: ${library.website}`);

  lines.push("", "---", "This is an automated message. Please do not reply to this email.");

  return lines.join("\n");
}
