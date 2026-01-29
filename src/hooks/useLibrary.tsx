"use client";
import { clientLogger } from "@/lib/client-logger";

import { useState, useEffect, createContext, useContext, ReactNode } from "react";

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

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<LibraryInfo | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LibraryLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLibraryInfo = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch organization tree from Evergreen
      const response = await fetch("/api/evergreen/orgs", { credentials: "include" });

      if (!response.ok) {
        throw new Error("Failed to fetch library information");
      }

      const data = await response.json();

      // Transform Evergreen org data to LibraryInfo format
      // API returns { payload: [orgTree] } so we need to access payload[0]
      const orgTree = data.orgTree || data.payload?.[0] || data;

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
        if (!currentLocation && libraryInfo.locations.length > 0) {
          // Try to get from localStorage or use first location
          const savedLocationId = typeof window !== "undefined"
            ? localStorage.getItem("preferredLocationId")
            : null;

          const savedLocation = savedLocationId
            ? libraryInfo.locations.find(l => l.id === parseInt(savedLocationId))
            : null;

          setCurrentLocation(savedLocation || libraryInfo.locations[0]);
        }
      }
    } catch (err) {
      clientLogger.error("Error fetching library info:", err);
      setError(err instanceof Error ? err.message : "Unknown error");

      // Set fallback library info
      setLibrary({
        id: 1,
        name: "Library",
        shortName: "LIB",
        locations: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLibraryInfo();
  }, []);

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

  // Default hours structure
  const defaultHours: LibraryHours[] = [
    { day: "Monday", hours: "9 AM - 8 PM" },
    { day: "Tuesday", hours: "9 AM - 8 PM" },
    { day: "Wednesday", hours: "9 AM - 8 PM" },
    { day: "Thursday", hours: "9 AM - 8 PM" },
    { day: "Friday", hours: "9 AM - 6 PM" },
    { day: "Saturday", hours: "10 AM - 5 PM" },
    { day: "Sunday", hours: "Closed" },
  ];

  // Try to parse the hours string if it's in a known format
  // For now, return defaults
  return defaultHours;
}

export default useLibrary;
