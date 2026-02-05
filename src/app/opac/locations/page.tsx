"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/shared/loading-state";
import {
  MapPin,
  Clock,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  Navigation,
  Building2,
  BookOpen,
} from "lucide-react";

interface LibraryLocation {
  id: number;
  name: string;
  shortName: string;
  type: string;
  address?: {
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  phone?: string;
  email?: string;
  website?: string;
  hours?: {
    [key: string]: { open: string; close: string } | "closed";
  };
  coordinates?: {
    lat: number;
    lng: number;
  };
  amenities?: string[];
  isMainBranch?: boolean;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function parseHours(_hoursStr: string | undefined): LibraryLocation["hours"] | undefined {
  // Evergreen hours format varies - this is a basic placeholder parser.
  return {
    monday: { open: "9:00 AM", close: "8:00 PM" },
    tuesday: { open: "9:00 AM", close: "8:00 PM" },
    wednesday: { open: "9:00 AM", close: "8:00 PM" },
    thursday: { open: "9:00 AM", close: "8:00 PM" },
    friday: { open: "9:00 AM", close: "6:00 PM" },
    saturday: { open: "10:00 AM", close: "5:00 PM" },
    sunday: "closed",
  };
}

function transformOrgTree(tree: any): LibraryLocation[] {
  const locations: LibraryLocation[] = [];

  const processNode = (node: any) => {
    // Only include branches (type 3 in Evergreen is typically Branch)
    if (node.ou_type === 3 || node.ou_type?.id === 3 || node.children?.length === 0) {
      locations.push({
        id: node.id,
        name: node.name,
        shortName: node.shortname || node.short_name || node.name,
        type: node.ou_type?.name || "Branch",
        address: node.billing_address || node.mailing_address ? {
          street1: node.billing_address?.street1 || node.mailing_address?.street1,
          street2: node.billing_address?.street2 || node.mailing_address?.street2,
          city: node.billing_address?.city || node.mailing_address?.city,
          state: node.billing_address?.state || node.mailing_address?.state,
          zip: node.billing_address?.post_code || node.mailing_address?.post_code,
        } : undefined,
        phone: node.phone,
        email: node.email,
        hours: parseHours(node.hours_of_operation),
        isMainBranch: node.parent_ou === 1,
      });
    }

    if (node.children) {
      node.children.forEach(processNode);
    }
  };

  processNode(tree);
  return locations;
}

function isCurrentlyOpen(hours: LibraryLocation["hours"]): boolean {
  if (!hours) return false;
  const now = new Date();
  const dayName = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
  const todayHours = hours[dayName];
  if (todayHours === "closed" || !todayHours) return false;
  // Simplified check - real implementation would parse times properly
  const hour = now.getHours();
  return hour >= 9 && hour < 20;
}

function formatAddress(address: LibraryLocation["address"]): string {
  if (!address) return "";
  const parts = [
    address.street1,
    address.street2,
    `${address.city || ""}, ${address.state || ""} ${address.zip || ""}`.trim(),
  ].filter(Boolean);
  return parts.join(", ");
}

function getDirectionsUrl(location: LibraryLocation): string {
  const address = formatAddress(location.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || location.name)}`;
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<LibraryLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLocation, setExpandedLocation] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "open">("all");

  const fetchLocations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetchWithAuth("/api/evergreen/org-tree");
      if (response.ok) {
        const data = await response.json();
        const locs = transformOrgTree(data.tree || data);
        setLocations(locs);
        if (locs.length > 0) {
          setExpandedLocation(locs[0].id);
        }
      }
    } catch (error) {
      clientLogger.error("Error fetching locations:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLocations();
  }, [fetchLocations]);

  const filteredLocations = filter === "open" 
    ? locations.filter(loc => isCurrentlyOpen(loc.hours))
    : locations;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <LoadingSpinner message="Loading locations..." size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-foreground">Library Locations</h1>
          <p className="mt-2 text-muted-foreground">
            Find a branch near you, check hours, and get directions.
          </p>
          
          {/* Filter buttons */}
          <div className="mt-6 flex gap-2">
            <button type="button"
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
                ${filter === "all" 
                  ? "bg-primary-600 text-white" 
                  : "bg-muted/50 text-foreground/80 hover:bg-muted"}`}
            >
              All Locations ({locations.length})
            </button>
            <button type="button"
              onClick={() => setFilter("open")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
                ${filter === "open" 
                  ? "bg-green-600 text-white" 
                  : "bg-muted/50 text-foreground/80 hover:bg-muted"}`}
            >
              Open Now
            </button>
          </div>
        </div>
      </div>

      {/* Locations list */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {filteredLocations.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/70" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No locations found</h3>
            <p className="mt-2 text-muted-foreground">
              {filter === "open" ? "No branches are currently open." : "No branch information available."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLocations.map((location) => {
              const isOpen = isCurrentlyOpen(location.hours);
              const isExpanded = expandedLocation === location.id;
              
              return (
                <div
                  key={location.id}
                  className="bg-card rounded-xl shadow-sm border border-border overflow-hidden"
                >
                  {/* Header */}
                  <button type="button"
                    onClick={() => setExpandedLocation(isExpanded ? null : location.id)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-lg ${location.isMainBranch ? "bg-primary-100" : "bg-muted/50"}`}>
                        <Building2 className={`h-6 w-6 ${location.isMainBranch ? "text-primary-600" : "text-muted-foreground"}`} />
                      </div>
                      <div className="text-left">
                        <h2 className="font-semibold text-foreground flex items-center gap-2">
                          {location.name}
                          {location.isMainBranch && (
                            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                              Main
                            </span>
                          )}
                        </h2>
                        {location.address && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {location.address.city}, {location.address.state}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium
                        ${isOpen ? "bg-green-100 text-green-700" : "bg-muted/50 text-muted-foreground"}`}>
                        {isOpen ? "Open" : "Closed"}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground/70" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground/70" />
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-6 pb-6 border-t border-border/50">
                      <div className="grid md:grid-cols-2 gap-6 mt-4">
                        {/* Contact & Address */}
                        <div className="space-y-4">
                          {location.address && (
                            <div className="flex items-start gap-3">
                              <MapPin className="h-5 w-5 text-muted-foreground/70 mt-0.5" />
                              <div>
                                <p className="text-foreground">{location.address.street1}</p>
                                {location.address.street2 && (
                                  <p className="text-foreground">{location.address.street2}</p>
                                )}
                                <p className="text-foreground">
                                  {location.address.city}, {location.address.state} {location.address.zip}
                                </p>
                                <a
                                  href={getDirectionsUrl(location)}
                                  target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm mt-2"
                                >
                                  <Navigation className="h-4 w-4" />
                                  Get Directions
                                </a>
                              </div>
                            </div>
                          )}
                          
                          {location.phone && (
                            <div className="flex items-center gap-3">
                              <Phone className="h-5 w-5 text-muted-foreground/70" />
                              <a href={`tel:${location.phone}`} className="text-primary-600 hover:text-primary-700">
                                {location.phone}
                              </a>
                            </div>
                          )}
                          
                          {location.email && (
                            <div className="flex items-center gap-3">
                              <Mail className="h-5 w-5 text-muted-foreground/70" />
                              <a href={`mailto:${location.email}`} className="text-primary-600 hover:text-primary-700">
                                {location.email}
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Hours */}
                        {location.hours && (
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <Clock className="h-5 w-5 text-muted-foreground/70" />
                              <h3 className="font-medium text-foreground">Hours</h3>
                            </div>
                            <div className="space-y-1">
                              {DAYS.map((day) => {
                                const dayHours = location.hours?.[day];
                                const today = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
                                const isToday = day === today;
                                
                                return (
                                  <div
                                    key={day}
                                    className={`flex justify-between text-sm py-1 px-2 rounded
                                      ${isToday ? "bg-primary-50 font-medium" : ""}`}
                                  >
                                    <span className={isToday ? "text-primary-700" : "text-muted-foreground"}>
                                      {DAY_LABELS[day]}
                                    </span>
                                    <span className={isToday ? "text-primary-700" : "text-foreground"}>
                                      {dayHours === "closed" || !dayHours
                                        ? "Closed"
                                        : `${dayHours.open} - ${dayHours.close}`}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Quick actions */}
                      <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                          href={`/opac/search?location=${location.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                        >
                          <BookOpen className="h-4 w-4" />
                          Search This Branch
                        </Link>
                        {location.phone && (
                          <a
                            href={`tel:${location.phone}`}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground/80 rounded-lg hover:bg-muted/30 transition-colors"
                          >
                            <Phone className="h-4 w-4" />
                            Call
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
