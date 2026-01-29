/**
 * Shared Components
 *
 * This module exports all shared, reusable UI components.
 * Import from "@/components/shared" for consistent usage across the application.
 *
 * Architecture based on:
 * - shadcn/ui patterns: https://ui.shadcn.com/
 * - TanStack Table best practices: https://tanstack.com/table/latest
 * - React Aria accessibility: https://react-spectrum.adobe.com/react-aria/
 * - Component library patterns: https://www.geeksforgeeks.org/reactjs/react-architecture-pattern-and-best-practices/
 */

// ============================================================================
// Layout Components
// ============================================================================

export { PageHeader, PageContent, PageContainer } from "./page-header";
export type { BreadcrumbItem, PageAction, PageHeaderProps } from "./page-header";

// ============================================================================
// Data Display
// ============================================================================

export { DataTable, DataTableColumnHeader, DataTablePagination, getSelectColumn } from "./data-table";
export type { DataTableProps } from "./data-table";

// ============================================================================
// Loading States
// ============================================================================

export {
  LoadingSpinner,
  LoadingOverlay,
  LoadingInline,
  TableSkeleton,
  CardSkeleton,
  ListSkeleton,
  FormSkeleton,
  StatsSkeleton,
  PageSkeleton,
} from "./loading-state";
export type { LoadingStateProps, TableSkeletonProps, CardSkeletonProps } from "./loading-state";

// ============================================================================
// Error Handling
// ============================================================================

export {
  ErrorMessage,
  ErrorState,
  ErrorCard,
  ErrorBoundary,
} from "./error-state";
export type { ErrorStateProps } from "./error-state";

// ============================================================================
// Empty States
// ============================================================================

export {
  EmptyState,
  SearchEmptyState,
  PatronsEmptyState,
  ItemsEmptyState,
  CheckoutsEmptyState,
  HoldsEmptyState,
  BillsEmptyState,
  OrdersEmptyState,
  ReservationsEmptyState,
  NotificationsEmptyState,
  FolderEmptyState,
} from "./empty-state";
export type { EmptyStateProps } from "./empty-state";

// ============================================================================
// Status Indicators
// ============================================================================

export {
  StatusBadge,
  ItemStatusBadge,
  HoldStatusBadge,
  PatronStatusBadge,
  CirculationStatusBadge,
  OrderStatusBadge,
} from "./status-badge";
export type { StatusType, StatusBadgeProps } from "./status-badge";

// ============================================================================
// Input Components
// ============================================================================

export { BarcodeInput, DualBarcodeInput } from "./barcode-input";
export type { BarcodeInputProps, DualBarcodeInputProps } from "./barcode-input";

// ============================================================================
// Form Components (React Hook Form + Zod)
// ============================================================================

export {
  FormBuilder,
  useZodForm,
  formSchemas,
  SearchForm,
  ValidatedInput,
  PasswordInput,
} from "./form-components";
export type {
  FormFieldConfig,
  FormProps,
  PatronRegistrationForm,
  PatronUpdateForm,
  HoldPlacementForm,
  BillPaymentForm,
  ItemCreationForm,
  VendorCreationForm,
  SearchForm as SearchFormType,
  LoginForm,
} from "./form-components";

// ============================================================================
// Dialogs
// ============================================================================

export {
  ConfirmDialog,
  DeleteConfirmDialog,
  CancelConfirmDialog,
  SaveConfirmDialog,
  OverrideConfirmDialog,
} from "./confirm-dialog";
export type { ConfirmDialogProps } from "./confirm-dialog";

// ============================================================================
// Feature Components
// ============================================================================

export { PatronCard, PatronSearchResult } from "./patron-card";
export type { PatronCardProps } from "./patron-card";

export { ItemCard, ItemSearchResult } from "./item-card";
export type { ItemCardProps } from "./item-card";

// ============================================================================
// Permission UX
// ============================================================================

export { PermissionDeniedState } from "./permission-denied";
export type { PermissionDeniedStateProps } from "./permission-denied";

// ============================================================================
// Workflow Dialogs
// ============================================================================

export { PlaceHoldDialog } from "./place-hold-dialog";
export type { PlaceHoldDialogProps, PlaceHoldRecord } from "./place-hold-dialog";

export { MarcDiff } from "./marc-diff";
export type { MarcDiffProps } from "./marc-diff";

export { UniversalSearch } from "./universal-search";
export { SetupRequired, SETUP_CONFIGS } from "./setup-required";
export { PatronCockpit } from "./patron-cockpit";
export { RecordCockpit } from "./record-cockpit";

// ============================================================================
// Status & Feedback Components
// ============================================================================

export { KeyboardShortcutsOverlay } from "./keyboard-shortcuts-overlay";
export { DensityToggle, useDensity } from "./density-toggle";
export type { DensityMode } from "./density-toggle";

// Table Row Actions
export { TableRowActions, createPatronActions, createItemActions, createHoldActions } from "./table-row-actions";
export type { TableRowActionsProps, RowAction } from "./table-row-actions";

export { CoverArtPicker } from './cover-art-picker';
export type { CoverArtPickerProps } from './cover-art-picker';

export { PatronPhotoUpload } from './patron-photo-upload';

export { InlineEdit } from './inline-edit';
