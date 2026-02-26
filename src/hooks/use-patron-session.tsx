"use client";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";

export interface PatronCheckout {
  id: number;
  recordId: number | null;
  title: string;
  author: string;
  isbn: string | null;
  coverUrl?: string;
  dueDate: string;
  barcode: string;
  renewalsRemaining: number | null;
  isOverdue: boolean;
  format: "book" | "dvd" | "audiobook" | "ebook" | "other";
}

export interface PatronHold {
  id: number;
  recordId: number;
  title: string;
  author: string;
  coverUrl?: string;
  status: "pending" | "ready" | "in_transit" | "suspended";
  queuePosition?: number | null;
  totalHolds?: number | null;
  pickupLocationId: number | null;
  pickupLocationName: string;
  expirationDate?: string | null;
  suspendedUntil?: string | null;
  format: "book" | "dvd" | "audiobook" | "ebook" | "other";
}

export interface PatronFine {
  id: number;
  type: string;
  title?: string;
  amount: number;
  dateBilled: string;
  isPaid: boolean;
}

export interface PatronInfo {
  id: number;
  firstName: string;
  lastName: string;
  cardNumber: string;
  email?: string;
  phone?: string;
  expirationDate?: string;
  homeLibrary: string;
  checkoutCount: number;
  holdCount: number;
  readyHoldsCount: number;
  fineBalance: number;
  defaultPickupLocation?: number | null;
  defaultSearchLocation?: number | null;
  // Enhanced features (StacksOS additions)
  readingGoal?: number;
  booksReadThisYear?: number;
  preferredFormats?: string[];
  preferredGenres?: string[];
  readingStreak?: number;
}

export type PatronActionDetails = {
  code?: string;
  nextSteps?: string[];
};

export type PatronActionResult = {
  success: boolean;
  message: string;
  details?: PatronActionDetails;
};

interface PatronSessionContextValue {
  patron: PatronInfo | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
  login: (cardNumber: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  // Data fetching
  checkouts: PatronCheckout[];
  holds: PatronHold[];
  fines: PatronFine[];
  fetchCheckouts: () => Promise<void>;
  fetchHolds: () => Promise<void>;
  fetchFines: () => Promise<void>;
  // Actions
  renewItem: (checkoutId: number) => Promise<{ success: boolean; message: string }>;
  renewAll: () => Promise<{ success: boolean; renewed: number; failed: number }>;
  placeHold: (recordId: number, pickupLocation: number) => Promise<PatronActionResult>;
  cancelHold: (holdId: number) => Promise<PatronActionResult>;
  suspendHold: (holdId: number, until?: string) => Promise<PatronActionResult>;
  activateHold: (holdId: number) => Promise<PatronActionResult>;
  changeHoldPickup: (holdId: number, pickupLocation: number) => Promise<PatronActionResult>;
}

const PatronSessionContext = createContext<PatronSessionContextValue | undefined>(undefined);

export function PatronSessionProvider({ children }: { children: ReactNode }) {
  const [patron, setPatron] = useState<PatronInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkouts, setCheckouts] = useState<PatronCheckout[]>([]);
  const [holds, setHolds] = useState<PatronHold[]>([]);
  const [fines, setFines] = useState<PatronFine[]>([]);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/opac/session", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.patron) {
          setPatron(data.patron);
        }
      }
    } catch (err: unknown) {
      clientLogger.error("Session check error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (cardNumber: string, pin: string): Promise<boolean> => {
    try {
      setError(null);
      setIsLoading(true);

      const response = await fetchWithAuth("/api/opac/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: cardNumber, pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
        return false;
      }

      setPatron(data.patron);

      // Fetch initial data after login
      await Promise.all([fetchCheckouts(), fetchHolds(), fetchFines()]);

      return true;
    } catch (err: unknown) {
      clientLogger.error("Login error:", err);
      setError("Unable to connect to the library system");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetchWithAuth("/api/opac/logout", {
        method: "POST",
      });
    } catch (err: unknown) {
      clientLogger.error("Logout error:", err);
    } finally {
      setPatron(null);
      setCheckouts([]);
      setHolds([]);
      setFines([]);
    }
  };

  const refreshSession = async () => {
    await checkSession();
    if (patron) {
      await Promise.all([fetchCheckouts(), fetchHolds(), fetchFines()]);
    }
  };

  const fetchCheckouts = useCallback(async () => {
    if (!patron) return;

    try {
      const response = await fetch(`/api/opac/checkouts`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const raw = Array.isArray(data?.checkouts) ? data.checkouts : [];
        const normalized: PatronCheckout[] = raw
          .map((c: any) => {
            const circId = typeof c.id === "number" ? c.id : parseInt(String(c.id ?? ""), 10);
            if (!Number.isFinite(circId) || circId <= 0) return null;

            const recordIdRaw = c.recordId ?? c.record_id ?? c.bibId ?? c.bib_id;
            const recordIdParsed =
              typeof recordIdRaw === "number"
                ? recordIdRaw
                : parseInt(String(recordIdRaw ?? ""), 10);
            const recordId =
              Number.isFinite(recordIdParsed) && recordIdParsed > 0 ? recordIdParsed : null;

            const isbnRaw =
              typeof c.isbn === "string"
                ? c.isbn
                : typeof c.isbn === "number"
                  ? String(c.isbn)
                  : "";
            const cleanIsbn = isbnRaw.replace(/[^0-9Xx]/g, "");
            const coverUrl = cleanIsbn
              ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`
              : undefined;

            const renewalsRemainingRaw =
              c.renewalsRemaining ?? c.renewals_remaining ?? c.renewal_remaining;
            const renewalsRemainingParsed =
              typeof renewalsRemainingRaw === "number"
                ? renewalsRemainingRaw
                : renewalsRemainingRaw != null
                  ? parseInt(String(renewalsRemainingRaw), 10)
                  : NaN;
            const renewalsRemaining = Number.isFinite(renewalsRemainingParsed)
              ? renewalsRemainingParsed
              : null;

            return {
              id: circId,
              recordId,
              title: String(c.title || "Unknown Title"),
              author: String(c.author || ""),
              isbn: cleanIsbn ? cleanIsbn : null,
              coverUrl: c.coverUrl || coverUrl,
              dueDate: String(c.dueDate || c.due_date || ""),
              barcode: String(c.barcode || ""),
              renewalsRemaining,
              isOverdue: Boolean(c.isOverdue),
              format: (c.format as PatronCheckout["format"]) || "book",
            } satisfies PatronCheckout;
          })
          .filter(Boolean) as PatronCheckout[];
        setCheckouts(normalized);
      }
    } catch (err: unknown) {
      clientLogger.error("Error fetching checkouts:", err);
    }
  }, [patron]);

  const fetchHolds = useCallback(async () => {
    if (!patron) return;

    try {
      const response = await fetch(`/api/opac/holds`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const raw = Array.isArray(data.holds) ? data.holds : [];
        const normalized: PatronHold[] = raw
          .map((h: any) => {
            const status = String(h.status || "").toLowerCase();
            if (!["pending", "ready", "in_transit", "suspended"].includes(status)) {
              return null;
            }

            const recordId =
              typeof h.recordId === "number"
                ? h.recordId
                : parseInt(String(h.recordId ?? h.record_id ?? h.target ?? ""), 10) || 0;

            const isbn = typeof h.isbn === "string" ? h.isbn : "";
            const cleanIsbn = isbn.replace(/[^0-9Xx]/g, "");
            const coverUrl = cleanIsbn
              ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`
              : undefined;

            const pickupId =
              typeof h.pickupLocation === "number"
                ? h.pickupLocation
                : parseInt(String(h.pickupLocation ?? ""), 10);

            const queuePosition =
              typeof h.queuePosition === "number"
                ? h.queuePosition
                : h.queuePosition != null
                  ? parseInt(String(h.queuePosition), 10)
                  : null;

            const totalHolds =
              typeof h.totalHolds === "number"
                ? h.totalHolds
                : h.totalHolds != null
                  ? parseInt(String(h.totalHolds), 10)
                  : null;

            return {
              id: typeof h.id === "number" ? h.id : parseInt(String(h.id ?? ""), 10) || 0,
              recordId,
              title: String(h.title || "Unknown Title"),
              author: String(h.author || ""),
              coverUrl,
              status: status as PatronHold["status"],
              queuePosition: Number.isFinite(queuePosition as any)
                ? (queuePosition as number)
                : null,
              totalHolds: Number.isFinite(totalHolds as any) ? (totalHolds as number) : null,
              pickupLocationId: Number.isFinite(pickupId) ? pickupId : null,
              pickupLocationName: String(h.pickupLocationName || h.pickupLocation || "Library"),
              expirationDate: h.shelfExpireDate || h.expireDate || null,
              suspendedUntil: h.suspendUntil || null,
              format: "book",
            } satisfies PatronHold;
          })
          .filter(Boolean) as PatronHold[];

        setHolds(normalized);
      }
    } catch (err: unknown) {
      clientLogger.error("Error fetching holds:", err);
    }
  }, [patron]);

  const fetchFines = useCallback(async () => {
    if (!patron) return;

    try {
      const response = await fetch(`/api/opac/fines`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setFines(data.fines || []);
      }
    } catch (err: unknown) {
      clientLogger.error("Error fetching fines:", err);
    }
  }, [patron]);

  const parseActionDetails = (raw: any): PatronActionDetails | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const code = typeof raw.code === "string" ? raw.code : undefined;
    const nextSteps = Array.isArray((raw as Record<string, any>).nextSteps)
      ? (raw as Record<string, any>).nextSteps.filter(
          (s: any) => typeof s === "string" && s.trim().length > 0
        )
      : undefined;
    if (!code && (!nextSteps || nextSteps.length === 0)) return undefined;
    return { code, nextSteps };
  };

  const renewItem = async (checkoutId: number) => {
    try {
      const response = await fetchWithAuth(`/api/opac/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchCheckouts();
        return { success: true, message: data.message || "Item renewed successfully" };
      }

      return { success: false, message: data.error || "Renewal failed" };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

  const renewAll = async () => {
    try {
      const response = await fetchWithAuth(`/api/opac/renew-all`, {
        method: "POST",
      });

      const data = await response.json();
      await fetchCheckouts();

      const renewed =
        typeof data?.results?.totalRenewed === "number"
          ? data.results.totalRenewed
          : typeof data?.renewed === "number"
            ? data.renewed
            : 0;
      const failed =
        typeof data?.results?.totalFailed === "number"
          ? data.results.totalFailed
          : typeof data?.failed === "number"
            ? data.failed
            : 0;

      return {
        success: Boolean(data?.success),
        renewed,
        failed,
      };
    } catch {
      return { success: false, renewed: 0, failed: checkouts.length };
    }
  };

  const placeHold = async (recordId: number, pickupLocation: number) => {
    try {
      const response = await fetchWithAuth(`/api/opac/holds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, pickupLocation }),
      });

      const data = await response.json();

      if (response.ok) {
        try {
          localStorage.setItem("stacksos:last_pickup_location", String(pickupLocation));
        } catch {
          // ignore
        }
        await fetchHolds();
        return { success: true, message: data.message || "Hold placed successfully" };
      }

      return {
        success: false,
        message: data.error || "Unable to place hold",
        details: parseActionDetails(data.details),
      };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

  const cancelHold = async (holdId: number) => {
    try {
      const response = await fetchWithAuth(`/api/opac/holds`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchHolds();
        return { success: true, message: data.message || "Hold cancelled" };
      }

      return {
        success: false,
        message: data.error || "Unable to cancel hold",
        details: parseActionDetails(data.details),
      };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

  const suspendHold = async (holdId: number, until?: string) => {
    try {
      const response = await fetchWithAuth(`/api/opac/holds`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId, action: "suspend", suspendUntil: until }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchHolds();
        return { success: true, message: data.message || "Hold suspended" };
      }

      return {
        success: false,
        message: data.error || "Unable to suspend hold",
        details: parseActionDetails(data.details),
      };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

  const activateHold = async (holdId: number) => {
    try {
      const response = await fetchWithAuth(`/api/opac/holds`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId, action: "activate" }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchHolds();
        return { success: true, message: data.message || "Hold activated" };
      }

      return {
        success: false,
        message: data.error || "Unable to activate hold",
        details: parseActionDetails(data.details),
      };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

  const changeHoldPickup = async (holdId: number, pickupLocation: number) => {
    try {
      const response = await fetchWithAuth(`/api/opac/holds`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId, action: "change_pickup", pickupLocation }),
      });

      const data = await response.json();

      if (response.ok) {
        try {
          localStorage.setItem("stacksos:last_pickup_location", String(pickupLocation));
        } catch {
          // ignore
        }
        await fetchHolds();
        return { success: true, message: data.message || "Pickup location updated" };
      }

      return {
        success: false,
        message: data.error || "Unable to change pickup location",
        details: parseActionDetails(data.details),
      };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

  return (
    <PatronSessionContext.Provider
      value={{
        patron,
        isLoggedIn: !!patron,
        isLoading,
        error,
        login,
        logout,
        refreshSession,
        checkouts,
        holds,
        fines,
        fetchCheckouts,
        fetchHolds,
        fetchFines,
        renewItem,
        renewAll,
        placeHold,
        cancelHold,
        suspendHold,
        activateHold,
        changeHoldPickup,
      }}
    >
      {children}
    </PatronSessionContext.Provider>
  );
}

export function usePatronSession(): PatronSessionContextValue {
  const context = useContext(PatronSessionContext);
  if (context !== undefined) return context;

  const fallback: PatronSessionContextValue = {
    patron: null,
    isLoggedIn: false,
    isLoading: true,
    error: null,
    login: async () => false,
    logout: async () => {},
    refreshSession: async () => {},
    checkouts: [],
    holds: [],
    fines: [],
    fetchCheckouts: async () => {},
    fetchHolds: async () => {},
    fetchFines: async () => {},
    renewItem: async (_checkoutId: number) => ({ success: false, message: "Not logged in" }),
    renewAll: async () => ({ success: false, renewed: 0, failed: 0 }),
    placeHold: async (_recordId: number, _pickupLocation: number) => ({
      success: false,
      message: "Not logged in",
    }),
    cancelHold: async (_holdId: number) => ({ success: false, message: "Not logged in" }),
    suspendHold: async (_holdId: number, _until?: string) => ({
      success: false,
      message: "Not logged in",
    }),
    activateHold: async (_holdId: number) => ({ success: false, message: "Not logged in" }),
    changeHoldPickup: async (_holdId: number, _pickupLocation: number) => ({
      success: false,
      message: "Not logged in",
    }),
  };

  return fallback;
}

export default usePatronSession;
