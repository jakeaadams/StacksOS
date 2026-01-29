/**
 * ItemCard - Consistent item/copy information display
 *
 * Used across circulation, cataloging, and holds pages.
 * Shows item details, status, and circulation info.
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ItemStatusBadge } from "./status-badge";
import type { ItemSummary, ItemFull } from "@/hooks";
import {
  BookOpen,
  Barcode,
  MapPin,
  User,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronRight,
  X,
  DollarSign,
} from "lucide-react";

export interface ItemCardProps {
  /** Item data */
  item: ItemSummary | ItemFull;
  /** Card variant */
  variant?: "compact" | "default" | "detailed";
  /** Show action buttons */
  showActions?: boolean;
  /** On view details click */
  onViewDetails?: () => void;
  /** On clear/remove click */
  onClear?: () => void;
  /** Highlight for active selection */
  isActive?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * ItemCard component
 *
 * @example
 * ```tsx
 * <ItemCard
 *   item={scannedItem}
 *   variant="default"
 *   showActions
 *   onViewDetails={() => router.push(`/staff/catalog/item-status?barcode=${item.barcode}`)}
 *   onClear={() => setScannedItem(null)}
 * />
 * ```
 */
export function ItemCard({
  item,
  variant = "default",
  showActions = false,
  onViewDetails,
  onClear,
  isActive = false,
  className,
}: ItemCardProps) {
  // Compact variant - single line
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border bg-card",
          isActive && "ring-2 ring-primary",
          className
        )}
      >
        <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded bg-muted">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{item.title}</span>
            <ItemStatusBadge statusId={item.status.id} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{item.barcode}</span>
            <span>•</span>
            <span>{item.callNumber}</span>
          </div>
        </div>

        {onClear && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClear} title="Clear item">
            <X className="h-4 w-4" />
            <span className="sr-only">Clear item</span>
          </Button>
        )}
      </div>
    );
  }

  // Default variant
  if (variant === "default") {
    const fullItem = item as ItemFull;

    return (
      <Card className={cn(isActive && "ring-2 ring-primary", className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-lg bg-muted">
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold leading-tight">{item.title}</h3>
                  {item.author && (
                    <p className="text-sm text-muted-foreground">{item.author}</p>
                  )}
                </div>
                <ItemStatusBadge statusId={item.status.id} />
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Barcode className="h-3.5 w-3.5" />
                  <span className="font-mono">{item.barcode}</span>
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  {item.callNumber}
                </span>
                {item.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {item.location}
                  </span>
                )}
              </div>

              {/* Current circulation info */}
              {fullItem.currentCirculation && (
                <div className="flex items-center gap-4 text-sm pt-2 border-t mt-2">
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {fullItem.currentCirculation.patronName || fullItem.currentCirculation.patronBarcode}
                  </span>
                  <span className={cn(
                    "flex items-center gap-1",
                    fullItem.currentCirculation.isOverdue && "text-destructive"
                  )}>
                    <Calendar className="h-3.5 w-3.5" />
                    Due: {new Date(fullItem.currentCirculation.dueDate).toLocaleDateString()}
                  </span>
                  {fullItem.currentCirculation.isOverdue && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Overdue
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            {showActions && (
              <div className="flex items-center gap-2">
                {onViewDetails && (
                  <Button variant="ghost" size="sm" onClick={onViewDetails}>
                    View
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
                {onClear && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClear} title="Clear">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Clear</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Detailed variant - full information
  const fullItem = item as ItemFull;

  return (
    <Card className={cn(isActive && "ring-2 ring-primary", className)}>
      <CardContent className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 flex items-center justify-center w-20 h-20 rounded-lg bg-muted">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">{item.title}</h2>
                {item.author && (
                  <p className="text-muted-foreground">{item.author}</p>
                )}
              </div>
              {showActions && onClear && (
                <Button variant="ghost" size="sm" onClick={onClear}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <ItemStatusBadge statusId={item.status.id} />
              {!item.circulate && <Badge variant="outline">Non-Circulating</Badge>}
              {item.refItem && <Badge variant="outline">Reference</Badge>}
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <Barcode className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Barcode:</span>
            <span className="font-mono">{item.barcode}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Call Number:</span>
            <span>{item.callNumber}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Location:</span>
            <span>{item.location || "Unknown"}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Library:</span>
            <span>{item.circulationLibrary || item.owningLibrary || "Unknown"}</span>
          </div>

          {item.price && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Price:</span>
              <span>${item.price.toFixed(2)}</span>
            </div>
          )}

          {fullItem.isbn && (
            <div className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">ISBN:</span>
              <span>{fullItem.isbn}</span>
            </div>
          )}
        </div>

        {/* Current circulation */}
        {fullItem.currentCirculation && (
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Currently Checked Out
            </h4>
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {fullItem.currentCirculation.patronName || fullItem.currentCirculation.patronBarcode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  Checked out: {new Date(fullItem.currentCirculation.checkoutDate).toLocaleDateString()}
                </span>
              </div>
              <div className={cn(
                "flex items-center gap-2",
                fullItem.currentCirculation.isOverdue && "text-destructive font-medium"
              )}>
                <Clock className="h-3.5 w-3.5" />
                <span>
                  Due: {new Date(fullItem.currentCirculation.dueDate).toLocaleDateString()}
                </span>
                {fullItem.currentCirculation.isOverdue && (
                  <Badge variant="destructive" className="ml-2">Overdue</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Renewals remaining:</span>
                <span>{fullItem.currentCirculation.renewals}</span>
              </div>
            </div>
          </div>
        )}

        {/* Alerts */}
        {fullItem.alerts && fullItem.alerts.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Alerts
            </h4>
            {fullItem.alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
              >
                <span className="font-medium">{alert.type}:</span> {alert.message}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {showActions && onViewDetails && (
          <div className="pt-2 border-t">
            <Button onClick={onViewDetails} className="w-full sm:w-auto">
              View Full Record
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Item search result item
 */
export function ItemSearchResult({
  item,
  onClick,
  isSelected,
}: {
  item: ItemSummary;
  onClick: () => void;
  isSelected?: boolean;
}) {
  return (
    <button type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left rounded-lg border transition-colors",
        "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary",
        isSelected && "bg-primary/5 border-primary"
      )}
    >
      <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded bg-muted">
        <BookOpen className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.title}</span>
          <ItemStatusBadge statusId={item.status.id} />
        </div>
        <div className="text-sm text-muted-foreground truncate">
          {item.author && <span>{item.author} • </span>}
          <span className="font-mono">{item.barcode}</span>
          <span> • {item.callNumber}</span>
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

export default ItemCard;
