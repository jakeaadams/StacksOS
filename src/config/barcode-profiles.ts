export type BarcodeEntity = "patron" | "item" | "transaction" | "other";
export type CheckDigitType = "none" | "mod10";
export type PadDirection = "left" | "right";

export interface BarcodeProfile {
  id: string;
  label: string;
  entity: BarcodeEntity;
  minLength?: number;
  maxLength?: number;
  prefix?: string;
  suffix?: string;
  padChar?: string;
  padDirection?: PadDirection;
  padToLength?: number;
  checkDigit?: CheckDigitType;
  stripAlpha?: boolean;
  stripWhitespace?: boolean;
  stripLeadingZeros?: boolean;
  allowLowercase?: boolean;
  allowedPattern?: RegExp;
  example?: string;
}

export const defaultProfiles: BarcodeProfile[] = [
  {
    id: "stacksos-patron-default",
    label: "StacksOS Patron Default",
    entity: "patron",
    minLength: 8,
    maxLength: 20,
    padChar: "0",
    padDirection: "left",
    checkDigit: "none",
    stripWhitespace: true,
    allowLowercase: false,
    allowedPattern: /^[A-Z0-9]+$/,
    example: "29227613230199",
  },
  {
    id: "stacksos-item-default",
    label: "StacksOS Item Default",
    entity: "item",
    minLength: 8,
    maxLength: 20,
    padChar: "0",
    padDirection: "left",
    checkDigit: "none",
    stripWhitespace: true,
    allowLowercase: false,
    allowedPattern: /^[A-Z0-9]+$/,
    example: "39000000001235",
  },
];

export function getProfile(profileId: string): BarcodeProfile | undefined {
  return defaultProfiles.find((profile) => profile.id === profileId);
}

export function listProfiles(): BarcodeProfile[] {
  return defaultProfiles;
}

export function serializeProfile(profile: BarcodeProfile) {
  return {
    ...profile,
    allowedPattern: profile.allowedPattern ? profile.allowedPattern.source : undefined,
  };
}
