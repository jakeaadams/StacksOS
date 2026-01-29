/**
 * Application Constants
 * 
 * Centralized constants for timeouts, delays, and configuration values.
 * This prevents magic numbers scattered throughout the codebase.
 */

// ============================================================================
// Debounce & Throttle Delays (milliseconds)
// ============================================================================

/**
 * Standard debounce delay for search inputs and filters
 * Used to prevent excessive API calls while user is typing
 */
export const DEBOUNCE_DELAY_MS = 300;

/**
 * Quick debounce for very responsive UI elements
 * Use sparingly - only when immediate feedback is critical
 */
export const DEBOUNCE_DELAY_QUICK_MS = 150;

// ============================================================================
// Polling & Status Check Intervals (milliseconds)
// ============================================================================

/**
 * Interval for checking system status/latency
 */
export const STATUS_CHECK_INTERVAL_MS = 30000; // 30 seconds

/**
 * Interval for auto-refreshing data on active pages
 */
export const AUTO_REFRESH_INTERVAL_MS = 60000; // 1 minute

// ============================================================================
// Time Conversion Utilities
// ============================================================================

/**
 * Convert days to milliseconds
 * @example DAYS_TO_MS(21) // 21 days in milliseconds
 */
export const DAYS_TO_MS = (days: number): number => days * 24 * 60 * 60 * 1000;

/**
 * Convert hours to milliseconds
 */
export const HOURS_TO_MS = (hours: number): number => hours * 60 * 60 * 1000;

/**
 * Convert minutes to milliseconds
 */
export const MINUTES_TO_MS = (minutes: number): number => minutes * 60 * 1000;

/**
 * Convert seconds to milliseconds
 */
export const SECONDS_TO_MS = (seconds: number): number => seconds * 1000;

// ============================================================================
// Common Timeout Values
// ============================================================================

/**
 * Timeout for toast/notification auto-dismiss
 */
export const TOAST_DISMISS_MS = 5000; // 5 seconds

/**
 * Timeout for temporary UI states (loading, success indicators)
 */
export const TEMP_STATE_TIMEOUT_MS = 3000; // 3 seconds

/**
 * Timeout for API requests
 */
export const API_TIMEOUT_MS = 30000; // 30 seconds

// ============================================================================
// Pagination & Data Limits
// ============================================================================

/**
 * Default page size for data tables
 */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Maximum items to fetch per request
 */
export const MAX_FETCH_LIMIT = 1000;

/**
 * Minimum characters required before triggering search
 */
export const MIN_SEARCH_CHARS = 2;

// ============================================================================
// UI Constants
// ============================================================================

/**
 * Delay before showing loading spinner (prevents flash)
 */
export const LOADING_DELAY_MS = 200;

/**
 * Animation duration for transitions
 */
export const ANIMATION_DURATION_MS = 300;
