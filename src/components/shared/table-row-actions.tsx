/**
 * TableRowActions - Hover menu for quick actions on table rows
 * World-class UX: Inline actions without modal dialogs
 */

"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  ExternalLink,
  Printer,
  Mail,
  CreditCard,
  Bookmark,
  RefreshCw,
  Ban,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RowAction {
  id: string;
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  variant?: "default" | "destructive" | "warning";
  disabled?: boolean;
  hidden?: boolean;
  onClick: () => void | Promise<void>;
}

export interface TableRowActionsProps {
  actions: RowAction[];
  quickActions?: string[]; // IDs of actions to show as icon buttons
  align?: "start" | "center" | "end";
  className?: string;
}

const VARIANT_STYLES = {
  default: "",
  destructive: "text-red-600 focus:text-red-600",
  warning: "text-amber-600 focus:text-amber-600",
};

export function TableRowActions({
  actions,
  quickActions = [],
  align = "end",
  className,
}: TableRowActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleAction = useCallback(async (action: RowAction) => {
    if (action.disabled) return;
    
    setIsLoading(action.id);
    try {
      await action.onClick();
    } finally {
      setIsLoading(null);
    }
  }, []);

  const visibleActions = actions.filter(a => !a.hidden);
  const quickActionItems = visibleActions.filter(a => quickActions.includes(a.id));
  const menuActionItems = visibleActions.filter(a => !quickActions.includes(a.id));

  if (visibleActions.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Quick action buttons */}
      {quickActionItems.map((action) => {
        const Icon = action.icon;
        const loading = isLoading === action.id;
        
        return (
          <Tooltip key={action.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0",
                  VARIANT_STYLES[action.variant || "default"]
                )}
                disabled={action.disabled || loading}
                onClick={() => handleAction(action)}
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : Icon ? (
                  <Icon className="h-4 w-4" />
                ) : (
                  <span className="text-xs">{action.label[0]}</span>
                )}
                <span className="sr-only">{action.label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{action.label}</p>
              {action.shortcut && (
                <kbd className="ml-2 text-[10px] bg-muted px-1 rounded">{action.shortcut}</kbd>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/* More actions dropdown */}
      {menuActionItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align}>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {menuActionItems.map((action, index) => {
              const Icon = action.icon;
              const loading = isLoading === action.id;
              
              // Add separator before destructive actions
              const prevAction = menuActionItems[index - 1];
              const showSeparator = action.variant === "destructive" && 
                prevAction?.variant !== "destructive";
              
              return (
                <div key={action.id}>
                  {showSeparator && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={() => handleAction(action)}
                    disabled={action.disabled || loading}
                    className={cn(VARIANT_STYLES[action.variant || "default"])}
                  >
                    {loading ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : Icon ? (
                      <Icon className="mr-2 h-4 w-4" />
                    ) : null}
                    {action.label}
                    {action.shortcut && (
                      <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>
                    )}
                  </DropdownMenuItem>
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// Preset action builders for common patterns
export const createPatronActions = (
  patronId: number | string,
  handlers: {
    onView?: () => void;
    onEdit?: () => void;
    onCheckout?: () => void;
    onPlaceHold?: () => void;
    onViewBills?: () => void;
    onEmail?: () => void;
    onPrint?: () => void;
    onBlock?: () => void;
  }
): RowAction[] => [
  { id: "view", label: "View Profile", icon: Eye, onClick: handlers.onView || (() => {}) },
  { id: "edit", label: "Edit Patron", icon: Edit, onClick: handlers.onEdit || (() => {}) },
  { id: "checkout", label: "Check Out Items", icon: ExternalLink, onClick: handlers.onCheckout || (() => {}) },
  { id: "hold", label: "Place Hold", icon: Bookmark, onClick: handlers.onPlaceHold || (() => {}) },
  { id: "bills", label: "View Bills", icon: CreditCard, onClick: handlers.onViewBills || (() => {}) },
  { id: "email", label: "Send Email", icon: Mail, onClick: handlers.onEmail || (() => {}) },
  { id: "print", label: "Print Card", icon: Printer, onClick: handlers.onPrint || (() => {}) },
  { id: "block", label: "Block Patron", icon: Ban, variant: "destructive", onClick: handlers.onBlock || (() => {}) },
];

export const createItemActions = (
  itemId: number | string,
  handlers: {
    onView?: () => void;
    onEdit?: () => void;
    onCheckin?: () => void;
    onRenew?: () => void;
    onPlaceHold?: () => void;
    onMarkLost?: () => void;
    onMarkDamaged?: () => void;
    onDelete?: () => void;
  }
): RowAction[] => [
  { id: "view", label: "View Item", icon: Eye, onClick: handlers.onView || (() => {}) },
  { id: "edit", label: "Edit Item", icon: Edit, onClick: handlers.onEdit || (() => {}) },
  { id: "checkin", label: "Check In", icon: CheckCircle2, onClick: handlers.onCheckin || (() => {}) },
  { id: "renew", label: "Renew", icon: RefreshCw, onClick: handlers.onRenew || (() => {}) },
  { id: "hold", label: "Place Hold", icon: Bookmark, onClick: handlers.onPlaceHold || (() => {}) },
  { id: "lost", label: "Mark Lost", icon: AlertTriangle, variant: "warning", onClick: handlers.onMarkLost || (() => {}) },
  { id: "damaged", label: "Mark Damaged", icon: AlertTriangle, variant: "warning", onClick: handlers.onMarkDamaged || (() => {}) },
  { id: "delete", label: "Delete Item", icon: Trash2, variant: "destructive", onClick: handlers.onDelete || (() => {}) },
];

export const createHoldActions = (
  holdId: number | string,
  handlers: {
    onView?: () => void;
    onModify?: () => void;
    onSuspend?: () => void;
    onActivate?: () => void;
    onCancel?: () => void;
  }
): RowAction[] => [
  { id: "view", label: "View Details", icon: Eye, onClick: handlers.onView || (() => {}) },
  { id: "modify", label: "Modify Hold", icon: Edit, onClick: handlers.onModify || (() => {}) },
  { id: "suspend", label: "Suspend Hold", icon: Ban, onClick: handlers.onSuspend || (() => {}) },
  { id: "activate", label: "Activate Hold", icon: CheckCircle2, onClick: handlers.onActivate || (() => {}) },
  { id: "cancel", label: "Cancel Hold", icon: Trash2, variant: "destructive", onClick: handlers.onCancel || (() => {}) },
];

