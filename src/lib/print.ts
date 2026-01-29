// Lightweight printing helpers for StacksOS.
// We avoid popup windows (often blocked) and instead print via a hidden iframe.

export function escapeHtml(value: unknown): string {
  const s = String(value ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type PrintTone = "receipt" | "slip" | "report";

export interface PrintOptions {
  title?: string;
  tone?: PrintTone;
  css?: string;
}

const baseCss = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 24px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji", "Segoe UI Emoji"; color: #0f172a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 16px 0 8px; }
  .muted { color: #475569; font-size: 12px; }
  .meta { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; font-size: 12px; color: #334155; }
  .k { color: #64748b; }
  .v { font-weight: 600; }
  .box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 8px 6px; }
  td { font-size: 12px; border-bottom: 1px solid #f1f5f9; padding: 8px 6px; vertical-align: top; }
  .right { text-align: right; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .pb { page-break-after: always; }
  @media print {
    body { margin: 0; }
    .pb { break-after: page; page-break-after: always; }
  }
`;

const toneCss: Record<PrintTone, string> = {
  receipt: `
    .brand { font-weight: 700; letter-spacing: 0.08em; }
  `,
  slip: `
    body { margin: 18px; }
    .box { border-radius: 12px; }
  `,
  report: `
    body { margin: 24px; }
  `,
};

function buildDocument(bodyHtml: string, options: PrintOptions): string {
  const title = escapeHtml(options.title || "StacksOS");
  const tone = options.tone || "receipt";
  const css = `${baseCss}\n${toneCss[tone] || ""}\n${options.css || ""}`;

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${title}</title>`,
    `<style>${css}</style>`,
    "</head>",
    "<body>",
    bodyHtml,
    "</body>",
    "</html>",
  ].join("\n");
}

export function printHtml(bodyHtml: string, options: PrintOptions = {}): void {
  if (typeof window === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(buildDocument(bodyHtml, options));
  doc.close();

  const cleanup = () => {
    // Give the print dialog time to open before removing the iframe.
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        // ignore
      }
    }, 500);
  };

  // Best-effort: allow a tick for layout/fonts, then print.
  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  }, 60);
}
