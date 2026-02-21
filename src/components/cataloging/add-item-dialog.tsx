"use client";

import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Package, Barcode, BookOpen, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { clientLogger } from "@/lib/client-logger";

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bibRecord: {
    id: number;
    title: string;
    author?: string;
    isbn?: string;
    callNumber?: string;
  };
  onItemCreated?: () => void;
}

interface CopyLocation {
  id: number;
  name: string;
}

interface CopyStatus {
  id: number;
  name: string;
}

export function AddItemDialog({ open, onOpenChange, bibRecord, onItemCreated }: AddItemDialogProps) {
  const { user, orgs } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [locations, setLocations] = useState<CopyLocation[]>([]);
  const [statuses, setStatuses] = useState<CopyStatus[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Form state
  const [barcode, setBarcode] = useState("");
  const [callNumber, setCallNumber] = useState(bibRecord.callNumber || "");
  const [locationId, setLocationId] = useState<string>("");
  const [statusId, setStatusId] = useState<string>("0"); // 0 = Available
  const [circLibId, setCircLibId] = useState<string>(user?.homeLibraryId?.toString() || "");
  const [price, setPrice] = useState("");

  // Items created in this session
  const [createdItems, setCreatedItems] = useState<Array<{ barcode: string; id: number }>>([]);

  // Load locations and statuses
  useEffect(() => {
    if (!open) return;

    const loadMetadata = async () => {
      setLoadingMeta(true);
      try {
        // Load copy locations
        const locRes = await fetchWithAuth("/api/evergreen/catalog?action=copy_locations");
        const locData = await locRes.json();
        if (locData.ok && locData.locations) {
          setLocations(locData.locations);
          // Default to first location or "Stacks"
          const stacks = locData.locations.find((l: CopyLocation) => 
            l.name.toLowerCase().includes("stack") || l.name.toLowerCase().includes("general")
          );
          if (stacks) setLocationId(stacks.id.toString());
          else if (locData.locations.length > 0) setLocationId(locData.locations[0].id.toString());
        }

        // Load copy statuses
        const statusRes = await fetchWithAuth("/api/evergreen/copy-statuses");
        const statusData = await statusRes.json();
        if (statusData.ok && statusData.statuses) {
          setStatuses(statusData.statuses);
        }
      } catch (err) {
        clientLogger.error("Failed to load copy metadata:", err);
        toast.error("Failed to load item metadata");
      } finally {
        setLoadingMeta(false);
      }
    };

    loadMetadata();
  }, [open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setBarcode("");
      setCallNumber(bibRecord.callNumber || "");
      setCreatedItems([]);
      setCircLibId(user?.homeLibraryId?.toString() || "");
    }
  }, [open, bibRecord.callNumber, user]);

  const handleCreateItem = async () => {
    if (!barcode.trim()) {
      toast.error("Barcode is required");
      return;
    }
    if (!callNumber.trim()) {
      toast.error("Call number is required");
      return;
    }
    if (!circLibId) {
      toast.error("Library is required");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bibId: bibRecord.id,
          barcode: barcode.trim(),
          callNumber: callNumber.trim(),
          circLib: parseInt(circLibId, 10),
          owningLib: parseInt(circLibId, 10),
          locationId: locationId ? parseInt(locationId, 10) : undefined,
          status: statusId ? parseInt(statusId, 10) : 0,
          price: price ? parseFloat(price) : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to create item");
      }

      // Success!
      setCreatedItems(prev => [...prev, { barcode: barcode.trim(), id: data.copyId }]);
      toast.success(`Item created: ${barcode}`);
      setBarcode(""); // Clear barcode for next item
      
      if (onItemCreated) {
        onItemCreated();
      }
    } catch (err: any) {
      toast.error((err instanceof Error ? err.message : String(err)) || "Failed to create item");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Add Items
          </DialogTitle>
          <DialogDescription>
            Add physical items to this bibliographic record
          </DialogDescription>
        </DialogHeader>

        {/* Bib Record Summary */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-1">
          <div className="font-medium text-sm line-clamp-2">{bibRecord.title}</div>
          {bibRecord.author && (
            <div className="text-xs text-muted-foreground">{bibRecord.author}</div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono">Bib #{bibRecord.id}</Badge>
            {bibRecord.isbn && <span className="text-muted-foreground">ISBN: {bibRecord.isbn}</span>}
          </div>
        </div>

        {loadingMeta ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Barcode - Primary input */}
            <div className="space-y-2">
              <Label htmlFor="barcode" className="flex items-center gap-2">
                <Barcode className="h-4 w-4" />
                Item Barcode *
              </Label>
              <Input
                id="barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type barcode..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && barcode.trim()) {
                    e.preventDefault();
                    handleCreateItem();
                  }
                }}
              />
            </div>

            {/* Call Number */}
            <div className="space-y-2">
              <Label htmlFor="callNumber" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Call Number *
              </Label>
              <Input
                id="callNumber"
                value={callNumber}
                onChange={(e) => setCallNumber(e.target.value)}
                placeholder="e.g., F ROW or 823.92 ROW"
              />
            </div>

            {/* Library and Location Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Library *</Label>
                <Select value={circLibId} onValueChange={setCircLibId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select library" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((org) => (
                      <SelectItem key={org.id} value={org.id.toString()}>
                        {org.shortname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Shelving Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id.toString()}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status and Price Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusId} onValueChange={setStatusId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Created Items */}
            {createdItems.length > 0 && (
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 space-y-2">
                <div className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Items Created ({createdItems.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {createdItems.map((item) => (
                    <Badge key={item.id} variant="secondary" className="font-mono text-xs">
                      {item.barcode}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            {createdItems.length > 0 ? "Done" : "Cancel"}
          </Button>
          <Button onClick={handleCreateItem} disabled={isCreating || loadingMeta || !barcode.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
