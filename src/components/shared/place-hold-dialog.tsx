"use client";

import * as React from "react";
import { useRef } from "react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { fetchWithAuth } from "@/lib/client-fetch";

import { BarcodeInput } from "./barcode-input";
import { ErrorMessage } from "./error-state";
import { PatronCard } from "./patron-card";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { BookmarkPlus, Loader2 } from "lucide-react";

type PatronLike = {
  id: number;
  barcode: string;
  first_given_name?: string;
  family_name?: string;
  email?: string;
  day_phone?: string;
  home_ou?: any;
  profile?: any;
  active?: boolean;
  barred?: boolean;
  standing_penalties?: any[];
};

export type PlaceHoldRecord = {
  id: number;
  title?: string;
  author?: string;
};

export interface PlaceHoldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  record: PlaceHoldRecord | null;

  initialPatronBarcode?: string;
  initialPickupLib?: number;

  onPlaced?: (holdId: number) => void;
}

function getPatronDisplayName(patron: PatronLike): string {
  const last = patron.family_name || "";
  const first = patron.first_given_name || "";
  const name = `${last}, ${first}`.trim().replace(/^,\s*/, "");
  return name || patron.barcode || "Patron";
}

export function PlaceHoldDialog({
  open,
  onOpenChange,
  record,
  initialPatronBarcode,
  initialPickupLib,
  onPlaced,
}: PlaceHoldDialogProps) {
  const { orgs, user } = useAuth();

  const [patronBarcode, setPatronBarcode] = React.useState(initialPatronBarcode || "");
  const [pickupLib, setPickupLib] = React.useState(
    String(initialPickupLib || user?.activeOrgId || user?.homeLibraryId || 1)
  );

  const [patron, setPatron] = React.useState<PatronLike | null>(null);
  const [isLookingUp, setIsLookingUp] = React.useState(false);
  const [isPlacing, setIsPlacing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;

    setError(null);

    const desiredPickup = String(initialPickupLib || user?.activeOrgId || user?.homeLibraryId || 1);
    setPickupLib(desiredPickup);

    if (initialPatronBarcode) {
      setPatronBarcode(initialPatronBarcode);
    }

    if (initialPatronBarcode && !patron) {
      void lookupPatron(initialPatronBarcode);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const lookupPatron = async (barcode: string) => {
    const trimmed = barcode.trim();
    if (!trimmed) return;

    setIsLookingUp(true);
    setError(null);

    try {
      const res = await fetch(`/api/evergreen/patrons?barcode=${encodeURIComponent(trimmed)}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Patron not found");
      }

      const loaded: PatronLike = data.patron || data.raw || null;
      if (!loaded?.id) {
        throw new Error("Patron not found");
      }

      setPatron(loaded);
      toast.success("Patron loaded", { description: getPatronDisplayName(loaded) });
    } catch (err: any) {
      setPatron(null);
      setError(err?.message || "Patron lookup failed");
      toast.error(err?.message || "Patron lookup failed");
    } finally {
      setIsLookingUp(false);
    }
  };

  const placeHold = async () => {
    if (!record?.id) {
      setError("Select a record to place a hold");
      return;
    }

    if (!patron?.id) {
      setError("Scan a patron barcode first");
      return;
    }

    const pickup = parseInt(pickupLib, 10);
    if (!Number.isFinite(pickup) || pickup <= 0) {
      setError("Select a pickup location");
      return;
    }

    setIsPlacing(true);
    setError(null);

    try {
      const res = await fetchWithAuth("/api/evergreen/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "place_hold",
          patronId: patron.id,
          targetId: record.id,
          holdType: "T",
          pickupLib: pickup,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Failed to place hold");
      }

      const holdIdRaw = data.holdId || data.hold_id || data?.result?.holdId;
      const holdId =
        typeof holdIdRaw === "number" ? holdIdRaw : parseInt(String(holdIdRaw || ""), 10);

      toast.success("Hold placed", {
        description: Number.isFinite(holdId)
          ? `Hold #${holdId}`
          : record.title || `Record ${record.id}`,
      });

      if (Number.isFinite(holdId)) {
        onPlaced?.(holdId);
      }

      onOpenChange(false);
    } catch (err: any) {
      const message = err?.message || "Failed to place hold";
      setError(message);
      toast.error(message);
    } finally {
      setIsPlacing(false);
    }
  };

  const canPlace = !!record?.id && !!patron?.id && !isPlacing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-5 w-5" /> Place Hold
          </DialogTitle>
          <DialogDescription>
            {record?.title ? (
              <span>
                Title: <span className="font-medium">{record.title}</span>
                {record.author ? (
                  <span className="text-muted-foreground"> (by {record.author})</span>
                ) : null}
              </span>
            ) : (
              <span>Select a record first.</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div aria-live="assertive" role="alert">
            <ErrorMessage message={error} onRetry={() => setError(null)} />
          </div>
        )}

        <div className="space-y-4">
          <BarcodeInput
            label="Patron Barcode"
            value={patronBarcode}
            onChange={(v) => {
              setPatronBarcode(v);
              if (patron && v.trim() !== patron.barcode) {
                setPatron(null);
              }
            }}
            onSubmit={lookupPatron}
            isLoading={isLookingUp}
            description="Scan a patron card (or type and press Enter)."
            autoFocus
          />

          {patron && (
            <PatronCard
              patron={{
                id: patron.id,
                barcode: patron.barcode,
                firstName: patron.first_given_name || "",
                lastName: patron.family_name || "",
                displayName: getPatronDisplayName(patron),
                email: patron.email,
                phone: patron.day_phone,
                homeLibrary: String(patron.home_ou?.name || patron.home_ou || ""),
                profileGroup: patron.profile?.name || "Patron",
                active: patron.active !== false,
                barred: patron.barred === true,
                hasAlerts:
                  Array.isArray(patron.standing_penalties) && patron.standing_penalties.length > 0,
                alertCount: patron.standing_penalties?.length || 0,
                balanceOwed: 0,
                checkoutsCount: 0,
                holdsCount: 0,
                overdueCount: 0,
              }}
              variant="compact"
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Pickup Location</div>
              <Select value={pickupLib} onValueChange={setPickupLib}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pickup location" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={String(org.id)}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Hold Type</div>
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                Title Hold (T)
                <div className="text-xs text-muted-foreground">Item and volume holds are P1.</div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPlacing}>
            Cancel
          </Button>
          <Button onClick={placeHold} disabled={!canPlace}>
            {isPlacing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Place Hold
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PlaceHoldDialog;
