/**
 * Lazy-Loaded AI Components
 * 
 * Dynamic imports for AI/ML components to optimize bundle size.
 */

"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Loading fallback for AI components
function AILoading() {
  return (
    <div className="flex items-center justify-center p-6 gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading AI Assistant...</span>
    </div>
  );
}

/**
 * Lazy-loaded Cataloging Copilot
 * ~15KB - AI-assisted cataloging component
 * Used only in cataloging workflows
 */
export const LazyCatalogingCopilot = dynamic(
  () => import("./cataloging-copilot").then((mod) => mod.CatalogingCopilot),
  {
    loading: AILoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded Policy Explainer
 * ~14KB - AI policy explanation component
 * Used in staff and OPAC help contexts
 */
export const LazyPolicyExplainer = dynamic(
  () => import("./policy-explainer").then((mod) => mod.PolicyExplainer),
  {
    loading: AILoading,
    ssr: false,
  }
);
