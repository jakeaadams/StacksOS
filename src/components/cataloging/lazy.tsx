/**
 * Lazy-Loaded Cataloging Components
 * 
 * Dynamic imports for cataloging components to optimize bundle size.
 * These components are typically only needed in cataloging workflows.
 */

"use client";

import dynamic from "next/dynamic";
import { Loader2, Globe } from "lucide-react";

// Loading fallback for authority components
function AuthorityLoading() {
  return (
    <div className="flex items-center justify-center p-4 gap-2 text-muted-foreground">
      <Globe className="h-4 w-4 animate-pulse" />
      <span className="text-sm">Loading authority tools...</span>
    </div>
  );
}

// Generic loading fallback
function CatalogingLoading() {
  return (
    <div className="flex items-center justify-center p-4 gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading...</span>
    </div>
  );
}

/**
 * Lazy-loaded Authority Control (Link to LC/VIAF)
 * ~13KB - Authority linking component
 * Used only in MARC editing workflows
 */
export const LazyAuthorityLink = dynamic(
  () => import("./authority-control").then((mod) => mod.AuthorityLink),
  {
    loading: AuthorityLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded Authority Validation indicator
 * ~2KB - Shows unlinked authority status
 * Used in cataloging record views
 */
export const LazyAuthorityValidation = dynamic(
  () => import("./authority-control").then((mod) => mod.AuthorityValidation),
  {
    loading: CatalogingLoading,
    ssr: false,
  }
);
