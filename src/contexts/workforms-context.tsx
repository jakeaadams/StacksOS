"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/client-fetch";

export type WorkformType = "patron" | "record" | "item" | "marc";

export interface WorkformEntry {
  key: string;
  type: WorkformType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  pinned: boolean;
  lastOpenedAt: number;
}

interface WorkformsContextValue {
  workforms: WorkformEntry[];
  pin: (key: string, pinned: boolean) => void;
  close: (key: string) => void;
  clearUnpinned: () => void;
}

const WorkformsContext = createContext<WorkformsContextValue | null>(null);

const STORAGE_KEY = "stacksos_workforms_v1";
const MAX_RECENT = 12;

function safeParseJson(value: string | null): any | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function placeholderTitle(type: WorkformType, id: string) {
  switch (type) {
    case "patron":
      return `Patron #${id}`;
    case "record":
      return `Record #${id}`;
    case "item":
      return `Item #${id}`;
    case "marc":
      return `MARC #${id}`;
  }
}

function parseWorkformFromRoute(
  pathname: string,
  searchParams: ReadonlyURLSearchParams
): { type: WorkformType; id: string; href: string } | null {
  const patronMatch = pathname.match(/^\/staff\/patrons\/(\d+)$/);
  if (patronMatch) {
    return { type: "patron", id: patronMatch[1]!, href: pathname };
  }

  const recordMatch = pathname.match(/^\/staff\/catalog\/record\/(\d+)$/);
  if (recordMatch) {
    return { type: "record", id: recordMatch[1]!, href: pathname };
  }

  const itemMatch = pathname.match(/^\/staff\/catalog\/item\/(\d+)$/);
  if (itemMatch) {
    return { type: "item", id: itemMatch[1]!, href: pathname };
  }

  if (pathname === "/staff/cataloging/marc-editor") {
    const marcId = searchParams.get("id");
    if (marcId && /^\d+$/.test(marcId)) {
      return {
        type: "marc",
        id: marcId,
        href: `/staff/cataloging/marc-editor?id=${encodeURIComponent(marcId)}`,
      };
    }
  }

  return null;
}

async function fetchDetails(type: WorkformType, id: string): Promise<Pick<WorkformEntry, "title" | "subtitle"> | null> {
  try {
    if (type === "patron") {
      const res = await fetchWithAuth(`/api/evergreen/patrons?id=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);
      const patron = data?.patron;
      const first = patron?.first_given_name || patron?.firstName || "";
      const last = patron?.family_name || patron?.lastName || "";
      const name = [last, first].filter(Boolean).join(", ").trim();
      if (!name) return null;
      return { title: name, subtitle: patron?.barcode || patron?.card_barcode || undefined };
    }

    if (type === "record" || type === "marc") {
      const res = await fetchWithAuth(`/api/evergreen/catalog?action=record&id=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);
      const record = data?.record;
      if (!record) return null;
      const title = String(record?.title || "").trim();
      const author = String(record?.author || "").trim();
      if (!title) return null;
      return { title, subtitle: author || undefined };
    }

    if (type === "item") {
      const res = await fetchWithAuth(`/api/evergreen/items?id=${encodeURIComponent(id)}&include=bib`);
      const data = await res.json().catch(() => null);
      const item = data?.item;
      const title = String(item?.title || "").trim();
      const author = String(item?.author || "").trim();
      if (!title) return { title: `Item ${item?.barcode || id}`, subtitle: item?.statusName || undefined };
      return { title, subtitle: author || item?.barcode || undefined };
    }

    return null;
  } catch {
    return null;
  }
}

function coerceWorkforms(raw: unknown): WorkformEntry[] {
  if (!Array.isArray(raw)) return [];

  const entries: WorkformEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const anyItem: any = item;
    if (!isNonEmptyString(anyItem.key)) continue;
    if (!isNonEmptyString(anyItem.type)) continue;
    if (!isNonEmptyString(anyItem.id)) continue;
    if (!isNonEmptyString(anyItem.title)) continue;
    if (!isNonEmptyString(anyItem.href)) continue;

    const type = anyItem.type as WorkformType;
    if (!["patron", "record", "item", "marc"].includes(type)) continue;

    entries.push({
      key: anyItem.key,
      type,
      id: anyItem.id,
      title: anyItem.title,
      subtitle: isNonEmptyString(anyItem.subtitle) ? anyItem.subtitle : undefined,
      href: anyItem.href,
      pinned: Boolean(anyItem.pinned),
      lastOpenedAt: Number.isFinite(Number(anyItem.lastOpenedAt)) ? Number(anyItem.lastOpenedAt) : Date.now(),
    });
  }

  return entries;
}

function clampWorkforms(entries: WorkformEntry[]): WorkformEntry[] {
  const pinned = entries.filter((e) => e.pinned).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  const recent = entries
    .filter((e) => !e.pinned)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, MAX_RECENT);
  return [...pinned, ...recent];
}

export function WorkformsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [workforms, setWorkforms] = useState<WorkformEntry[]>([]);

  const seenFetches = useRef(new Set<string>());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = safeParseJson(localStorage.getItem(STORAGE_KEY));
    const initial = clampWorkforms(coerceWorkforms(raw));
    setWorkforms(initial);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workforms));
  }, [workforms]);

  const pin = useCallback((key: string, pinned: boolean) => {
    setWorkforms((prev) => clampWorkforms(prev.map((w) => (w.key === key ? { ...w, pinned } : w))));
  }, []);

  const close = useCallback((key: string) => {
    setWorkforms((prev) => prev.filter((w) => w.key !== key));
  }, []);

  const clearUnpinned = useCallback(() => {
    setWorkforms((prev) => prev.filter((w) => w.pinned));
  }, []);

  useEffect(() => {
    const parsed = parseWorkformFromRoute(pathname, searchParams);
    if (!parsed) return;

    const key = `${parsed.type}:${parsed.id}`;
    const now = Date.now();

    setWorkforms((prev) => {
      const existing = prev.find((w) => w.key === key);
      if (existing) {
        return clampWorkforms(
          prev.map((w) =>
            w.key === key ? { ...w, href: parsed.href, lastOpenedAt: now } : w
          )
        );
      }

      return clampWorkforms([
        {
          key,
          type: parsed.type,
          id: parsed.id,
          title: placeholderTitle(parsed.type, parsed.id),
          href: parsed.href,
          pinned: false,
          lastOpenedAt: now,
        },
        ...prev,
      ]);
    });

    // Fetch details (best effort) to replace placeholder titles.
    if (seenFetches.current.has(key)) return;
    seenFetches.current.add(key);

    void (async () => {
      const details = await fetchDetails(parsed.type, parsed.id);
      if (!details?.title) return;
      setWorkforms((prev) =>
        clampWorkforms(
          prev.map((w) =>
            w.key === key
              ? {
                  ...w,
                  title: details.title,
                  subtitle: details.subtitle,
                }
              : w
          )
        )
      );
    })();
  }, [pathname, searchParams]);

  const value = useMemo<WorkformsContextValue>(
    () => ({
      workforms,
      pin,
      close,
      clearUnpinned,
    }),
    [workforms, pin, close, clearUnpinned]
  );

  return <WorkformsContext.Provider value={value}>{children}</WorkformsContext.Provider>;
}

export function useWorkforms() {
  const ctx = useContext(WorkformsContext);
  if (!ctx) {
    throw new Error("useWorkforms must be used within WorkformsProvider");
  }
  return ctx;
}
