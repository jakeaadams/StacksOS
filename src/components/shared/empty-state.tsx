/**
 * EmptyState - Consistent "no data" displays
 *
 * Provides:
 * - User-friendly empty states
 * - Call-to-action buttons
 * - Contextual icons and messaging
 * - Accessible descriptions
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Package,
  Search,
  Users,
  BookOpen,
  FileText,
  ShoppingCart,
  Calendar,
  Bell,
  Inbox,
  FolderOpen,
  Plus,
} from "lucide-react";

export interface EmptyStateProps {
  /** Title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Icon to display */
  icon?: React.ComponentType<{ className?: string }>;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Primary action */
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ComponentType<{ className?: string }>;
  };
  /** Secondary action */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Custom className */
  className?: string;
  /** Children for custom content */
  children?: React.ReactNode;
}

/**
 * Generic empty state component
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={Users}
 *   title="No patrons found"
 *   description="Try adjusting your search terms"
 *   action={{
 *     label: "Register New Patron",
 *     onClick: () => router.push('/staff/patrons/register'),
 *     icon: Plus
 *   }}
 * />
 * ```
 */
export function EmptyState({
  title = "No results found",
  description,
  icon: Icon = Inbox,
  size = "md",
  action,
  secondaryAction,
  className,
  children,
}: EmptyStateProps) {
  const sizeClasses = {
    sm: {
      container: "p-4 gap-2",
      icon: "h-8 w-8",
      title: "text-sm",
      description: "text-xs",
    },
    md: {
      container: "p-8 gap-3",
      icon: "h-12 w-12",
      title: "text-base",
      description: "text-sm",
    },
    lg: {
      container: "p-12 gap-4",
      icon: "h-16 w-16",
      title: "text-lg",
      description: "text-base",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizes.container,
        className
      )}
      role="status"
    >
      <div className="rounded-full bg-muted p-4">
        <Icon className={cn("text-muted-foreground", sizes.icon)} />
      </div>

      <div className="space-y-1">
        <h3 className={cn("font-medium", sizes.title)}>{title}</h3>
        {description && (
          <p className={cn("text-muted-foreground max-w-md", sizes.description)}>
            {description}
          </p>
        )}
      </div>

      {(action || secondaryAction || children) && (
        <div className="flex items-center gap-3 mt-4">
          {action && (
            <Button onClick={action.onClick}>
              {action.icon && <action.icon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Pre-configured Empty States for common scenarios
// ============================================================================

/**
 * Empty state for search results
 */
export function SearchEmptyState({
  searchTerm,
  onClear,
  className,
}: {
  searchTerm?: string;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={
        searchTerm
          ? `No results match "${searchTerm}". Try different keywords.`
          : "Enter a search term to find results."
      }
      action={
        onClear && searchTerm
          ? { label: "Clear Search", onClick: onClear }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Empty state for patron lists
 */
export function PatronsEmptyState({
  onRegister,
  className,
}: {
  onRegister?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={Users}
      title="No patrons found"
      description="Search for a patron by name or barcode, or register a new patron."
      action={
        onRegister
          ? { label: "Register Patron", onClick: onRegister, icon: Plus }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Empty state for item/catalog lists
 */
export function ItemsEmptyState({
  onCreate,
  className,
}: {
  onCreate?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={BookOpen}
      title="No items found"
      description="Search the catalog or scan an item barcode."
      action={
        onCreate
          ? { label: "Create Record", onClick: onCreate, icon: Plus }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Empty state for checkouts
 */
export function CheckoutsEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={Package}
      title="No checkouts"
      description="This patron has no items currently checked out."
      className={className}
    />
  );
}

/**
 * Empty state for holds
 */
export function HoldsEmptyState({
  onPlaceHold,
  className,
}: {
  onPlaceHold?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={BookOpen}
      title="No holds"
      description="There are no holds to display."
      action={
        onPlaceHold
          ? { label: "Place Hold", onClick: onPlaceHold, icon: Plus }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Empty state for bills/fines
 */
export function BillsEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={FileText}
      title="No bills"
      description="This patron has no outstanding bills or fines."
      className={className}
    />
  );
}

/**
 * Empty state for orders
 */
export function OrdersEmptyState({
  onCreate,
  className,
}: {
  onCreate?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={ShoppingCart}
      title="No orders"
      description="Create a purchase order to get started."
      action={
        onCreate
          ? { label: "Create Order", onClick: onCreate, icon: Plus }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Empty state for reservations/bookings
 */
export function ReservationsEmptyState({
  onBook,
  className,
}: {
  onBook?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={Calendar}
      title="No reservations"
      description="There are no upcoming reservations."
      action={
        onBook
          ? { label: "Make Reservation", onClick: onBook, icon: Plus }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Empty state for notifications/alerts
 */
export function NotificationsEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={Bell}
      title="No notifications"
      description="You're all caught up!"
      size="sm"
      className={className}
    />
  );
}

/**
 * Empty state for a folder/bucket
 */
export function FolderEmptyState({
  folderName,
  onAdd,
  className,
}: {
  folderName?: string;
  onAdd?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={FolderOpen}
      title={folderName ? `${folderName} is empty` : "Empty folder"}
      description="Add items to this folder to get started."
      action={
        onAdd ? { label: "Add Items", onClick: onAdd, icon: Plus } : undefined
      }
      className={className}
    />
  );
}

export default EmptyState;
