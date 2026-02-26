"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, ChevronLeft, Download, Loader2, RefreshCw, Users } from "lucide-react";

import { fetchWithAuth } from "@/lib/client-fetch";
import { convertToCSV, downloadFile, generateExportFilename } from "@/lib/csv";
import { PageContainer, PageHeader, PageContent, DataTable, EmptyState } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type EventSummary = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  branch: string;
  type: string;
  ageGroup: string;
  capacity: number | null;
  registrationRequired: boolean;
  registeredCount: number;
  waitlistedCount: number;
};

type Registrant = {
  id: number;
  patronId: number;
  status: "registered" | "waitlisted" | "canceled";
  waitlistPosition: number | null;
  reminderChannel: string;
  registeredAt: string;
  canceledAt: string | null;
};

export default function StaffEventsPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [registrantsLoading, setRegistrantsLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithAuth("/api/opac/events?limit=100");
      const data = await res.json();
      if (!res.ok || data?.ok === false) return;

      const enriched: EventSummary[] = (Array.isArray(data.events) ? data.events : []).map(
        (event: any) =>
          ({
            id: event.id,
            title: event.title,
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
            branch: event.branch,
            type: event.type,
            ageGroup: event.ageGroup,
            capacity: typeof event.capacity === "number" ? event.capacity : null,
            registrationRequired: Boolean(event.registrationRequired),
            registeredCount: event.registration?.registeredCount ?? 0,
            waitlistedCount: event.registration?.waitlistedCount ?? 0,
          }) satisfies EventSummary
      );

      setEvents(enriched);
    } catch {
      // Best-effort
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const fetchRegistrants = useCallback(async (eventId: string) => {
    setRegistrantsLoading(true);
    setSelectedEventId(eventId);
    try {
      const res = await fetchWithAuth(`/api/staff/events/${eventId}/registrations`);
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        setRegistrants([]);
        return;
      }
      setRegistrants(Array.isArray(data.registrations) ? data.registrations : []);
    } catch {
      setRegistrants([]);
    } finally {
      setRegistrantsLoading(false);
    }
  }, []);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const exportRegistrants = useCallback(() => {
    if (!selectedEvent || registrants.length === 0) return;
    const csv = convertToCSV(registrants, {
      columns: [
        "id",
        "patronId",
        "status",
        "waitlistPosition",
        "reminderChannel",
        "registeredAt",
        "canceledAt",
      ],
      headers: {
        id: "Registration ID",
        patronId: "Patron ID",
        status: "Status",
        waitlistPosition: "Waitlist Position",
        reminderChannel: "Reminder Channel",
        registeredAt: "Registered At",
        canceledAt: "Canceled At",
      },
    });
    const filename = generateExportFilename(`event-registrants-${selectedEvent.id}`);
    downloadFile(csv, filename, "text/csv;charset=utf-8;");
  }, [selectedEvent, registrants]);

  const totalRegistered = useMemo(
    () => events.reduce((sum, e) => sum + e.registeredCount, 0),
    [events]
  );
  const totalWaitlisted = useMemo(
    () => events.reduce((sum, e) => sum + e.waitlistedCount, 0),
    [events]
  );

  const eventColumns: ColumnDef<EventSummary>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Event",
        cell: ({ row }) => (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => void fetchRegistrants(row.original.id)}
              className="text-left font-medium text-primary-700 hover:underline truncate block"
            >
              {row.original.title}
            </button>
            <div className="text-xs text-muted-foreground">
              {row.original.type} &middot; {row.original.ageGroup}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => (
          <div className="text-sm whitespace-nowrap">
            <div>{row.original.date}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.startTime} - {row.original.endTime}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "branch",
        header: "Branch",
        cell: ({ row }) => <span className="text-sm">{row.original.branch}</span>,
      },
      {
        id: "registration",
        header: "Registration",
        cell: ({ row }) => {
          const e = row.original;
          const fillPct =
            e.capacity && e.capacity > 0 ? Math.round((e.registeredCount / e.capacity) * 100) : 0;
          return (
            <div className="min-w-[140px] space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>
                  {e.registeredCount}
                  {e.capacity !== null ? ` / ${e.capacity}` : ""}
                </span>
                {e.waitlistedCount > 0 ? (
                  <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800">
                    +{e.waitlistedCount} wait
                  </Badge>
                ) : null}
              </div>
              {e.capacity !== null ? (
                <Progress value={fillPct} className="h-1.5" />
              ) : (
                <span className="text-[10px] text-muted-foreground">No cap</span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchRegistrants(row.original.id)}
          >
            <Users className="h-3.5 w-3.5 mr-1" />
            View
          </Button>
        ),
      },
    ],
    [fetchRegistrants]
  );

  const registrantColumns: ColumnDef<Registrant>[] = useMemo(
    () => [
      {
        accessorKey: "patronId",
        header: "Patron ID",
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.patronId}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = row.original.status;
          const color =
            s === "registered"
              ? "bg-emerald-100 text-emerald-800"
              : s === "waitlisted"
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-600";
          return (
            <Badge variant="secondary" className={`text-xs ${color}`}>
              {s}
              {s === "waitlisted" && row.original.waitlistPosition
                ? ` #${row.original.waitlistPosition}`
                : ""}
            </Badge>
          );
        },
      },
      {
        accessorKey: "reminderChannel",
        header: "Reminder",
        cell: ({ row }) => (
          <span className="text-sm capitalize">{row.original.reminderChannel}</span>
        ),
      },
      {
        accessorKey: "registeredAt",
        header: "Registered",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.registeredAt ? new Date(row.original.registeredAt).toLocaleString() : "-"}
          </span>
        ),
      },
    ],
    []
  );

  // Drill-down view
  if (selectedEventId && selectedEvent) {
    return (
      <PageContainer>
        <PageHeader
          title={selectedEvent.title}
          subtitle={`${selectedEvent.date} | ${selectedEvent.startTime} - ${selectedEvent.endTime} | ${selectedEvent.branch}`}
          breadcrumbs={[
            { label: "Dashboard", href: "/staff" },
            { label: "Events", href: "/staff/events" },
            { label: "Registrants" },
          ]}
          actions={[
            {
              label: "Back to Events",
              onClick: () => {
                setSelectedEventId(null);
                setRegistrants([]);
              },
              icon: ChevronLeft,
              variant: "outline",
            },
            {
              label: "Export CSV",
              onClick: exportRegistrants,
              icon: Download,
              disabled: registrants.length === 0,
            },
          ]}
        />
        <PageContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-muted-foreground">Registered</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {selectedEvent.registeredCount}
                  {selectedEvent.capacity !== null ? ` / ${selectedEvent.capacity}` : ""}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-muted-foreground">Waitlisted</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{selectedEvent.waitlistedCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm text-muted-foreground">Fill Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {selectedEvent.capacity
                    ? `${Math.round((selectedEvent.registeredCount / selectedEvent.capacity) * 100)}%`
                    : "N/A"}
                </p>
              </CardContent>
            </Card>
          </div>

          <DataTable
            columns={registrantColumns}
            data={registrants}
            isLoading={registrantsLoading}
            searchable
            searchPlaceholder="Search registrants..."
            paginated
            defaultPageSize={20}
          />
        </PageContent>
      </PageContainer>
    );
  }

  // Main events listing
  return (
    <PageContainer>
      <PageHeader
        title="Events Management"
        subtitle="All library events with live registration metrics."
        breadcrumbs={[{ label: "Dashboard", href: "/staff" }, { label: "Events" }]}
        actions={[
          {
            label: "Refresh",
            onClick: () => void fetchEvents(),
            icon: RefreshCw,
            variant: "outline",
            disabled: isLoading,
          },
        ]}
      />
      <PageContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-muted-foreground">Total Events</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary-600" />
              <p className="text-2xl font-bold">{events.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-muted-foreground">Total Registered</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              <p className="text-2xl font-bold">{totalRegistered}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-muted-foreground">Total Waitlisted</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Users className="h-5 w-5 text-amber-600" />
              <p className="text-2xl font-bold">{totalWaitlisted}</p>
            </CardContent>
          </Card>
        </div>

        <DataTable
          columns={eventColumns}
          data={events}
          isLoading={isLoading}
          searchable
          searchPlaceholder="Search events..."
          searchColumn="title"
          paginated
          defaultPageSize={20}
        />
      </PageContent>
    </PageContainer>
  );
}
