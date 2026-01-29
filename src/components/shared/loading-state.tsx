/**
 * LoadingState - Consistent loading indicators and skeletons
 *
 * Following React 19 best practices for Suspense-compatible loading states.
 * Uses skeleton patterns for better perceived performance.
 *
 * @see https://birdeatsbug.com/blog/implementing-skeleton-screen-in-react-with-react-loading-skeleton-and-suspense
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

export interface LoadingStateProps {
  /** Loading message */
  message?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom className */
  className?: string;
}

/**
 * Spinner-based loading indicator
 *
 * @example
 * ```tsx
 * {isLoading && <LoadingSpinner message="Loading patrons..." />}
 * ```
 */
export function LoadingSpinner({
  message,
  size = "md",
  className,
}: LoadingStateProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-8",
        className
      )}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2 className={cn("animate-spin text-muted-foreground", sizeClasses[size])} />
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
      <span className="sr-only">{message || "Loading..."}</span>
    </div>
  );
}

/**
 * Full page loading overlay
 */
export function LoadingOverlay({
  message = "Loading...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50",
        className
      )}
      role="status"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}

/**
 * Inline loading indicator (for buttons, inputs)
 */
export function LoadingInline({
  message,
  className,
}: LoadingStateProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {message && <span className="text-sm">{message}</span>}
    </span>
  );
}

// ============================================================================
// Skeleton Components
// ============================================================================

/**
 * Table skeleton for data tables
 */
export interface TableSkeletonProps {
  /** Number of rows to show */
  rows?: number;
  /** Number of columns */
  columns?: number;
  /** Show header row */
  showHeader?: boolean;
  /** Custom className */
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("w-full", className)} role="status" aria-busy="true">
      {/* Header */}
      {showHeader && (
        <div className="flex gap-4 p-3 border-b bg-muted/50">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`skeleton-${i}`} className="h-4 flex-1" />
          ))}
        </div>
      )}

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 p-3 border-b last:border-0"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-4 flex-1",
                colIndex === 0 && "max-w-[200px]" // First column often shorter
              )}
            />
          ))}
        </div>
      ))}

      <span className="sr-only">Loading table data...</span>
    </div>
  );
}

/**
 * Card skeleton for card-based layouts
 */
export interface CardSkeletonProps {
  /** Show avatar/icon */
  showAvatar?: boolean;
  /** Number of text lines */
  lines?: number;
  /** Custom className */
  className?: string;
}

export function CardSkeleton({
  showAvatar = true,
  lines = 3,
  className,
}: CardSkeletonProps) {
  return (
    <div
      className={cn(
        "flex gap-4 p-4 rounded-lg border bg-card",
        className
      )}
      role="status"
      aria-busy="true"
    >
      {showAvatar && (
        <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
      )}
      <div className="flex-1 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={`skeleton-${i}`}
            className={cn(
              "h-4",
              i === 0 && "w-3/4", // Title shorter
              i > 0 && "w-full"
            )}
          />
        ))}
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * List skeleton for list items
 */
export function ListSkeleton({
  items = 5,
  className,
}: {
  items?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-busy="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={`skeleton-${i}`} className="flex items-center gap-3 p-2">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading list...</span>
    </div>
  );
}

/**
 * Form skeleton for form layouts
 */
export function FormSkeleton({
  fields = 4,
  className,
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)} role="status" aria-busy="true">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={`skeleton-${i}`} className="space-y-2">
          <Skeleton className="h-4 w-24" /> {/* Label */}
          <Skeleton className="h-10 w-full" /> {/* Input */}
        </div>
      ))}
      <Skeleton className="h-10 w-32" /> {/* Submit button */}
      <span className="sr-only">Loading form...</span>
    </div>
  );
}

/**
 * Stats/dashboard skeleton
 */
export function StatsSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
      role="status"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={`skeleton-${i}`} className="p-6 rounded-lg border bg-card">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
      <span className="sr-only">Loading statistics...</span>
    </div>
  );
}

/**
 * Page skeleton - full page loading state
 */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("h-full flex flex-col", className)} role="status" aria-busy="true">
      {/* Header */}
      <div className="border-b p-4">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-8 w-64" />
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        <StatsSkeleton className="mb-6" />
        <TableSkeleton />
      </div>

      <span className="sr-only">Loading page...</span>
    </div>
  );
}

export default LoadingSpinner;
