/**
 * StatusBadge - Consistent status indicators
 *
 * Provides visual status indicators for:
 * - Item status (Available, Checked Out, Lost, etc.)
 * - Hold status (Pending, Available, In Transit, etc.)
 * - Patron status (Active, Barred, Expired, etc.)
 * - Order status (Pending, On Order, Received, etc.)
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Truck,
  Package,
  BookOpen,
  Ban,
  HelpCircle,
  Loader2,
} from "lucide-react";

export type StatusType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "pending"
  | "neutral"
  | "muted";

export interface StatusBadgeProps {
  /** Status text to display */
  label: string;
  /** Status type determines color */
  status?: StatusType;
  /** Show icon */
  showIcon?: boolean;
  /** Custom icon */
  icon?: React.ComponentType<{ className?: string }>;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Pulsing animation (for active states) */
  pulse?: boolean;
  /** Custom className */
  className?: string;
}

const statusConfig: Record<
  StatusType,
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  success: {
    icon: CheckCircle,
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  },
  error: {
    icon: XCircle,
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  },
  warning: {
    icon: AlertTriangle,
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  },
  info: {
    icon: BookOpen,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  },
  pending: {
    icon: Clock,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  },
  neutral: {
    icon: HelpCircle,
    className: "bg-muted/50 text-foreground dark:bg-foreground/90 dark:text-muted-foreground/50 border-border dark:border-foreground/30",
  },
  muted: {
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
  },
};

const sizeClasses = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
  lg: "text-sm px-2.5 py-1",
};

const iconSizeClasses = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

/**
 * StatusBadge component
 *
 * @example
 * ```tsx
 * <StatusBadge label="Available" status="success" />
 * <StatusBadge label="Checked Out" status="info" showIcon />
 * <StatusBadge label="Overdue" status="error" pulse />
 * ```
 */
export function StatusBadge({
  label,
  status = "neutral",
  showIcon = false,
  icon: CustomIcon,
  size = "md",
  pulse = false,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = CustomIcon || config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full border",
        config.className,
        sizeClasses[size],
        pulse && "animate-pulse",
        className
      )}
    >
      {showIcon && <Icon className={iconSizeClasses[size]} />}
      {label}
    </span>
  );
}

// ============================================================================
// Pre-configured status badges for library entities
// ============================================================================

/**
 * Item/Copy status badge
 */
export function ItemStatusBadge({
  statusId,
  statusName,
  className,
}: {
  statusId: number;
  statusName?: string;
  className?: string;
}) {
  const statusMap: Record<number, { label: string; status: StatusType; icon?: React.ComponentType<{ className?: string }> }> = {
    0: { label: "Available", status: "success", icon: CheckCircle },
    1: { label: "Checked Out", status: "info", icon: BookOpen },
    2: { label: "Bindery", status: "muted" },
    3: { label: "Lost", status: "error", icon: XCircle },
    4: { label: "Missing", status: "warning", icon: AlertTriangle },
    5: { label: "In Process", status: "pending", icon: Loader2 },
    6: { label: "In Transit", status: "info", icon: Truck },
    7: { label: "Reshelving", status: "success" },
    8: { label: "On Holds Shelf", status: "info", icon: Package },
    9: { label: "On Order", status: "pending" },
    10: { label: "ILL", status: "info" },
    11: { label: "Cataloging", status: "pending" },
    12: { label: "Reserves", status: "info" },
    13: { label: "Discard/Weed", status: "muted" },
    14: { label: "Damaged", status: "error", icon: AlertTriangle },
  };

  const config = statusMap[statusId] || { label: statusName || `Status ${statusId}`, status: "neutral" as StatusType };

  return (
    <StatusBadge
      label={config.label}
      status={config.status}
      icon={config.icon}
      showIcon={!!config.icon}
      className={className}
    />
  );
}

/**
 * Hold status badge
 */
export function HoldStatusBadge({
  status,
  className,
}: {
  status: "pending" | "available" | "in_transit" | "captured" | "cancelled" | "fulfilled" | "suspended";
  className?: string;
}) {
  const statusMap: Record<string, { label: string; status: StatusType; icon?: React.ComponentType<{ className?: string }> }> = {
    pending: { label: "Pending", status: "pending", icon: Clock },
    available: { label: "Available for Pickup", status: "success", icon: Package },
    in_transit: { label: "In Transit", status: "info", icon: Truck },
    captured: { label: "Captured", status: "info" },
    cancelled: { label: "Cancelled", status: "muted", icon: XCircle },
    fulfilled: { label: "Fulfilled", status: "success", icon: CheckCircle },
    suspended: { label: "Suspended", status: "warning", icon: Clock },
  };

  const config = statusMap[status] || { label: status, status: "neutral" as StatusType };

  return (
    <StatusBadge
      label={config.label}
      status={config.status}
      icon={config.icon}
      showIcon={!!config.icon}
      className={className}
    />
  );
}

/**
 * Patron status badge
 */
export function PatronStatusBadge({
  active,
  barred,
  expired,
  className,
}: {
  active: boolean;
  barred?: boolean;
  expired?: boolean;
  className?: string;
}) {
  if (barred) {
    return (
      <StatusBadge
        label="Barred"
        status="error"
        icon={Ban}
        showIcon
        className={className}
      />
    );
  }

  if (expired) {
    return (
      <StatusBadge
        label="Expired"
        status="warning"
        icon={AlertTriangle}
        showIcon
        className={className}
      />
    );
  }

  if (!active) {
    return (
      <StatusBadge
        label="Inactive"
        status="muted"
        className={className}
      />
    );
  }

  return (
    <StatusBadge
      label="Active"
      status="success"
      icon={CheckCircle}
      showIcon
      className={className}
    />
  );
}

/**
 * Circulation status badge (for checkouts)
 */
export function CirculationStatusBadge({
  isOverdue,
  isLost,
  isClaimsReturned,
  daysOverdue,
  className,
}: {
  isOverdue?: boolean;
  isLost?: boolean;
  isClaimsReturned?: boolean;
  daysOverdue?: number;
  className?: string;
}) {
  if (isLost) {
    return (
      <StatusBadge
        label="Lost"
        status="error"
        icon={XCircle}
        showIcon
        className={className}
      />
    );
  }

  if (isClaimsReturned) {
    return (
      <StatusBadge
        label="Claims Returned"
        status="warning"
        icon={AlertTriangle}
        showIcon
        className={className}
      />
    );
  }

  if (isOverdue) {
    const label = daysOverdue ? `${daysOverdue}d overdue` : "Overdue";
    return (
      <StatusBadge
        label={label}
        status="error"
        icon={Clock}
        showIcon
        pulse
        className={className}
      />
    );
  }

  return (
    <StatusBadge
      label="Active"
      status="success"
      className={className}
    />
  );
}

/**
 * Order/Acquisition status badge
 */
export function OrderStatusBadge({
  status,
  className,
}: {
  status: "pending" | "on-order" | "received" | "cancelled" | "delayed";
  className?: string;
}) {
  const statusMap: Record<string, { label: string; status: StatusType }> = {
    pending: { label: "Pending", status: "pending" },
    "on-order": { label: "On Order", status: "info" },
    received: { label: "Received", status: "success" },
    cancelled: { label: "Cancelled", status: "muted" },
    delayed: { label: "Delayed", status: "warning" },
  };

  const config = statusMap[status] || { label: status, status: "neutral" as StatusType };

  return (
    <StatusBadge
      label={config.label}
      status={config.status}
      className={className}
    />
  );
}

export default StatusBadge;
