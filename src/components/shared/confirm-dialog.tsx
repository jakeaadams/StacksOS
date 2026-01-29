/**
 * ConfirmDialog - Consistent confirmation modals
 *
 * Features:
 * - Accessible (focus trap, ARIA)
 * - Keyboard support (Escape to close)
 * - Loading state for async actions
 * - Danger variant for destructive actions
 * - Customizable buttons
 */

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Info, CheckCircle, XCircle } from "lucide-react";

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Close handler */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Dialog description/message */
  description?: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Confirm callback */
  onConfirm?: () => void | Promise<void>;
  /** Cancel callback */
  onCancel?: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Variant determines styling */
  variant?: "default" | "danger" | "warning" | "success";
  /** Custom icon */
  icon?: React.ComponentType<{ className?: string }>;
  /** Additional content */
  children?: React.ReactNode;
  /** Disable confirm button */
  confirmDisabled?: boolean;
}

const variantConfig = {
  default: {
    icon: Info,
    iconClass: "text-primary",
    confirmVariant: "default" as const,
  },
  danger: {
    icon: XCircle,
    iconClass: "text-destructive",
    confirmVariant: "destructive" as const,
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-yellow-500",
    confirmVariant: "default" as const,
  },
  success: {
    icon: CheckCircle,
    iconClass: "text-green-500",
    confirmVariant: "default" as const,
  },
};

/**
 * ConfirmDialog component
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={showDeleteConfirm}
 *   onOpenChange={setShowDeleteConfirm}
 *   title="Delete Item?"
 *   description="This action cannot be undone."
 *   variant="danger"
 *   confirmText="Delete"
 *   onConfirm={handleDelete}
 *   isLoading={isDeleting}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isLoading = false,
  variant = "default",
  icon: CustomIcon,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];
  const Icon = CustomIcon || config.icon;

  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full",
                variant === "danger" && "bg-destructive/10",
                variant === "warning" && "bg-yellow-500/10",
                variant === "success" && "bg-green-500/10",
                variant === "default" && "bg-primary/10"
              )}
            >
              <Icon className={cn("h-5 w-5", config.iconClass)} />
            </div>
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-1">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {children && <div className="mt-4">{children}</div>}

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            autoFocus
          >
            {cancelText}
          </Button>
          <Button
            variant={config.confirmVariant}
            onClick={handleConfirm}
            disabled={isLoading || confirmDisabled}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Pre-configured dialogs for common actions
// ============================================================================

/**
 * Delete confirmation dialog
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${itemName}?`}
      description="This action cannot be undone. This will permanently delete the item."
      variant="danger"
      confirmText="Delete"
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}

/**
 * Cancel confirmation dialog
 */
export function CancelConfirmDialog({
  open,
  onOpenChange,
  actionName = "action",
  onConfirm,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionName?: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel ${actionName}?`}
      description="Any unsaved changes will be lost."
      variant="warning"
      confirmText="Yes, Cancel"
      cancelText="Go Back"
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}

/**
 * Save confirmation dialog
 */
export function SaveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onDiscard,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  onDiscard?: () => void;
  isLoading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Unsaved Changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes. Do you want to save them before leaving?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              onDiscard?.();
              onOpenChange(false);
            }}
            disabled={isLoading}
            autoFocus
          >
            Discard
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Checkout override dialog (for blocked patrons, etc.)
 */
export function OverrideConfirmDialog({
  open,
  onOpenChange,
  title,
  warnings,
  onOverride,
  onCancel,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  warnings: string[];
  onOverride: () => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      variant="warning"
      confirmText="Override"
      onConfirm={onOverride}
      onCancel={onCancel}
      isLoading={isLoading}
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          The following issues were detected:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {warnings.map((warning, index) => (
            <li key={warning || index} className="text-yellow-600 dark:text-yellow-500">
              {warning}
            </li>
          ))}
        </ul>
        <p className="text-sm font-medium mt-4">
          Do you want to override and proceed anyway?
        </p>
      </div>
    </ConfirmDialog>
  );
}

export default ConfirmDialog;
