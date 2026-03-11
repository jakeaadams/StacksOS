"use client";
import { clientLogger } from "@/lib/client-logger";

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";

export interface LibraryHours {
  day: string;
  hours: string;
}

export interface LibraryLocation {
  id: number;
  name: string;
  shortName: string;
  address?: string;
  phone?: string;
  email?: string;
  hours?: string;
  hoursDetailed?: LibraryHours[];
  isPickupLocation: boolean;
}

export interface LibrarySocialLinks {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
}

export interface LibraryInfo {
  id: number;
  name: string;
  shortName: string;
  tagline?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  hours?: string;
  hoursDetailed?: LibraryHours[];
  socialLinks?: LibrarySocialLinks;
  locations: LibraryLocation[];
  // Branding
  primaryColor?: string;
  accentColor?: string;
  // Features
  allowSelfRegistration?: boolean;
  allowOnlinePayments?: boolean;
  eContentEnabled?: boolean;
}

interface LibraryContextValue {
  library: LibraryInfo | null;
  currentLocation: LibraryLocation | null;
  isLoading: boolean;
  error: string | null;
  setCurrentLocation: (location: LibraryLocation) => void;
  refetch: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

function deriveShortName(name: string | null | undefined): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "LIB";

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return parts
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }

  return (
    trimmed
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "LIB"
  );
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<LibraryInfo | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LibraryLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLibraryInfo = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Use the public OPAC endpoint — works for patrons and anonymous visitors
      const response = await fetch("/api/opac/library-info");

      if (!response.ok) {
        throw new Error("Failed to fetch library information");
      }

      const data = await response.json();
      const tenantName: string = data.tenantDisplayName || "";

      // Transform Evergreen org data to LibraryInfo format
      const orgTree = data.orgTree?.payload?.[0] || data.orgTree || null;

      if (!orgTree) {
        // Evergreen unreachable — use tenant display name as graceful fallback
        setLibrary({
          id: 0,
          name: tenantName || "Library",
          shortName: deriveShortName(tenantName || "Library"),
          locations: [],
        });
        return;
      }

      // Find the root organization or consortium
      const rootOrg = findRootOrg(orgTree);

      if (rootOrg) {
        const libraryInfo: LibraryInfo = {
          id: rootOrg.id,
          name: rootOrg.name || "Library",
          shortName: rootOrg.shortname || rootOrg.short_name || "LIB",
          tagline: rootOrg.tagline,
          logoUrl: rootOrg.logo_url,
          address: formatAddress(rootOrg),
          phone: rootOrg.phone,
          email: rootOrg.email,
          website: rootOrg.website,
          hours: rootOrg.hours_of_operation,
          hoursDetailed: parseHours(rootOrg.hours_of_operation),
          socialLinks: {
            facebook: rootOrg.facebook_url,
            twitter: rootOrg.twitter_url,
            instagram: rootOrg.instagram_url,
            youtube: rootOrg.youtube_url,
          },
          locations: extractLocations(orgTree),
          primaryColor: rootOrg.primary_color || "#2563eb",
          accentColor: rootOrg.accent_color || "#059669",
          allowSelfRegistration: rootOrg.allow_self_registration !== false,
          allowOnlinePayments: rootOrg.allow_online_payments === true,
          eContentEnabled: rootOrg.econtent_enabled === true,
        };

        setLibrary(libraryInfo);

        // Set default location if not already set
        if (libraryInfo.locations.length > 0) {
          setCurrentLocation((prev) => {
            if (prev) return prev;

            const savedLocationId =
              typeof window !== "undefined" ? localStorage.getItem("preferredLocationId") : null;
            const savedLocation = savedLocationId
              ? libraryInfo.locations.find((l) => l.id === parseInt(savedLocationId, 10))
              : null;
            return savedLocation ?? libraryInfo.locations[0]!;
          });
        }
      }
    } catch (err) {
      clientLogger.error("Error fetching library info:", err);
      setError(err instanceof Error ? err.message : "Unknown error");

      // Set graceful fallback — never show "Library data unavailable" to patrons
      setLibrary({
        id: 0,
        name: "Library",
        shortName: deriveShortName("Library"),
        locations: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLibraryInfo();
  }, [fetchLibraryInfo]);

  const handleSetCurrentLocation = (location: LibraryLocation) => {
    setCurrentLocation(location);
    if (typeof window !== "undefined") {
      localStorage.setItem("preferredLocationId", location.id.toString());
    }
  };

  return (
    <LibraryContext.Provider
      value={{
        library,
        currentLocation,
        isLoading,
        error,
        setCurrentLocation: handleSetCurrentLocation,
        refetch: fetchLibraryInfo,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (context === undefined) {
    // Return default values if used outside provider
    return {
      library: null,
      currentLocation: null,
      isLoading: true,
      error: null,
      setCurrentLocation: () => {},
      refetch: async () => {},
    };
  }
  return context;
}

// Helper functions

function findRootOrg(org: any): any {
  if (!org) return null;
  // If this is the root (no parent or parent_ou is null), return it
  if (!org.parent_ou && org.ou_type === 1) return org;
  // If it has children, this might be the root
  if (org.children && org.children.length > 0) return org;
  return org;
}

function extractLocations(orgTree: any): LibraryLocation[] {
  const locations: LibraryLocation[] = [];

  function traverse(org: any) {
    if (!org) return;

    // Add branches and sublibraries as locations
    // ou_type: 1=consortium, 2=system, 3=branch, 4=bookmobile, etc.
    if (org.ou_type >= 3 || org.can_have_vols) {
      locations.push({
        id: org.id,
        name: org.name,
        shortName: org.shortname || org.short_name || org.name,
        address: formatAddress(org),
        phone: org.phone,
        email: org.email,
        hours: org.hours_of_operation,
        hoursDetailed: parseHours(org.hours_of_operation),
        isPickupLocation: org.pickup_location !== false,
      });
    }

    // Traverse children
    if (org.children && Array.isArray(org.children)) {
      org.children.forEach(traverse);
    }
  }

  traverse(orgTree);
  return locations;
}

function formatAddress(org: any): string | undefined {
  if (!org) return undefined;

  const parts = [
    org.street1 || org.ill_address?.street1,
    org.street2 || org.ill_address?.street2,
    org.city || org.ill_address?.city,
    org.state || org.ill_address?.state,
    org.zip || org.post_code || org.ill_address?.post_code,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function parseHours(hoursString?: string): LibraryHours[] | undefined {
  if (!hoursString) return undefined;
  // Evergreen stores hours in multiple formats. Until we support each format,
  // avoid fabricating values and render only raw text.
  return undefined;
}

export default useLibrary;
