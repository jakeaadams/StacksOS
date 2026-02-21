import fs from "fs";
import path from "path";

export interface IdlClassDef {
  fields: string[];
  fieldMap: Record<string, number>;
}

export type IdlMap = Record<string, IdlClassDef>;

let idlCache: IdlMap | null = null;

const DEFAULT_IDL_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "api",
  "idl",
  "fm_IDL.xml"
);

function loadIdl(): IdlMap {
  if (idlCache) return idlCache;

  const idlPath = process.env.EVERGREEN_IDL_PATH || DEFAULT_IDL_PATH;
  if (!fs.existsSync(idlPath)) {
    idlCache = {};
    return idlCache;
  }

  const xml = fs.readFileSync(idlPath, "utf8");
  const classRegex = /<class[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g;
  const fieldsRegex = /<fields[^>]*>([\s\S]*?)<\/fields>/;
  const fieldRegex = /<field[^>]*name="([^"]+)"[^>]*\/?>(?:<\/field>)?/g;

  const map: IdlMap = {};
  let classMatch: RegExpExecArray | null;

  while ((classMatch = classRegex.exec(xml)) !== null) {
    const classId = classMatch[1];
    const classBody = classMatch[2];
    const fieldsBlock = fieldsRegex.exec(classBody!);

    if (!fieldsBlock) continue;

    const fieldNames: string[] = [];

    // fieldRegex is global; reset between classes so we parse every <fields> block.
    fieldRegex.lastIndex = 0;

    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(fieldsBlock[1]!)) !== null) {
      fieldNames.push(fieldMatch[1]!);
    }

    if (fieldNames.length > 0) {
      const fieldMap: Record<string, number> = {};
      fieldNames.forEach((name, idx) => {
        fieldMap[name] = idx;
      });

      // Fieldmapper adds virtual fields after all real fields.
      ["isnew", "ischanged", "isdeleted"].forEach((name) => {
        if (!(name in fieldMap)) {
          fieldMap[name] = fieldNames.length;
          fieldNames.push(name);
        }
      });

      map[classId!] = { fields: fieldNames, fieldMap };
    }
  }

  idlCache = map;
  return idlCache;
}

function isFieldmapperObject(value: any): value is { __c: string; __p: any[] } {
  return (
    value &&
    typeof value === "object" &&
    typeof value.__c === "string" &&
    Array.isArray(value.__p)
  );
}

function encodeFieldmapperValue(value: any): any {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => encodeFieldmapperValue(item));
  }

  if (typeof value === "object") {
    if (isFieldmapperObject(value)) return value;
  }

  return value;
}

export function encodeFieldmapper(classId: string, data: Record<string, unknown>) {
  const idl = loadIdl();
  const classDef = idl[classId];

  if (!classDef) {
    return { __c: classId, __p: [] };
  }

  const payload = new Array(classDef.fields.length).fill(null);

  Object.entries(data).forEach(([key, value]) => {
    const idx = classDef.fieldMap[key];
    if (idx === undefined) return;
    payload[idx] = encodeFieldmapperValue(value);
  });

  return { __c: classId, __p: payload };
}

export function decodeFieldmapper(value: any): any {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => decodeFieldmapper(item));
  }

  if (typeof value !== "object") return value;

  if (value.ilsevent !== undefined) {
    return value;
  }

  if (isFieldmapperObject(value)) {
    const idl = loadIdl();
    const classDef = idl[value.__c];

    if (!classDef) {
      return {
        __class: value.__c,
        __p: decodeFieldmapper(value.__p),
      };
    }

    const decoded: Record<string, unknown> = { __class: value.__c };
    classDef.fields.forEach((fieldName, idx) => {
      decoded[fieldName] = decodeFieldmapper(value.__p[idx]);
    });

    return decoded;
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    output[key] = decodeFieldmapper(val);
  }

  return output;
}

export function decodeOpenSRFResponse<T = any>(response: T): T {
  if (!response || typeof response !== "object") return response;

  const payload = (response as Record<string, unknown>).payload;
  if (!payload) return response;

  return {
    ...(response as Record<string, unknown>),
    payload: decodeFieldmapper(payload),
  } as T;
}

/**
 * Safely access a fieldmapper field value
 * Handles both direct object properties and __p array access
 */
export function fmGet<T = any>(value: any, key: string, index?: number): T | undefined {
  if (!value || typeof value !== "object") return undefined;

  // Try direct property access first
  const direct = (value as Record<string, unknown>)[key];
  if (direct !== undefined) return direct as T;

  // Try __p array access if index provided
  const arr = (value as Record<string, unknown>).__p;
  if (Array.isArray(arr) && typeof index === "number") {
    return arr[index] as T;
  }

  return undefined;
}

/**
 * Get a number value from fieldmapper object
 * Returns undefined if value is not a valid number
 */
export function fmNumber(value: unknown, key: string, index?: number): number | undefined {
  const raw = fmGet(value, key, index);
  if (typeof raw === "number") return raw;
  
  const parsed = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Get a string value from fieldmapper object
 * Returns undefined if value is null or undefined
 */
export function fmString(value: unknown, key: string, index?: number): string | undefined {
  const raw = fmGet(value, key, index);
  if (raw === null || raw === undefined) return undefined;
  return typeof raw === "string" ? raw : String(raw);
}

/**
 * Get a boolean value from fieldmapper object
 * Handles 't'/'f' string values from database
 */
export function fmBoolean(value: any, key: string, index?: number): boolean | undefined {
  const raw = fmGet(value, key, index);
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "boolean") return raw;
  if (raw === "t" || raw === "true" || raw === 1) return true;
  if (raw === "f" || raw === "false" || raw === 0) return false;
  return undefined;
}

/**
 * Get a date value from fieldmapper object
 * Parses ISO date strings
 */
export function fmDate(value: any, key: string, index?: number): Date | undefined {
  const raw = fmGet(value, key, index);
  if (raw === null || raw === undefined) return undefined;
  if (raw instanceof Date) return raw;
  
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}
