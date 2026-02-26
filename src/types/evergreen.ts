/**
 * Evergreen/OpenSRF Type Definitions
 *
 * Common types for Evergreen ILS responses and field extraction
 */

// ============================================================================
// Fieldmapper Types - Generic shape of OpenSRF objects
// ============================================================================

/**
 * Base fieldmapper object shape from OpenSRF
 */
export interface FieldmapperObject {
  __c: string;
  __p: (string | number | boolean | null | FieldmapperObject | FieldmapperObject[])[];
}

/**
 * Type guard for fieldmapper objects
 */
export function isFieldmapperObject(value: unknown): value is FieldmapperObject {
  return (
    value !== null &&
    typeof value === "object" &&
    "__c" in value &&
    "__p" in value &&
    typeof (value as FieldmapperObject).__c === "string" &&
    Array.isArray((value as FieldmapperObject).__p)
  );
}

// ============================================================================
// Utility Types for Field Extraction
// ============================================================================

/**
 * Generic field value type from fieldmapper
 */
export type FieldValue = string | number | boolean | null | undefined;

/**
 * Extracts a field value from either object property or __p array
 */
export function extractField<T extends FieldValue>(
  obj: FieldmapperObject | Record<string, any> | null | undefined,
  field: string,
  index: number
): T | null {
  if (!obj) return null;

  // Handle fieldmapper object with __p array
  if (isFieldmapperObject(obj)) {
    const val = obj.__p[index];
    if (val === undefined || val === null) return null;
    if (typeof val === "object") return null; // Nested objects need special handling
    return val as T;
  }

  // Handle regular object
  const val = (obj as Record<string, any>)[field];
  if (val === undefined || val === null) return null;
  if (typeof val === "object") return null;
  return val as T;
}

/**
 * Extracts a nested object field
 */
export function extractNestedField<T extends FieldValue>(
  obj: unknown,
  nameField: string,
  nameIdx: number
): T | null {
  if (!obj || typeof obj !== "object") return null;

  if (isFieldmapperObject(obj)) {
    const val = obj.__p[nameIdx];
    if (val === undefined || val === null) return null;
    if (typeof val === "object") return null;
    return val as T;
  }

  const val = (obj as Record<string, any>)[nameField];
  if (val === undefined || val === null) return null;
  if (typeof val === "object") return null;
  return val as T;
}

// ============================================================================
// Policy Types
// ============================================================================

/**
 * Raw circulation policy from OpenSRF (ccmm class)
 */
export interface RawCircPolicy extends FieldmapperObject {
  __c: "ccmm";
}

/**
 * Raw hold policy from OpenSRF (chmm class)
 */
export interface RawHoldPolicy extends FieldmapperObject {
  __c: "chmm";
}

/**
 * Raw duration rule from OpenSRF (crcd class)
 */
export interface RawDurationRule extends FieldmapperObject {
  __c: "crcd";
}

/**
 * Raw recurring fine rule from OpenSRF (crrf class)
 */
export interface RawFineRule extends FieldmapperObject {
  __c: "crrf";
}

/**
 * Raw max fine rule from OpenSRF (crmf class)
 */
export interface RawMaxFineRule extends FieldmapperObject {
  __c: "crmf";
}

/**
 * Normalized circulation policy
 */
export interface CirculationPolicy {
  id: number | null;
  active: boolean;
  orgUnit: number | null;
  orgUnitName: string | null;
  grp: number | null;
  grpName: string | null;
  circModifier: string | null;
  copyLocation: number | null;
  copyLocationName: string | null;
  isRenewal: boolean | null;
  refFlag: boolean | null;
  usrAgeUpperBound: string | null;
  usrAgeLowerBound: string | null;
  itemAge: string | null;
  circulate: boolean;
  durationRule: number | null;
  durationRuleName: string | null;
  recurringFineRule: number | null;
  recurringFineRuleName: string | null;
  maxFineRule: number | null;
  maxFineRuleName: string | null;
  hardDueDate: string | null;
  renewals: number | null;
  gracePeriod: string | null;
  scriptTest: string | null;
  totalCopyHold: number | null;
  availableCopyHold: number | null;
  description: string | null;
}

/**
 * Normalized hold policy
 */
export interface HoldPolicy {
  id: number | null;
  active: boolean;
  strictOuMatch: boolean;
  userHomeOu: number | null;
  requestorGrp: number | null;
  requestorGrpName: string | null;
  usrGrp: number | null;
  usrGrpName: string | null;
  pickupOu: number | null;
  pickupOuName: string | null;
  requestOu: number | null;
  requestOuName: string | null;
  itemOwningOu: number | null;
  itemOwningOuName: string | null;
  itemCircOu: number | null;
  itemCircOuName: string | null;
  circModifier: string | null;
  marcTypeCode: string | null;
  marcFormCode: string | null;
  marcVrFormat: string | null;
  refFlag: boolean | null;
  itemAge: string | null;
  holdable: boolean;
  distanceIsFromOwning: boolean;
  transitRange: number | null;
  maxHolds: number | null;
  includeLocallyFrozen: boolean;
  stopBlockedUser: boolean;
  ageProtection: number | null;
  description: string | null;
}

/**
 * Duration rule
 */
export interface DurationRule {
  id: number | null;
  name: string | null;
  extended: string | null;
  normal: string | null;
  shrt: string | null;
  maxRenewals: number | null;
  maxAutoRenewals: number | null;
}

/**
 * Fine rule
 */
export interface FineRule {
  id: number | null;
  name: string | null;
  high: string | null;
  normal: string | null;
  low: string | null;
  recurrenceInterval: string | null;
  gracePeriod: string | null;
}

/**
 * Max fine rule
 */
export interface MaxFineRule {
  id: number | null;
  name: string | null;
  amount: string | null;
  isByPercent: boolean;
}

// ============================================================================
// Admin Settings Types
// ============================================================================

export interface OrgSetting {
  name: string;
  value: string | number | boolean | null;
  orgUnit: number;
}

export interface SettingType {
  name: string;
  label: string;
  description: string;
  datatype: "string" | "integer" | "float" | "bool" | "interval" | "link" | "object" | "array";
  fmClass?: string;
  defaultValue?: string | number | boolean;
}

// ============================================================================
// Circulation Types
// ============================================================================

export interface CirculationRecord {
  id: number;
  patronId: number;
  patronBarcode?: string;
  patronName?: string;
  copyId: number;
  copyBarcode?: string;
  title?: string;
  author?: string;
  dueDate: string;
  checkoutTime: string;
  checkinTime?: string;
  stopFines?: string;
  stopFinesTime?: string;
  renewalRemaining: number;
  circLib: number;
  circLibName?: string;
}

export interface CheckoutResponse {
  success: boolean;
  circ?: CirculationRecord;
  copy?: {
    id: number;
    barcode: string;
    status: number;
    statusName?: string;
  };
  error?: string;
  override?: boolean;
  events?: Array<{
    code: string;
    message: string;
  }>;
}

export interface CheckinResponse {
  success: boolean;
  copy?: {
    id: number;
    barcode: string;
    status: number;
    statusName?: string;
  };
  hold?: {
    id: number;
    patronId: number;
    patronName?: string;
    pickupLib: number;
    pickupLibName?: string;
  };
  transit?: {
    id: number;
    destLib: number;
    destLibName?: string;
  };
  error?: string;
}

// ============================================================================
// Patron Types
// ============================================================================

export interface PatronProfile {
  id: number;
  name: string;
  label: string;
}

export interface PatronSummary {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  homeLibrary: number;
  homeLibraryName?: string;
  profile: number;
  profileName?: string;
  active: boolean;
  barred: boolean;
  expireDate?: string;
  totalFines?: number;
  checkoutsCount?: number;
  holdsCount?: number;
  overdueCount?: number;
}

// ============================================================================
// Item Types
// ============================================================================

export interface ItemStatus {
  id: number;
  name: string;
  holdable: boolean;
  opacVisible: boolean;
  copyActive: boolean;
}

export interface ItemSummary {
  id: number;
  barcode: string;
  callNumber: string;
  title?: string;
  author?: string;
  status: number;
  statusName?: string;
  location: number;
  locationName?: string;
  circLib: number;
  circLibName?: string;
  holdable: boolean;
  circulate: boolean;
  price?: number;
}

// ============================================================================
// Hold Types
// ============================================================================

export interface HoldSummary {
  id: number;
  patronId: number;
  patronName?: string;
  holdType: "T" | "V" | "C" | "M" | "P";
  target: number;
  title?: string;
  author?: string;
  pickupLib: number;
  pickupLibName?: string;
  requestTime: string;
  captureTime?: string;
  shelfTime?: string;
  shelfExpireTime?: string;
  expireTime?: string;
  frozen: boolean;
  thawDate?: string;
  queuePosition?: number;
  potentialCopies?: number;
  status: string;
  currentCopy?: number;
  currentCopyBarcode?: string;
}

// ============================================================================
// Acquisitions Types
// ============================================================================

export interface Fund {
  id: number;
  name: string;
  code: string;
  year: number;
  org: number;
  orgName?: string;
  currencyType: string;
  balance: number;
  allocated: number;
  spent: number;
  encumbered: number;
  active: boolean;
}

export interface FundingSource {
  id: number;
  name: string;
  code: string;
  owner: number;
  ownerName?: string;
  currencyType: string;
  balance: number;
}

export interface FundAllocation {
  id: number;
  fund: number;
  fundName?: string;
  fundingSource: number;
  fundingSourceName?: string;
  amount: number;
  allocator: number;
  allocateTime: string;
  note?: string;
}

export interface Vendor {
  id: number;
  name: string;
  code: string;
  owner: number;
  ownerName?: string;
  email?: string;
  phone?: string;
  active: boolean;
  ediDefault?: number;
}
