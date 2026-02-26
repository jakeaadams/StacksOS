/**
 * Typed Payload Extraction Helpers
 *
 * Provides `fieldValue()` and `payloadFirst()` to replace:
 *   - `response?.payload?.[0] as any as any`  chains
 *   - hardcoded `obj.__p?.[N]` index accesses
 *   - inline `extract(obj, "field", idx)` closures
 *
 * Usage:
 *   import { fieldValue, payloadFirst } from "@/lib/api/extract-payload";
 *   import { PGT_FIELDS } from "@/lib/api/fieldmapper-maps";
 *
 *   const result = payloadFirst(response);
 *   const name = fieldValue(group, "name", PGT_FIELDS);
 */

import type { OpenSRFResponse } from "./types";

// ---------------------------------------------------------------------------
// fieldValue  -  type-safe field extraction from decoded or raw FM objects
// ---------------------------------------------------------------------------

/**
 * Extracts a single field value from an Evergreen object that may be either:
 *   - A decoded object with named properties (after `decodeFieldmapper`)
 *   - A raw fieldmapper object with `__p` positional array
 *   - A plain JS object with named keys
 *
 * @param obj   The object to extract from (may be null/undefined)
 * @param field The field name (must be a key in the supplied `fields` map)
 * @param fields A const map of `{ fieldName: index }` from fieldmapper-maps.ts
 * @returns The value at that position, or null if not found
 *
 * @example
 *   import { PGT_FIELDS } from "@/lib/api/fieldmapper-maps";
 *   const id = fieldValue(group, "id", PGT_FIELDS);         // number | null
 *   const name = fieldValue(group, "name", PGT_FIELDS);     // string | null
 */
export function fieldValue<
  T = any,
  TFields extends Readonly<Record<string, number>> = Readonly<Record<string, number>>,
  TKey extends string & keyof TFields = string & keyof TFields,
>(obj: unknown, field: TKey, fields: TFields): T | null {
  if (!obj || typeof obj !== "object") return null;

  const record = obj as Record<string, any>;

  // 1. Try direct property access (decoded object)
  const direct = record[field];
  if (direct !== undefined) return direct;

  // 2. Try __p array access (raw fieldmapper object)
  const arr = record.__p;
  if (Array.isArray(arr)) {
    const idx = fields[field];
    if (typeof idx === "number") {
      const val = arr[idx];
      return val === undefined ? null : val;
    }
  }

  return null;
}

/**
 * Like `fieldValue` but always returns a `string | null`.
 * Coerces non-null, non-undefined values to strings.
 */
export function fieldString<
  TFields extends Readonly<Record<string, number>>,
  TKey extends string & keyof TFields,
>(obj: unknown, field: TKey, fields: TFields): string | null {
  const raw = fieldValue(obj, field, fields);
  if (raw === null || raw === undefined) return null;
  return typeof raw === "string" ? raw : String(raw);
}

/**
 * Like `fieldValue` but always returns a `number | null`.
 * Parses string values as integers.
 */
export function fieldNumber<
  TFields extends Readonly<Record<string, number>>,
  TKey extends string & keyof TFields,
>(obj: unknown, field: TKey, fields: TFields): number | null {
  const raw = fieldValue(obj, field, fields);
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  const parsed = parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Like `fieldValue` but always returns a `boolean | null`.
 * Handles Evergreen's 't'/'f' string booleans and numeric 0/1.
 */
export function fieldBool<
  TFields extends Readonly<Record<string, number>>,
  TKey extends string & keyof TFields,
>(obj: unknown, field: TKey, fields: TFields): boolean | null {
  const raw = fieldValue(obj, field, fields);
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "boolean") return raw;
  if (raw === "t" || raw === "true" || raw === 1) return true;
  if (raw === "f" || raw === "false" || raw === 0) return false;
  return null;
}

// ---------------------------------------------------------------------------
// payloadFirst  -  replaces `response?.payload?.[0] as any as any`
// ---------------------------------------------------------------------------

/**
 * Safely extracts the first element from an OpenSRF response payload.
 *
 * Replaces the widespread pattern:
 *   `const result = response?.payload?.[0] as any as any;`
 *
 * @param response  The raw response from `callOpenSRF()`
 * @returns The first payload element, or null if none exists
 *
 * @example
 *   const response = await callOpenSRF("open-ils.pcrud", ...);
 *   const result = payloadFirst(response);
 *   if (result?.ilsevent) { ... }
 */
export function payloadFirst<T = any>(response: OpenSRFResponse | null | undefined): T | null {
  if (!response) return null;
  const payload = response.payload;
  if (!Array.isArray(payload) || payload.length === 0) return null;
  return (payload[0] as T) ?? null;
}

/**
 * Safely extracts the first payload element, typed as an array.
 * Many pcrud `.atomic` calls return an array inside `payload[0]`.
 *
 * @param response  The raw response from `callOpenSRF()`
 * @returns The first payload element if it's an array, otherwise an empty array.
 */
export function payloadFirstArray(response: OpenSRFResponse | null | undefined): any[] {
  const first = payloadFirst(response);
  return Array.isArray(first) ? first : [];
}

/**
 * Extracts the full payload array from an OpenSRF response.
 *
 * @param response  The raw response from `callOpenSRF()`
 * @returns The payload array, or an empty array if none.
 */
export function payloadAll(response: OpenSRFResponse | null | undefined): any[] {
  if (!response) return [];
  const payload = response.payload;
  return Array.isArray(payload) ? payload : [];
}

// ---------------------------------------------------------------------------
// Convenience: extract + nested object field resolution
// ---------------------------------------------------------------------------

/**
 * Extracts a nested object's field - useful for fleshed Evergreen responses
 * where a field may be either a raw ID or a fleshed object.
 *
 * @example
 *   // p.org_unit may be a number (raw) or an object (fleshed)
 *   const orgUnitName = nestedFieldValue(p.org_unit, "shortname", AOU_FIELDS);
 */
export function nestedFieldValue<
  T = any,
  TFields extends Readonly<Record<string, number>> = Readonly<Record<string, number>>,
  TKey extends string & keyof TFields = string & keyof TFields,
>(obj: unknown, field: TKey, fields: TFields): T | null {
  if (!obj || typeof obj !== "object") return null;
  return fieldValue(obj, field, fields);
}
