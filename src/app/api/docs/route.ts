import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Swagger UI API Documentation
 *
 * SECURITY: This route is gated behind staff authentication.
 * Swagger UI assets are self-hosted from the swagger-ui-dist package
 * (copied to public/swagger-ui/) to eliminate CDN supply-chain risk.
 */
export async function GET() {
  // Require staff authentication to access API docs
  const cookieStore = await cookies();
  const authToken = cookieStore.get("authtoken");
  if (!authToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>StacksOS API Documentation</title><link rel="stylesheet" href="/swagger-ui/swagger-ui.css" /><style>body{margin:0;}.swagger-ui .topbar{display:none;}.custom-header{background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:white;padding:20px 40px;display:flex;align-items:center;gap:16px;}.custom-header h1{margin:0;font-size:1.5em;}.custom-header a{color:white;text-decoration:none;margin-left:auto;padding:8px 16px;border:1px solid rgba(255,255,255,0.3);border-radius:6px;}</style></head><body><div class="custom-header"><h1>StacksOS API</h1><a href="/staff">Back to Staff Client</a></div><div id="swagger-ui"></div><script src="/swagger-ui/swagger-ui-bundle.js"></script><script>window.onload=function(){SwaggerUIBundle({url:"/openapi.yaml",dom_id:"#swagger-ui",presets:[SwaggerUIBundle.presets.apis],docExpansion:"list",filter:true})}</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
