/**
 * PageHeader - Consistent page header with title, breadcrumbs, and actions
 *
 * Provides:
 * - Consistent typography and spacing
 * - Optional breadcrumb navigation
 * - Action buttons slot
 * - Keyboard shortcut hints
 * - Responsive design
 *
 * @see https://www.geeksforgeeks.org/reactjs/react-architecture-pattern-and-best-practices/
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { formatShortcut, KeyboardShortcut } from "@/hooks";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageAction {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  shortcut?: Pick<KeyboardShortcut, "key" | "ctrl" | "shift" | "alt">;
  disabled?: boolean;
  loading?: boolean;
}

export interface PageHeaderProps {
  /** Page title */
  title: string | React.ReactNode;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Breadcrumb trail */
  breadcrumbs?: BreadcrumbItem[];
  /** Action buttons */
  actions?: PageAction[];
  /** Additional content below title */
  children?: React.ReactNode;
  /** Custom className */
  className?: string;
  /** Show home icon in breadcrumbs */
  showHomeIcon?: boolean;
}

/**
 * PageHeader component for consistent page layouts
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Check Out"
 *   subtitle="Scan patron and item barcodes"
 *   breadcrumbs={[
 *     { label: "Circulation" },
 *     { label: "Check Out" }
 *   ]}
 *   actions={[
 *     {
 *       label: "Quick Checkout",
 *       onClick: () => setQuickMode(true),
 *       icon: Zap,
 *       shortcut: { key: "q", ctrl: true }
 *     }
 *   ]}
 * />
 * ```
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  children,
  className,
  showHomeIcon = true,
}: PageHeaderProps) {
  return (
    <div className={cn("border-b bg-background", className)}>
      <div className="px-4 py-3 sm:px-6">
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            className="flex items-center gap-1 text-sm text-muted-foreground mb-2"
            aria-label="Breadcrumb"
          >
            {showHomeIcon && (
              <>
                <Link
                  href="/staff"
                  className="hover:text-foreground transition-colors"
                  aria-label="Home"
                >
                  <Home className="h-4 w-4" />
                </Link>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.href || crumb.label || index}>
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      index === breadcrumbs.length - 1
                        ? "text-foreground font-medium"
                        : ""
                    )}
                    aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
                {index < breadcrumbs.length - 1 && (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>

          {/* Actions */}
          {actions && actions.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {actions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.label || index}
                    variant={action.variant || "default"}
                    onClick={action.onClick}
                    disabled={action.disabled || action.loading}
                    className="gap-2"
                  >
                    {action.loading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : Icon ? (
                      <Icon className="h-4 w-4" />
                    ) : null}
                    <span>{action.label}</span>
                    {action.shortcut && (
                      <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                        {formatShortcut(action.shortcut)}
                      </kbd>
                    )}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* Optional children content */}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}

/**
 * PageContent wrapper for consistent content padding
 */
export function PageContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 overflow-auto p-4 sm:p-6", className)}>
      {children}
    </div>
  );
}

/**
 * PageContainer for full page layout
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("h-full flex flex-col", className)}>{children}</div>
  );
}

export default PageHeader;
