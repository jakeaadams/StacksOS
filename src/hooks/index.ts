/**
 * Shared Hooks
 *
 * Reusable React hooks for consistent behavior across the application.
 * These hooks encapsulate common patterns and reduce code duplication.
 */

// Data fetching
export { useApi, useMutation, ApiError } from "./use-api";
export type { ApiState, UseApiOptions, UseApiReturn, MutationOptions, UseMutationReturn } from "./use-api";

// Debouncing and throttling
export { useDebounce, useDebouncedCallback, useThrottledCallback } from "./use-debounce";

// Keyboard shortcuts
export {
  useKeyboardShortcut,
  useKeyboardShortcuts,
  useKeyPressed,
  formatShortcut,
} from "./use-keyboard-shortcut";
export type { KeyboardShortcut } from "./use-keyboard-shortcut";

// Domain-specific lookups
export { usePatronLookup } from "./use-patron-lookup";
export type {
  PatronSummary,
  PatronFull,
  UsePatronLookupOptions,
  UsePatronLookupReturn,
} from "./use-patron-lookup";

export { useItemLookup } from "./use-item-lookup";
export type {
  CopyStatus,
  ItemSummary,
  ItemFull,
  UseItemLookupOptions,
  UseItemLookupReturn,
} from "./use-item-lookup";

// Dashboard customization
export { useDashboardSettings, AVAILABLE_WIDGETS } from "./use-dashboard-settings";
export type {
  WidgetConfig,
  WidgetPreference,
  DashboardLayout,
  UseDashboardSettingsReturn,
} from "./use-dashboard-settings";

// Audio Feedback
export { useAudioFeedback } from "./use-audio-feedback";
export type { SoundType, AudioFeedbackOptions } from "./use-audio-feedback";

// Auto-refresh / polling
export { useAutoRefresh } from "./use-auto-refresh";
export type { UseAutoRefreshOptions, UseAutoRefreshReturn } from "./use-auto-refresh";

