/**
 * PatronCard - Consistent patron information display
 *
 * Used across checkout, checkin, patron management, and billing pages.
 * Shows patron details, status, and quick actions.
 */

"use client";

import * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PatronStatusBadge } from "./status-badge";
import { PatronPhotoUpload } from "./patron-photo-upload";
import type { PatronSummary, PatronFull } from "@/hooks";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  BookOpen,
  Clock,
  AlertTriangle,
  ChevronRight,
  X,
  Camera,
} from "lucide-react";

/**
 * Type guard to safely check if patron has PatronFull properties
 */
function isPatronFull(patron: PatronSummary | PatronFull): patron is PatronFull {
  return 'created' in patron && 'expires' in patron;
}

export interface PatronCardProps {
  /** Patron data */
  patron: PatronSummary | PatronFull;
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
 * PatronCard component
 *
 * @example
 * ```tsx
 * <PatronCard
 *   patron={selectedPatron}
 *   variant="default"
 *   showActions
 *   onViewDetails={() => router.push(`/staff/patrons/${patron.id}`)}
 *   onClear={() => setSelectedPatron(null)}
 * />
 * ```
 */
export function PatronCard({
  patron,
  variant = "default",
  showActions = false,
  onViewDetails,
  onClear,
  isActive = false,
  className,
}: PatronCardProps) {
  const initials = `${patron.firstName?.[0] || ""}${patron.lastName?.[0] || ""}`.toUpperCase() || "?";
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [patronPhotoUrl, setPatronPhotoUrl] = useState<string | undefined>(undefined);

  const handlePhotoClick = () => {
    setPhotoUploadOpen(true);
  };
  const handlePhotoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlePhotoClick();
    }
  };


  const handlePhotoUploaded = (url: string) => {
    setPatronPhotoUrl(url);
  };

  const handlePhotoError = () => {
    toast.error("Failed to load patron photo");
    // Clear invalid photo URL from state
    setPatronPhotoUrl(undefined);
  };

  // Compact variant - single line
  if (variant === "compact") {
    return (
      <>
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border bg-card",
          isActive && "ring-2 ring-primary",
          className
        )}
      >
        <div className="relative group cursor-pointer" onClick={handlePhotoClick} onKeyDown={handlePhotoKeyDown} role="button" aria-label="Upload patron photo" tabIndex={0} title="Click to upload photo">
          <Avatar className="h-8 w-8 transition-opacity group-hover:opacity-70">
            {patronPhotoUrl && (
              <AvatarImage
                src={patronPhotoUrl}
                alt={patron.displayName}
                onError={handlePhotoError}
              />
            )}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full pointer-events-none">
            <Camera className="h-3 w-3 text-white" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{patron.displayName}</span>
            <PatronStatusBadge
              active={patron.active}
              barred={patron.barred}
              className="text-[10px]"
            />
          </div>
          <span className="text-xs text-muted-foreground">{patron.barcode}</span>
        </div>

        {patron.hasAlerts && (
          <Badge variant="destructive" className="h-5 px-1.5">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {patron.alertCount}
          </Badge>
        )}

        {onClear && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClear} title="Clear patron">
            <X className="h-4 w-4" />
            <span className="sr-only">Clear patron</span>
          </Button>
        )}
      </div>

      <PatronPhotoUpload
        open={photoUploadOpen}
        onOpenChange={setPhotoUploadOpen}
        patronId={patron.id}
        patronName={patron.displayName}
        currentPhotoUrl={patronPhotoUrl}
        onPhotoUploaded={handlePhotoUploaded}
      />
      </>
    );
  }

  // Default variant - card with summary
  if (variant === "default") {
    return (
      <>
      <Card className={cn(isActive && "ring-2 ring-primary", className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="relative group cursor-pointer" onClick={handlePhotoClick} onKeyDown={handlePhotoKeyDown} role="button" aria-label="Upload patron photo" tabIndex={0} title="Click to upload photo">
              <Avatar className="h-12 w-12 transition-opacity group-hover:opacity-70">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full pointer-events-none">
                <Camera className="h-4 w-4 text-white" />
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{patron.displayName}</h3>
                <PatronStatusBadge active={patron.active} barred={patron.barred} />
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  {patron.barcode}
                </span>
                {patron.email && (
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="h-3.5 w-3.5" />
                    {patron.email}
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm pt-2">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <strong>{patron.checkoutsCount}</strong> items
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <strong>{patron.holdsCount}</strong> holds
                </span>
                {patron.overdueCount > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <strong>{patron.overdueCount}</strong> overdue
                  </span>
                )}
                {patron.balanceOwed > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <CreditCard className="h-3.5 w-3.5" />
                    <strong>${patron.balanceOwed.toFixed(2)}</strong> owed
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {patron.hasAlerts && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {patron.alertCount} Alert{patron.alertCount !== 1 ? "s" : ""}
                </Badge>
              )}

              {showActions && (
                <>
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
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <PatronPhotoUpload
        open={photoUploadOpen}
        onOpenChange={setPhotoUploadOpen}
        patronId={patron.id}
        patronName={patron.displayName}
        currentPhotoUrl={patronPhotoUrl}
        onPhotoUploaded={handlePhotoUploaded}
      />
      </>
    );
  }

  // Detailed variant - full information
  // Use type guard to safely check if patron has full details
  const fullPatron = isPatronFull(patron) ? patron : null;

  return (
    <>
    <Card className={cn(isActive && "ring-2 ring-primary", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-4">
          <div className="relative group cursor-pointer" onClick={handlePhotoClick} onKeyDown={handlePhotoKeyDown} role="button" aria-label="Upload patron photo" tabIndex={0} title="Click to upload photo">
            <Avatar className="h-16 w-16 transition-opacity group-hover:opacity-70">
              {patronPhotoUrl && (
                <AvatarImage
                  src={patronPhotoUrl}
                  alt={patron.displayName}
                  onError={handlePhotoError}
                />
              )}
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full pointer-events-none">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{patron.displayName}</h2>
              <PatronStatusBadge
                active={patron.active}
                barred={patron.barred}
              />
              {patron.hasAlerts && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {patron.alertCount}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{patron.profileGroup || "Patron"}</p>
          </div>

          {showActions && onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Contact info */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">{patron.barcode}</span>
          </div>

          {patron.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${patron.email}`} className="text-primary hover:underline">
                {patron.email}
              </a>
            </div>
          )}

          {patron.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${patron.phone}`} className="hover:underline">
                {patron.phone}
              </a>
            </div>
          )}

          {fullPatron?.address && (
            <div className="flex items-start gap-2 text-sm sm:col-span-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span>
                {fullPatron.address.street1}
                {fullPatron.address.street2 && `, ${fullPatron.address.street2}`}
                <br />
                {fullPatron.address.city}, {fullPatron.address.state} {fullPatron.address.zip}
              </span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold">{patron.checkoutsCount}</div>
            <div className="text-xs text-muted-foreground">Checkouts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{patron.holdsCount}</div>
            <div className="text-xs text-muted-foreground">Holds</div>
          </div>
          <div className="text-center">
            <div className={cn("text-2xl font-bold", patron.overdueCount > 0 && "text-destructive")}>
              {patron.overdueCount}
            </div>
            <div className="text-xs text-muted-foreground">Overdue</div>
          </div>
          <div className="text-center">
            <div className={cn("text-2xl font-bold", patron.balanceOwed > 0 && "text-destructive")}>
              ${patron.balanceOwed.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Balance</div>
          </div>
        </div>

        {/* Dates */}
        {fullPatron && (fullPatron.expires || fullPatron.created) && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
            {fullPatron.created && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Created: {new Date(fullPatron.created).toLocaleDateString()}
              </span>
            )}
            {fullPatron.expires && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Expires: {new Date(fullPatron.expires).toLocaleDateString()}
              </span>
            )}
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

      <PatronPhotoUpload
        open={photoUploadOpen}
        onOpenChange={setPhotoUploadOpen}
        patronId={patron.id}
        patronName={patron.displayName}
        currentPhotoUrl={patronPhotoUrl}
        onPhotoUploaded={handlePhotoUploaded}
      />
    </>
  );
}

/**
 * PatronQuickSearch result item
 */
export function PatronSearchResult({
  patron,
  onClick,
  isSelected,
}: {
  patron: PatronSummary;
  onClick: () => void;
  isSelected?: boolean;
}) {
  const initials = `${patron.firstName?.[0] || ""}${patron.lastName?.[0] || ""}`.toUpperCase() || "?";
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [patronPhotoUrl, setPatronPhotoUrl] = useState<string | undefined>(undefined);

  const handlePhotoClick = () => {
    setPhotoUploadOpen(true);
  };
  const handlePhotoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlePhotoClick();
    }
  };


  const handlePhotoUploaded = (url: string) => {
    setPatronPhotoUrl(url);
  };

  const handlePhotoError = () => {
    toast.error("Failed to load patron photo");
    setPatronPhotoUrl(undefined);
  };

  return (
    <button type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left rounded-lg border transition-colors",
        "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary",
        isSelected && "bg-primary/5 border-primary"
      )}
    >
      <div className="relative group cursor-pointer" onClick={handlePhotoClick} onKeyDown={handlePhotoKeyDown} role="button" aria-label="Upload patron photo" tabIndex={0} title="Click to upload photo">
        <Avatar className="h-10 w-10 transition-opacity group-hover:opacity-70">
          {patronPhotoUrl && (
            <AvatarImage
              src={patronPhotoUrl}
              alt={patron.displayName}
              onError={handlePhotoError}
            />
          )}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full pointer-events-none">
          <Camera className="h-4 w-4 text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{patron.displayName}</span>
          {patron.barred && <Badge variant="destructive" className="text-[10px]">Barred</Badge>}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{patron.barcode}</span>
          {patron.email && (
            <>
              <span>•</span>
              <span className="truncate">{patron.email}</span>
            </>
          )}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

export default PatronCard;
