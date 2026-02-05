function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPathValue(obj: any, path: string): unknown {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function renderTemplateString(template: string, context: any, opts?: { html?: boolean }): string {
  const isHtml = opts?.html === true;
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => {
    const value = getPathValue(context, String(key));
    if (value === null || value === undefined) return "";
    const str = typeof value === "string" ? value : JSON.stringify(value);
    return isHtml ? escapeHtml(str) : str;
  });
}

