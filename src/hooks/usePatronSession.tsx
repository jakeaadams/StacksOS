"use client";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";

export interface PatronCheckout {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  dueDate: string;
  barcode: string;
  renewals: number;
  maxRenewals: number;
  isOverdue: boolean;
  format: "book" | "dvd" | "audiobook" | "ebook" | "other";
}

export interface PatronHold {
  id: number;
  title: string;
  author: string;
  coverUrl?: string;
  status: "pending" | "ready" | "in_transit" | "suspended";
  position?: number;
  totalHolds?: number;
  pickupLocation: string;
  expirationDate?: string;
  suspendedUntil?: string;
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
  // Enhanced features (StacksOS additions)
  readingGoal?: number;
  booksReadThisYear?: number;
  preferredFormats?: string[];
  preferredGenres?: string[];
  readingStreak?: number;
}

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
  placeHold: (recordId: number, pickupLocation: number) => Promise<{ success: boolean; message: string }>;
  cancelHold: (holdId: number) => Promise<{ success: boolean; message: string }>;
  suspendHold: (holdId: number, until?: string) => Promise<{ success: boolean; message: string }>;
  activateHold: (holdId: number) => Promise<{ success: boolean; message: string }>;
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
    } catch (err) {
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
      await Promise.all([
        fetchCheckouts(),
        fetchHolds(),
        fetchFines(),
      ]);

      return true;
    } catch (err) {
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
	    } catch (err) {
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
      await Promise.all([
        fetchCheckouts(),
        fetchHolds(),
        fetchFines(),
      ]);
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
        setCheckouts(data.checkouts || []);
      }
    } catch (err) {
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
        setHolds(data.holds || []);
      }
    } catch (err) {
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
    } catch (err) {
      clientLogger.error("Error fetching fines:", err);
    }
  }, [patron]);

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
      
      return {
        success: response.ok,
        renewed: data.renewed || 0,
        failed: data.failed || 0,
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
        await fetchHolds();
        return { success: true, message: data.message || "Hold placed successfully" };
      }
      
      return { success: false, message: data.error || "Unable to place hold" };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

	  const cancelHold = async (holdId: number) => {
	    try {
	      const response = await fetchWithAuth(`/api/opac/holds/${holdId}`, {
	        method: "DELETE",
	      });
      
      const data = await response.json();
      
      if (response.ok) {
        await fetchHolds();
        return { success: true, message: data.message || "Hold cancelled" };
      }
      
      return { success: false, message: data.error || "Unable to cancel hold" };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

	  const suspendHold = async (holdId: number, until?: string) => {
	    try {
	      const response = await fetchWithAuth(`/api/opac/holds/${holdId}/suspend`, {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ until }),
	      });
      
      const data = await response.json();
      
      if (response.ok) {
        await fetchHolds();
        return { success: true, message: data.message || "Hold suspended" };
      }
      
      return { success: false, message: data.error || "Unable to suspend hold" };
    } catch {
      return { success: false, message: "Unable to connect to the library system" };
    }
  };

	  const activateHold = async (holdId: number) => {
	    try {
	      const response = await fetchWithAuth(`/api/opac/holds/${holdId}/activate`, {
	        method: "POST",
	      });
      
      const data = await response.json();
      
      if (response.ok) {
        await fetchHolds();
        return { success: true, message: data.message || "Hold activated" };
      }
      
      return { success: false, message: data.error || "Unable to activate hold" };
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
      }}
    >
      {children}
    </PatronSessionContext.Provider>
  );
}

export function usePatronSession() {
  const context = useContext(PatronSessionContext);
  if (context === undefined) {
    return {
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
      renewItem: async () => ({ success: false, message: "Not logged in" }),
      renewAll: async () => ({ success: false, renewed: 0, failed: 0 }),
      placeHold: async () => ({ success: false, message: "Not logged in" }),
      cancelHold: async () => ({ success: false, message: "Not logged in" }),
      suspendHold: async () => ({ success: false, message: "Not logged in" }),
      activateHold: async () => ({ success: false, message: "Not logged in" }),
    };
  }
  return context;
}

export default usePatronSession;
