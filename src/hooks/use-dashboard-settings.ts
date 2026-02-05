/**
 * useDashboardSettings - Hook for managing customizable dashboard layout
 *
 * Features:
 * - Loads/saves widget configuration from Evergreen user settings
 * - Supports toggling widget visibility
 * - Supports drag-and-drop reordering
 * - Provides optimistic updates with rollback on error
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "./use-api";
import { fetchWithAuth } from "@/lib/client-fetch";

// Widget definitions - all possible dashboard widgets
export interface WidgetConfig {
  id: string;
  label: string;
  description: string;
  icon: string; // Icon name from lucide-react
  defaultEnabled: boolean;
  defaultOrder: number;
}

export const AVAILABLE_WIDGETS: WidgetConfig[] = [
  {
    id: "universal-search",
    label: "Universal Search",
    description: "Search patrons, items, and catalog from one place",
    icon: "Search",
    defaultEnabled: true,
    defaultOrder: 0,
  },
  {
    id: "stat-cards",
    label: "Today's Stats",
    description: "Checkouts, checkins, holds, and overdue counts",
    icon: "BarChart3",
    defaultEnabled: true,
    defaultOrder: 1,
  },
  {
    id: "quick-actions",
    label: "Quick Actions",
    description: "Fast links to common workflows",
    icon: "Zap",
    defaultEnabled: true,
    defaultOrder: 2,
  },
  {
    id: "top-items",
    label: "Top Circulated Items",
    description: "Most popular items by circulation count",
    icon: "TrendingUp",
    defaultEnabled: true,
    defaultOrder: 3,
  },
  {
    id: "overdue-items",
    label: "Overdue Items",
    description: "Items with longest overdue duration",
    icon: "AlertCircle",
    defaultEnabled: true,
    defaultOrder: 4,
  },
  {
    id: "alerts",
    label: "Alerts",
    description: "Operational follow-ups and notifications",
    icon: "Bell",
    defaultEnabled: true,
    defaultOrder: 5,
  },
  {
    id: "date-display",
    label: "Date Display",
    description: "Current date in header",
    icon: "Calendar",
    defaultEnabled: true,
    defaultOrder: -1, // Special: lives in header, not main content
  },
];

// User's widget preferences
export interface WidgetPreference {
  id: string;
  enabled: boolean;
  order: number;
}

export interface DashboardLayout {
  widgets: WidgetPreference[];
  version: number; // For future migrations
}

const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: AVAILABLE_WIDGETS.map((w) => ({
    id: w.id,
    enabled: w.defaultEnabled,
    order: w.defaultOrder,
  })),
  version: 1,
};

const SETTINGS_KEY = "stacksos.dashboard.widgets";
const SETTINGS_URL = "/api/evergreen/user-settings";

export interface UseDashboardSettingsReturn {
  // Current layout
  layout: DashboardLayout;
  // Sorted, enabled widgets ready for rendering
  enabledWidgets: WidgetConfig[];
  // All widgets with their current state
  allWidgets: (WidgetConfig & { enabled: boolean; order: number })[];
  // Loading states
  isLoading: boolean;
  isSaving: boolean;
  error: Error | null;
  // Actions
  toggleWidget: (widgetId: string) => void;
  reorderWidgets: (widgetIds: string[]) => void;
  resetToDefaults: () => void;
  // Edit mode
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
}

export function useDashboardSettings(): UseDashboardSettingsReturn {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const pendingSaveRef = useRef<DashboardLayout | null>(null);

  // Fetch settings from Evergreen
  const {
    data: settingsData,
    isLoading,
    error: fetchError,
  } = useApi<{ settings: Record<string, any> }>(
    `${SETTINGS_URL}?keys=${SETTINGS_KEY}`,
    { immediate: true }
  );

  // Load settings when data arrives
  useEffect(() => {
    if (settingsData?.settings?.[SETTINGS_KEY]) {
      const saved = settingsData.settings[SETTINGS_KEY] as DashboardLayout;
      // Merge with defaults to handle new widgets
      const merged = mergeWithDefaults(saved);
      setLayout(merged);
    }
  }, [settingsData]);

  // Merge saved layout with defaults (handles new widgets added in updates)
  function mergeWithDefaults(saved: DashboardLayout): DashboardLayout {
    const savedMap = new Map(saved.widgets.map((w) => [w.id, w]));
    const merged: WidgetPreference[] = [];

    // Start with saved widgets in their order
    for (const pref of saved.widgets) {
      if (AVAILABLE_WIDGETS.some((w) => w.id === pref.id)) {
        merged.push(pref);
      }
    }

    // Add any new widgets not in saved
    for (const widget of AVAILABLE_WIDGETS) {
      if (!savedMap.has(widget.id)) {
        merged.push({
          id: widget.id,
          enabled: widget.defaultEnabled,
          order: widget.defaultOrder,
        });
      }
    }

    return { widgets: merged, version: saved.version || 1 };
  }

  // Persist layout to Evergreen
  const persistLayout = useCallback(
    async (newLayout: DashboardLayout) => {
      pendingSaveRef.current = layout; // Store for rollback
      setLayout(newLayout); // Optimistic update
      setIsSaving(true);
	      setSaveError(null);

	      try {
	        const response = await fetchWithAuth(SETTINGS_URL, {
	          method: "POST",
	          headers: { "Content-Type": "application/json" },
	          body: JSON.stringify({
	            settings: {
	              [SETTINGS_KEY]: newLayout,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to save settings: ${response.status}`);
        }

        pendingSaveRef.current = null;
      } catch (err) {
        // Rollback on _error
        setSaveError(err instanceof Error ? err : new Error(String(err)));
        if (pendingSaveRef.current) {
          setLayout(pendingSaveRef.current);
          pendingSaveRef.current = null;
        }
      } finally {
        setIsSaving(false);
      }
    },
    [layout]
  );

  // Toggle widget visibility
  const toggleWidget = useCallback(
    (widgetId: string) => {
      const newWidgets = layout.widgets.map((w) =>
        w.id === widgetId ? { ...w, enabled: !w.enabled } : w
      );
      persistLayout({ ...layout, widgets: newWidgets });
    },
    [layout, persistLayout]
  );

  // Reorder widgets (receives array of widget IDs in new order)
  const reorderWidgets = useCallback(
    (widgetIds: string[]) => {
      const newWidgets = widgetIds.map((id, index) => {
        const existing = layout.widgets.find((w) => w.id === id);
        return existing ? { ...existing, order: index } : { id, enabled: true, order: index };
      });

      // Keep any widgets not in the new order (shouldn't happen, but safe)
      for (const w of layout.widgets) {
        if (!widgetIds.includes(w.id)) {
          newWidgets.push(w);
        }
      }

      persistLayout({ ...layout, widgets: newWidgets });
    },
    [layout, persistLayout]
  );

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    persistLayout(DEFAULT_LAYOUT);
  }, [persistLayout]);

  // Compute enabled widgets sorted by order
  const enabledWidgets = AVAILABLE_WIDGETS.filter((w) => {
    const pref = layout.widgets.find((p) => p.id === w.id);
    return pref?.enabled ?? w.defaultEnabled;
  }).sort((a, b) => {
    const orderA = layout.widgets.find((p) => p.id === a.id)?.order ?? a.defaultOrder;
    const orderB = layout.widgets.find((p) => p.id === b.id)?.order ?? b.defaultOrder;
    return orderA - orderB;
  });

  // All widgets with current state
  const allWidgets = AVAILABLE_WIDGETS.map((w) => {
    const pref = layout.widgets.find((p) => p.id === w.id);
    return {
      ...w,
      enabled: pref?.enabled ?? w.defaultEnabled,
      order: pref?.order ?? w.defaultOrder,
    };
  }).sort((a, b) => a.order - b.order);

  return {
    layout,
    enabledWidgets,
    allWidgets,
    isLoading,
    isSaving,
    error: fetchError || saveError,
    toggleWidget,
    reorderWidgets,
    resetToDefaults,
    isEditing,
    setIsEditing,
  };
}
