"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {

  PageContainer,
  PageHeader,
  PageContent,
  BarcodeInput,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  LoadingInline,
} from "@/components/shared";
import { ColumnDef } from "@tanstack/react-table";
import { Download, Trash2, Library, BookOpen } from "lucide-react";
import { toast } from "sonner";

interface InHouseUse {
  id: string;
  barcode: string;
  title: string;
  callNumber: string;
  locationName: string;
  timestamp: string;
  staffInitials: string;
}

export default function InHouseUsePage() {
  const { user, orgs, getOrgName } = useAuth();
  const [itemBarcode, setItemBarcode] = useState("");
  const [locationOrgId, setLocationOrgId] = useState<number | null>(null);
  const [sessionItems, setSessionItems] = useState<InHouseUse[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (!locationOrgId && user?.homeLibraryId) {
      setLocationOrgId(user.homeLibraryId);
    }
  }, [locationOrgId, user]);

  const staffInitials = useMemo(() => {
    if (!user?.displayName) return "STAFF";
    return user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase();
  }, [user]);

  const handleScanItem = async (barcode: string) => {
    if (!barcode.trim()) return;
    setIsScanning(true);

    try {
      const res = await fetchWithAuth("/api/evergreen/circulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "in_house_use",
          itemBarcode: barcode,
          orgId: locationOrgId || undefined,
          count: 1,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        toast.error("Failed to record in-house use", { description: data.error });
        return;
      }

      const item = data.item || {};
      const newItem: InHouseUse = {
        id: `IH-${Date.now()}`,
        barcode,
        title: item.title || "Unknown",
        callNumber: item.callNumber || "",
        locationName: getOrgName(locationOrgId || data.location || user?.homeLibraryId || 1),
        timestamp: new Date().toISOString(),
        staffInitials: staffInitials || user?.username || "STAFF",
      };

      setSessionItems((prev) => [newItem, ...prev]);
      setItemBarcode("");
      toast.success("In-house use recorded", { description: item.title || barcode });
    } catch (_error) {
      toast.error("Failed to record in-house use");
    } finally {
      setIsScanning(false);
    }
  };

  const removeItem = (id: string) => {
    setSessionItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearSession = () => {
    if (!sessionItems.length) return;
    if (confirm("Clear all items from this session?")) {
      setSessionItems([]);
    }
  };

  const exportSession = () => {
    if (!sessionItems.length) return;
    const csv = [
      "Barcode,Title,Call Number,Location,Timestamp,Staff",
      ...sessionItems.map(
        (item) =>
          `${item.barcode},"${item.title}","${item.callNumber}","${item.locationName}",${item.timestamp},${item.staffInitials}`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `in-house-use-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<ColumnDef<InHouseUse>[]>(
    () => [
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span>,
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.title}</div>
            {row.original.callNumber && (
              <div className="text-xs text-muted-foreground">{row.original.callNumber}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "locationName",
        header: "Location",
        cell: ({ row }) => <span className="text-xs">{row.original.locationName}</span>,
      },
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.timestamp).toLocaleTimeString()}
          </span>
        ),
      },
      {
        accessorKey: "staffInitials",
        header: "Staff",
        cell: ({ row }) => <span className="text-xs">{row.original.staffInitials}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeItem(row.original.id)} title="Remove from list">
            <Trash2 className="h-4 w-4 text-rose-500" />
            <span className="sr-only">Remove from list</span>
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <PageContainer>
      <PageHeader
        title="In‑House Use"
        subtitle="Record in‑library usage without checking items out."
        breadcrumbs={[{ label: "Circulation" }, { label: "In‑House Use" }]}
        actions={[
          { label: "Export", onClick: exportSession, icon: Download, disabled: sessionItems.length === 0 },
          { label: "Clear Session", onClick: clearSession, icon: Trash2, disabled: sessionItems.length === 0 },
        ]}
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">Session Items: {sessionItems.length}</Badge>
          {locationOrgId && (
            <Badge variant="outline" className="rounded-full">{getOrgName(locationOrgId)}</Badge>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Scan Items
              </h3>
              <BarcodeInput
                label="Item Barcode"
                placeholder="Scan or enter barcode"
                value={itemBarcode}
                onChange={setItemBarcode}
                onSubmit={handleScanItem}
                isLoading={isScanning}
                autoFocus
                autoClear
              />
              {isScanning && <LoadingInline message="Recording in‑house use..." />}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/70 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Location</h3>
              <Select
                value={locationOrgId ? String(locationOrgId) : ""}
                onValueChange={(value) => setLocationOrgId(parseInt(value, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={String(org.id)}>
                      {org.shortname} — {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                In‑house use is recorded against the selected branch.
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Library className="h-3.5 w-3.5" />
                Staff: {staffInitials}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Session Items</h3>
            <Badge variant="secondary" className="rounded-full">{sessionItems.length} items</Badge>
          </div>
          <DataTable
            columns={columns}
            data={sessionItems}
            searchable
            searchPlaceholder="Search session items..."
            emptyState={
              <EmptyState
                icon={BookOpen}
                title="No items recorded"
                description="Scan item barcodes to record in‑house use."
              />
            }
          />
        </div>
      </PageContent>
    </PageContainer>
  );
}
