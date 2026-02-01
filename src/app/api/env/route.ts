import { NextResponse } from "next/server";

export async function GET() {
  const label = String(process.env.STACKSOS_ENV_LABEL || "").trim();
  const tone = String(process.env.STACKSOS_ENV_TONE || "").trim().toLowerCase();

  return NextResponse.json({
    ok: true,
    env: {
      label: label || null,
      tone: tone || null,
    },
  });
}

