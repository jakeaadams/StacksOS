"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useMemo, useState, useEffect } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import {

  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  LoadingSpinner,
  ErrorState,
  EmptyState,
  StatusBadge,
  BarcodeInput,
} from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Monitor, Users, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Resource {
  id: string | number;
  barcode: string;
  type: number;
  owner: number;
  overbook: boolean;
}

interface ResourceType {
  id: string | number;
  name: string;
  fine_interval: string;
  fine_amount: number;
  max_fine: number;
  owner: number;
}

interface Reservation {
  id: string | number;
  usr: number;
  target_resource: number;
  target_resource_type: number;
  current_resource: number;
  start_time: string;
  end_time: string;
  pickup_time: string;
  return_time: string;
  capture_time: string;
  cancel_time: string;
  pickup_lib: number;
}

function formatTime(dateStr: string) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  return dateStr.split("T")[0];
}

export default function BookingPage() {
  const router = useRouter();
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resourcesMessage, setResourcesMessage] = useState<string | null>(null);
  const [typesMessage, setTypesMessage] = useState<string | null>(null);
  const [reservationsMessage, setReservationsMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [newBookingOpen, setNewBookingOpen] = useState(false);

  // New booking form state
  const [patronBarcode, setPatronBarcode] = useState("");
  const [resourceTypeId, setResourceTypeId] = useState<string>("");
  const [resourceId, setResourceId] = useState<string>("");
  const [bookingDate, setBookingDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setResourcesMessage(null);
    setTypesMessage(null);
    setReservationsMessage(null);

    try {
      const [resourcesRes, typesRes, reservationsRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/booking?action=resources"),
        fetchWithAuth("/api/evergreen/booking?action=resource_types"),
        fetchWithAuth(`/api/evergreen/booking?action=reservations&date=${selectedDate}`),
      ]);

      const resourcesData = await resourcesRes.json();
      const typesData = await typesRes.json();
      const reservationsData = await reservationsRes.json();

      if (resourcesData.ok) {
        setResources(resourcesData.resources || []);
        setResourcesMessage(resourcesData.message || null);
      }
      if (typesData.ok) {
        setResourceTypes(typesData.types || []);
        setTypesMessage(typesData.message || null);
      }

      if (reservationsData.ok) {
        setReservationsMessage(reservationsData.message || null);
        const all: Reservation[] = reservationsData.reservations || [];
        // The current API call returns reservations for pickup_lib=1; filter by date client-side.
        setReservations(all.filter((r) => formatDate(r.start_time) === selectedDate));
      }
    } catch (_error) {
      setError("Failed to load booking data");
    } finally {
      setLoading(false);
    }
  };

  const getTypeName = useCallback(
    (typeId: number) => {
      const type = resourceTypes.find((t) => String(t.id) === String(typeId));
      return type?.name || `Type ${typeId}`;
    },
    [resourceTypes]
  );

  const getStatus = useCallback(
    (reservation: Reservation) => {
      if (reservation.cancel_time) return { label: "Cancelled", status: "error" as const };
      if (reservation.return_time) return { label: "Completed", status: "muted" as const };
      if (reservation.pickup_time) return { label: "Checked Out", status: "info" as const };
      if (reservation.capture_time) return { label: "Ready", status: "success" as const };
      return { label: "Pending", status: "warning" as const };
    },
    []
  );

  const reservationColumns = useMemo<ColumnDef<Reservation>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => <span className="font-mono text-sm">{row.getValue("id")}</span>,
      },
      {
        id: "resource",
        header: "Resource",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">Resource #{row.original.target_resource}</span>
            <span className="text-xs text-muted-foreground">{getTypeName(row.original.target_resource_type)}</span>
          </div>
        ),
      },
      {
        accessorKey: "usr",
        header: "Patron",
        cell: ({ row }) => <span className="font-mono text-sm">#{row.getValue("usr")}</span>,
      },
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => formatDate(row.original.start_time),
      },
      {
        id: "time",
        header: "Time",
        cell: ({ row }) => (
          <span>
            {formatTime(row.original.start_time)}–{formatTime(row.original.end_time)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = getStatus(row.original);
          return <StatusBadge label={status.label} status={status.status} />;
        },
      },
    ],
    [getStatus, getTypeName]
  );

  const resourceColumns = useMemo<ColumnDef<Resource>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => <span className="font-mono text-sm">{row.getValue("id")}</span>,
      },
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => <span className="font-mono text-sm">{row.getValue("barcode")}</span>,
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => getTypeName(row.original.type),
      },
      {
        accessorKey: "owner",
        header: "Owner",
        cell: ({ row }) => <span>Org #{row.getValue("owner")}</span>,
      },
      {
        accessorKey: "overbook",
        header: "Overbook",
        cell: ({ row }) => (
          <StatusBadge
            label={row.getValue("overbook") ? "Allowed" : "No"}
            status={row.getValue("overbook") ? "warning" : "muted"}
          />
        ),
      },
    ],
    [getTypeName]
  );

  const typeColumns = useMemo<ColumnDef<ResourceType>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Type",
        cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
      },
      {
        accessorKey: "fine_interval",
        header: "Fine Interval",
      },
      {
        accessorKey: "fine_amount",
        header: "Fine Amount",
        cell: ({ row }) => `$${Number(row.getValue("fine_amount") || 0).toFixed(2)}`,
      },
      {
        accessorKey: "max_fine",
        header: "Max Fine",
        cell: ({ row }) => `$${Number(row.getValue("max_fine") || 0).toFixed(2)}`,
      },
      {
        accessorKey: "owner",
        header: "Owner",
        cell: ({ row }) => <span>Org #{row.getValue("owner")}</span>,
      },
    ],
    []
  );

  const filteredResources = useMemo(() => {
    if (!resourceTypeId) return resources;
    return resources.filter((r) => String(r.type) === String(resourceTypeId));
  }, [resources, resourceTypeId]);

  const resetNewBooking = () => {
    setPatronBarcode("");
    setResourceTypeId("");
    setResourceId("");
    setBookingDate(selectedDate);
    setStartTime("10:00");
    setEndTime("11:00");
  };

  const openNewBooking = () => {
    resetNewBooking();
    setNewBookingOpen(true);
  };

  const handleCreateReservation = async () => {
    if (!patronBarcode.trim()) {
      toast.message("Patron barcode required");
      return;
    }

    if (!resourceId) {
      toast.message("Select a resource");
      return;
    }

    const start = `${bookingDate}T${startTime.length === 5 ? startTime + ":00" : startTime}`;
    const end = `${bookingDate}T${endTime.length === 5 ? endTime + ":00" : endTime}`;

    if (new Date(start) >= new Date(end)) {
      toast.message("End time must be after start time");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          patron_barcode: patronBarcode.trim(),
          resource_id: Number(resourceId),
          start_time: start,
          end_time: end,
          pickup_lib: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Failed to create reservation");
      }

      toast.success("Reservation created");
      setNewBookingOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create reservation");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Booking"
        subtitle="Manage room and equipment reservations across your library system."
        breadcrumbs={[{ label: "Booking" }]}
        actions={[
          {
            label: "New Booking",
            onClick: openNewBooking,
            icon: Plus,
            disabled: resources.length === 0,
          },
        ]}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-44"
          />
          <Button size="sm" variant="outline" onClick={loadData}>
            <Search className="h-4 w-4 mr-2" />Refresh
          </Button>
        </div>
      </PageHeader>

      <PageContent>
        {loading ? (
          <LoadingSpinner message="Loading booking data..." />
        ) : error ? (
          <ErrorState title="Booking data unavailable" message={error} onRetry={loadData} />
        ) : (
          <Tabs defaultValue="reservations" className="flex flex-col gap-4">
            <TabsList>
              <TabsTrigger value="reservations" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />Reservations ({reservations.length})
              </TabsTrigger>
              <TabsTrigger value="resources" className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />Resources ({resources.length})
              </TabsTrigger>
              <TabsTrigger value="types" className="flex items-center gap-2">
                <Users className="h-4 w-4" />Resource Types ({resourceTypes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reservations">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Reservations</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={reservationColumns}
                    data={reservations}
                    searchable
                    searchPlaceholder="Search reservations..."
                    emptyState={
                      <EmptyState
                        icon={Calendar}
                        title="No reservations"
                        description={
                          reservationsMessage ||
                          (resources.length === 0
                            ? resourcesMessage || "Configure bookable resources in Evergreen administration"
                            : "Create a new booking to get started.")
                        }
                        action={
                          resources.length > 0
                            ? { label: "New booking", onClick: () => setNewBookingOpen(true), icon: Plus }
                            : { label: "Evergreen setup checklist", onClick: () => router.push("/staff/help#evergreen-setup") }
                        }
                        secondaryAction={
                          resources.length === 0
                            ? { label: "Seed demo data", onClick: () => router.push("/staff/help#demo-data") }
                            : undefined
                        }
                      />
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="resources">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resources</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={resourceColumns}
                    data={resources}
                    searchable
                    searchPlaceholder="Search resources..."
                    emptyState={
                      <EmptyState
                        icon={Monitor}
                        title="No resources"
                        description={resourcesMessage || "Create booking resources in Evergreen to enable reservations."}
                        action={{
                          label: "Evergreen setup checklist",
                          onClick: () => router.push("/staff/help#evergreen-setup"),
                        }}
                        secondaryAction={{
                          label: "Seed demo data",
                          onClick: () => router.push("/staff/help#demo-data"),
                        }}
                      />
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="types">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resource Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={typeColumns}
                    data={resourceTypes}
                    searchable
                    searchPlaceholder="Search resource types..."
                    emptyState={
                      <EmptyState
                        icon={Users}
                        title="No resource types"
                        description={typesMessage || "Create resource types in Evergreen administration."}
                        action={{
                          label: "Evergreen setup checklist",
                          onClick: () => router.push("/staff/help#evergreen-setup"),
                        }}
                        secondaryAction={{
                          label: "Seed demo data",
                          onClick: () => router.push("/staff/help#demo-data"),
                        }}
                      />
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </PageContent>

      <Dialog open={newBookingOpen} onOpenChange={setNewBookingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Booking</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <BarcodeInput
              label="Patron Barcode"
              value={patronBarcode}
              onChange={setPatronBarcode}
              autoFocus
              autoSubmitOnScan={false}
              description="Scan the patron card."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Resource Type</div>
                <Select value={resourceTypeId} onValueChange={(v) => { setResourceTypeId(v); setResourceId(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {resourceTypes.map((type) => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Resource</div>
                <Select value={resourceId} onValueChange={setResourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder={filteredResources.length ? "Select resource" : "No resources"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredResources.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.barcode || `Resource ${r.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Date</div>
                <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Start</div>
                <Input value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">End</div>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setNewBookingOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleCreateReservation} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
