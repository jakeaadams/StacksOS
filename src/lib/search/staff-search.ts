import { fetchWithAuth } from "@/lib/client-fetch";

export type StaffPatronSearchType = "barcode" | "email" | "phone" | "name";
export type StaffCatalogSearchType = "keyword" | "isbn";

export interface StaffPatronSearchResult {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  active: boolean;
  barred: boolean;
  photoUrl?: string;
}

export interface StaffCatalogSearchResult {
  id: number;
  title: string;
  author?: string;
  isbn?: string;
  pubdate?: string;
  format?: string;
  coverUrl?: string;
}

export interface StaffItemSearchResult {
  id: number;
  barcode: string;
  title: string;
  status: string;
  statusId: number;
  location: string;
}

type JsonRecord = Record<string, any>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "t" || normalized === "true" || normalized === "1";
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

async function parseJsonResponse(response: Response): Promise<JsonRecord | null> {
  const json = await response.json().catch(() => null);
  return asRecord(json);
}

function parsePatron(row: unknown): StaffPatronSearchResult | null {
  const patron = asRecord(row);
  if (!patron) return null;

  const id = asNumber(patron.id);
  if (id === null) return null;

  const card = asRecord(patron.card);
  const barcode = asString(patron.barcode) || asString(card?.barcode) || "";
  const firstName = asString(patron.first_given_name) || asString(patron.firstName) || "";
  const lastName = asString(patron.family_name) || asString(patron.lastName) || "";
  const email = asString(patron.email) || undefined;
  const phone = asString(patron.day_phone) || asString(patron.phone) || undefined;
  const photoUrl = asString(patron.photo_url) || asString(patron.photoUrl) || undefined;

  return {
    id,
    barcode,
    firstName,
    lastName,
    email,
    phone,
    active: asBoolean(patron.active),
    barred: asBoolean(patron.barred),
    photoUrl,
  };
}

function parseCatalogRecord(row: unknown): StaffCatalogSearchResult | null {
  const record = asRecord(row);
  if (!record) return null;

  const id = asNumber(record.id);
  if (id === null) return null;

  return {
    id,
    title: asString(record.title) || "Unknown Title",
    author: asString(record.author) || undefined,
    isbn: asString(record.isbn) || undefined,
    pubdate: asString(record.pubdate) || undefined,
    format: asString(record.format) || undefined,
    coverUrl: asString(record.coverUrl) || undefined,
  };
}

function parseItem(row: unknown): StaffItemSearchResult | null {
  const item = asRecord(row);
  if (!item) return null;

  const id = asNumber(item.id);
  if (id === null) return null;

  return {
    id,
    barcode: asString(item.barcode) || "",
    title: asString(item.title) || "Unknown",
    status: asString(item.statusName) || asString(item.status) || "Unknown",
    statusId: asNumber(item.statusId) || 0,
    location: asString(item.location) || asString(item.circLib) || "",
  };
}

export async function searchStaffPatrons(
  query: string,
  type: StaffPatronSearchType = "name",
  limit = 5
): Promise<StaffPatronSearchResult[]> {
  if (!query.trim()) return [];
  const response = await fetchWithAuth(
    `/api/evergreen/patrons?q=${encodeURIComponent(query)}&type=${type}&limit=${Math.max(limit, 1)}`
  );
  const json = await parseJsonResponse(response);
  if (!response.ok || json?.ok === false || !Array.isArray(json?.patrons)) return [];

  return json.patrons
    .map((row) => parsePatron(row))
    .filter((row): row is StaffPatronSearchResult => row !== null)
    .slice(0, limit);
}

export async function searchStaffCatalog(
  query: string,
  type: StaffCatalogSearchType = "keyword",
  limit = 5
): Promise<StaffCatalogSearchResult[]> {
  if (!query.trim()) return [];
  const response = await fetchWithAuth(
    `/api/evergreen/catalog?q=${encodeURIComponent(query)}&type=${type}&limit=${Math.max(limit, 1)}`
  );
  const json = await parseJsonResponse(response);
  if (!response.ok || json?.ok === false || !Array.isArray(json?.records)) return [];

  return json.records
    .map((row) => parseCatalogRecord(row))
    .filter((row): row is StaffCatalogSearchResult => row !== null)
    .slice(0, limit);
}

export async function searchStaffItemsByBarcode(
  barcode: string,
  limit = 3
): Promise<StaffItemSearchResult[]> {
  if (!barcode.trim()) return [];
  const response = await fetchWithAuth(
    `/api/evergreen/items?barcode=${encodeURIComponent(barcode)}`
  );
  const json = await parseJsonResponse(response);
  if (!response.ok || json?.ok === false) return [];

  const candidates: unknown[] = [];
  if (json?.item) candidates.push(json.item);
  if (Array.isArray(json?.items)) candidates.push(...json.items);

  const parsed = candidates
    .map((row) => parseItem(row))
    .filter((row): row is StaffItemSearchResult => row !== null);

  return parsed.slice(0, limit);
}
