import type { BarcodeProfile, CheckDigitType } from "@/config/barcode-profiles";

export interface BarcodeValidationResult {
  normalized: string;
  completed: string;
  valid: boolean;
  errors: string[];
}

export function normalizeBarcode(input: string, profile: BarcodeProfile): string {
  let value = String(input ?? "");

  if (profile.stripWhitespace) {
    value = value.replace(/\s+/g, "");
  } else {
    value = value.trim();
  }

  if (!profile.allowLowercase) {
    value = value.toUpperCase();
  }

  if (profile.stripAlpha) {
    value = value.replace(/[A-Z]/gi, "");
  }

  if (profile.stripLeadingZeros) {
    value = value.replace(/^0+/, "");
  }

  return value;
}

export function completeBarcode(input: string, profile: BarcodeProfile): string {
  let value = input;

  if (profile.prefix && !value.startsWith(profile.prefix)) {
    value = `${profile.prefix}${value}`;
  }

  if (profile.suffix && !value.endsWith(profile.suffix)) {
    value = `${value}${profile.suffix}`;
  }

  if (profile.padToLength && value.length < profile.padToLength) {
    const padChar = profile.padChar ?? "0";
    const padLength = profile.padToLength - value.length;
    const padding = padChar.repeat(padLength);
    value = profile.padDirection === "right" ? `${value}${padding}` : `${padding}${value}`;
  }

  return value;
}

export function validateBarcode(value: string, profile: BarcodeProfile): string[] {
  const errors: string[] = [];

  if (profile.minLength !== undefined && value.length < profile.minLength) {
    errors.push(`Barcode is shorter than minimum length (${profile.minLength}).`);
  }

  if (profile.maxLength !== undefined && value.length > profile.maxLength) {
    errors.push(`Barcode exceeds maximum length (${profile.maxLength}).`);
  }

  if (profile.allowedPattern && !profile.allowedPattern.test(value)) {
    errors.push("Barcode contains invalid characters.");
  }

  if (profile.checkDigit && profile.checkDigit !== "none") {
    const valid = validateCheckDigit(value, profile.checkDigit);
    if (!valid) {
      errors.push("Barcode check digit validation failed.");
    }
  }

  return errors;
}

export function applyBarcodeProfile(input: string, profile: BarcodeProfile): BarcodeValidationResult {
  const normalized = normalizeBarcode(input, profile);
  const completed = completeBarcode(normalized, profile);
  const errors = validateBarcode(completed, profile);

  return {
    normalized,
    completed,
    valid: errors.length === 0,
    errors,
  };
}

function validateCheckDigit(value: string, type: CheckDigitType): boolean {
  if (type === "mod10") {
    return luhnCheck(value);
  }
  return true;
}

function luhnCheck(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false;
  let sum = 0;
  let shouldDouble = false;

  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number(value[i]);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}
