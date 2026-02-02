import { NextResponse } from "next/server";

export async function GET() {
  const label = String(process.env.STACKSOS_ENV_LABEL || "").trim();
  const tone = String(process.env.STACKSOS_ENV_TONE || "").trim().toLowerCase();
  const patronBarcodeMode = String(process.env.STACKSOS_PATRON_BARCODE_MODE || "generate")
    .trim()
    .toLowerCase();
  const patronBarcodePrefix = String(process.env.STACKSOS_PATRON_BARCODE_PREFIX || "29").trim() || "29";

  return NextResponse.json({
    ok: true,
    env: {
      label: label || null,
      tone: tone || null,
      patronBarcodeMode: patronBarcodeMode || "generate",
      patronBarcodePrefix,
    },
  });
}
