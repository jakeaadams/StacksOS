/**
 * Hold Ready notification template
 */

import type { NoticeContext } from "../types";
import { renderBaseTemplate, escapeHtml, formatShortDate } from "./base";

export function renderHoldReadyHtml(context: NoticeContext): string {
  const { holds = [] } = context;

  const content = `
    <div class="alert alert-info">
      <p style="margin: 0; font-weight: 600;">Good news! Your hold${holds.length > 1 ? "s are" : " is"} ready for pickup.</p>
    </div>

    <p>The following item${holds.length > 1 ? "s are" : " is"} now available for you at the library:</p>

    <div class="item-list">
      ${holds
        .map(
          (hold) => `
        <div class="item">
          <div class="item-title">${escapeHtml(hold.title)}</div>
          ${hold.author ? `<div class="item-detail">by ${escapeHtml(hold.author)}</div>` : ""}
          <div class="item-detail">
            <strong>Pickup at:</strong> ${escapeHtml(hold.pickupLibrary)}
          </div>
          ${
            hold.shelfExpireTime
              ? `<div class="item-detail">
                  <strong>Hold until:</strong> ${formatShortDate(hold.shelfExpireTime)}
                </div>`
              : ""
          }
        </div>
      `
        )
        .join("")}
    </div>

    <p>
      Please pick up your item${holds.length > 1 ? "s" : ""} by the date${holds.length > 1 ? "s" : ""} listed above.
      After that date, the hold${holds.length > 1 ? "s" : ""} may be cancelled and offered to the next patron on the waiting list.
    </p>

    <p>
      <strong>What to bring:</strong> Please bring your library card or a valid photo ID.
    </p>
  `;

  return renderBaseTemplate(content, context);
}

export function renderHoldReadyText(context: NoticeContext): string {
  const { patron, library, holds = [] } = context;

  const lines = [
    `${library.name}`,
    "",
    `Dear ${patron.firstName} ${patron.lastName},`,
    "",
    `Good news! Your hold${holds.length > 1 ? "s are" : " is"} ready for pickup.`,
    "",
    `The following item${holds.length > 1 ? "s are" : " is"} now available for you at the library:`,
    "",
  ];

  holds.forEach((hold) => {
    lines.push(`- ${hold.title}`);
    if (hold.author) lines.push(`  by ${hold.author}`);
    lines.push(`  Pickup at: ${hold.pickupLibrary}`);
    if (hold.shelfExpireTime) {
      lines.push(`  Hold until: ${formatShortDate(hold.shelfExpireTime)}`);
    }
    lines.push("");
  });

  lines.push(
    `Please pick up your item${holds.length > 1 ? "s" : ""} by the date${holds.length > 1 ? "s" : ""} listed above.`,
    `After that date, the hold${holds.length > 1 ? "s" : ""} may be cancelled and offered to the next patron.`,
    "",
    "What to bring: Please bring your library card or a valid photo ID.",
    ""
  );

  if (library.phone) lines.push(`Phone: ${library.phone}`);
  if (library.email) lines.push(`Email: ${library.email}`);
  if (library.website) lines.push(`Website: ${library.website}`);

  lines.push("", "---", "This is an automated message. Please do not reply to this email.");

  return lines.join("\n");
}
