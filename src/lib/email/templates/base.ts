/**
 * Email template rendering utilities
 */

import type { NoticeContext } from "../types";

export function renderBaseTemplate(content: string, context: NoticeContext): string {
  const { library, patron, unsubscribeUrl, preferencesUrl } = context;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Library Notice</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      color: #1e40af;
      font-size: 24px;
    }
    .content {
      margin-bottom: 30px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .item-list {
      background-color: #f8fafc;
      border-left: 4px solid #3b82f6;
      padding: 15px;
      margin: 20px 0;
    }
    .item {
      padding: 10px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .item:last-child {
      border-bottom: none;
    }
    .item-title {
      font-weight: 600;
      color: #1e293b;
    }
    .item-detail {
      font-size: 14px;
      color: #64748b;
      margin-top: 4px;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      margin-top: 30px;
      font-size: 14px;
      color: #64748b;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      margin: 10px 0;
      font-weight: 500;
    }
    .button:hover {
      background-color: #1e40af;
    }
    .alert {
      background-color: #fef2f2;
      border-left: 4px solid #dc2626;
      padding: 15px;
      margin: 20px 0;
    }
    .alert-warning {
      background-color: #fffbeb;
      border-left-color: #f59e0b;
    }
    .alert-info {
      background-color: #eff6ff;
      border-left-color: #3b82f6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(library.name)}</h1>
    </div>
    <div class="content">
      <div class="greeting">
        Dear ${escapeHtml(patron.firstName)} ${escapeHtml(patron.lastName)},
      </div>
      ${content}
    </div>
    <div class="footer">
      <p><strong>${escapeHtml(library.name)}</strong></p>
      ${library.phone ? `<p>Phone: ${escapeHtml(library.phone)}</p>` : ""}
      ${library.email ? `<p>Email: <a href="mailto:${escapeHtml(library.email)}">${escapeHtml(library.email)}</a></p>` : ""}
      ${library.website ? `<p>Website: <a href="${escapeHtml(library.website)}">${escapeHtml(library.website)}</a></p>` : ""}
      ${preferencesUrl ? `<p><a href="${escapeHtml(preferencesUrl)}">Manage notification preferences</a></p>` : ""}
      ${unsubscribeUrl ? `<p><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from email notices</a></p>` : ""}
      <p style="margin-top: 20px; color: #94a3b8; font-size: 12px;">
        This is an automated message. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

export function formatDate(date: string | Date | undefined): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatShortDate(date: string | Date | undefined): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
