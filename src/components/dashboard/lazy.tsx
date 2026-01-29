/**
 * Lazy-Loaded Dashboard Components
 * 
 * Dynamic imports for dashboard components to optimize bundle size.
 */

"use client";

import dynamic from "next/dynamic";
import { Settings2 } from "lucide-react";

// Loading fallback for dashboard editor
function DashboardEditorLoading() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground p-2">
      <Settings2 className="h-4 w-4 animate-pulse" />
      <span className="text-sm">Loading editor...</span>
    </div>
  );
}

/**
 * Lazy-loaded Dashboard Editor
 * ~10KB - Dashboard customization component
 * Only needed when user wants to customize dashboard
 */
export const LazyDashboardEditor = dynamic(
  () => import("./dashboard-editor").then((mod) => mod.DashboardEditor),
  {
    loading: DashboardEditorLoading,
    ssr: false,
  }
);
