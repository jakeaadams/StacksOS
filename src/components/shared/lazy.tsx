/**
 * Lazy-Loaded Components
 * 
 * Dynamic imports for heavy components to optimize bundle size.
 * Use these instead of direct imports for components that:
 * - Are large (> 50KB)
 * - Are not needed on initial page load
 * - Are used in dialogs/modals
 * - Are admin-only features
 * 
 * @example
 * import { LazyMarcDiff } from "@/components/shared/lazy";
 * 
 * // In your component:
 * <LazyMarcDiff oldMarc={old} newMarc={new} open={open} onOpenChange={setOpen} />
 */

"use client";

import dynamic from "next/dynamic";
import { LoadingSpinner } from "./loading-state";
import type { MarcDiffProps } from "./marc-diff";
import type { CoverArtPickerProps } from "./cover-art-picker";

// Loading fallback component
function ComponentLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <LoadingSpinner size="lg" />
    </div>
  );
}

// Compact loading for smaller components
function CompactLoading() {
  return (
    <div className="flex items-center justify-center p-4">
      <LoadingSpinner size="sm" />
    </div>
  );
}

/**
 * Lazy-loaded MARC diff viewer
 * ~18KB - Used only in cataloging import workflows
 */
export const LazyMarcDiff = dynamic<MarcDiffProps>(
  () => import("./marc-diff").then((mod) => mod.MarcDiff),
  {
    loading: ComponentLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded cover art picker
 * ~14KB - Used only in record editing
 */
export const LazyCoverArtPicker = dynamic<CoverArtPickerProps>(
  () => import("./cover-art-picker").then((mod) => mod.CoverArtPicker),
  {
    loading: ComponentLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded patron cockpit (detailed patron view)
 * ~16KB - Used only in patron detail modals
 */
export const LazyPatronCockpit = dynamic(
  () => import("./patron-cockpit").then((mod) => mod.PatronCockpit),
  {
    loading: ComponentLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded record cockpit (detailed bibliographic view)
 * ~14KB - Used only in record detail modals
 */
export const LazyRecordCockpit = dynamic(
  () => import("./record-cockpit").then((mod) => mod.RecordCockpit),
  {
    loading: ComponentLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded universal search (command palette style)
 * ~16KB - Loaded on demand via keyboard shortcut
 */
export const LazyUniversalSearch = dynamic(
  () => import("./universal-search").then((mod) => mod.UniversalSearch),
  {
    loading: ComponentLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded data table
 * ~18KB - Complex table component with sorting/filtering
 * Used when rendering large datasets
 */
export const LazyDataTable = dynamic(
  () => import("./data-table").then((mod) => mod.DataTable),
  {
    loading: ComponentLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded patron card
 * ~15KB - Detailed patron information card
 * Used in circulation and patron management
 */
export const LazyPatronCard = dynamic(
  () => import("./patron-card").then((mod) => mod.PatronCard),
  {
    loading: ComponentLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded place hold dialog
 * ~12KB - Hold placement workflow dialog
 * Used on demand when placing holds
 */
export const LazyPlaceHoldDialog = dynamic(
  () => import("./place-hold-dialog").then((mod) => mod.PlaceHoldDialog),
  {
    loading: CompactLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded keyboard shortcuts overlay
 * ~8KB - Shows available keyboard shortcuts
 * Loaded on demand via keyboard shortcut
 */
export const LazyKeyboardShortcutsOverlay = dynamic(
  () => import("./keyboard-shortcuts-overlay").then((mod) => mod.KeyboardShortcutsOverlay),
  {
    loading: CompactLoading,
    ssr: false,
  }
);

/**
 * Lazy-loaded command palette
 * ~12KB - Staff command palette loaded on demand via Cmd+K
 */
export const LazyCommandPalette = dynamic(
  () => import("../layout/command-palette").then((mod) => mod.CommandPalette),
  {
    loading: CompactLoading,
    ssr: false,
  }
);
