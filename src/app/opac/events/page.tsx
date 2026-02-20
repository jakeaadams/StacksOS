"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/hooks/use-library";
import {
  Calendar,
  CalendarDays,
  Clock,
  Filter,
  List,
  MapPin,
  Search,
  Users,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { LibraryEvent, EventType } from "@/lib/events-data";

type ViewMode = "list" | "week" | "month";

const AGE_GROUP_COLORS: Record<string, string> = {
  "All Ages": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Kids: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Teens: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Adults: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Seniors: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  Storytime: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "Book Club": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Tech Help": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  Workshop: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Author Visit": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Teen: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  Kids: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  Adult: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

function formatEventDate(dateStr: string): {
  monthAbbr: string;
  day: string;
  weekday: string;
  full: string;
} {
  const date = new Date(dateStr + "T12:00:00");
  return {
    monthAbbr: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: date.getDate().toString(),
    weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
    full: date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };
}

function EventCard({ event }: { event: LibraryEvent }) {
  const dateInfo = formatEventDate(event.date);

  const handleRegister = () => {
    if (event.registrationUrl) {
      window.open(event.registrationUrl, "_blank", "noopener,noreferrer");
    } else {
      toast.info("Registration coming soon", {
        description: "Online registration for this event will be available shortly.",
      });
    }
  };

  return (
    <div className="flex gap-4 md:gap-6 p-4 md:p-6 bg-card rounded-xl border border-border hover:shadow-md transition-shadow">
      {/* Date display - calendar icon style */}
      <div className="shrink-0 w-16 md:w-20 text-center">
        <div className="bg-primary-600 text-white text-xs font-bold rounded-t-lg py-1 px-2">
          {dateInfo.monthAbbr}
        </div>
        <div className="bg-muted border border-t-0 border-border rounded-b-lg py-2 px-2">
          <span className="text-2xl md:text-3xl font-bold text-foreground">{dateInfo.day}</span>
        </div>
      </div>

      {/* Event details */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          <h3 className="text-lg font-semibold text-foreground">{event.title}</h3>
          <Badge
            className={`text-xs ${EVENT_TYPE_COLORS[event.type] || "bg-gray-100 text-gray-800"}`}
            variant="secondary"
          >
            {event.type}
          </Badge>
          <Badge
            className={`text-xs ${AGE_GROUP_COLORS[event.ageGroup] || "bg-gray-100 text-gray-800"}`}
            variant="secondary"
          >
            {event.ageGroup}
          </Badge>
        </div>

        <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{event.description}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {event.startTime} – {event.endTime}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {event.branch}
          </span>
          {event.spotsAvailable !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" />
              {event.spotsAvailable} of {event.capacity} spots left
            </span>
          )}
        </div>
      </div>

      {/* Registration button */}
      <div className="shrink-0 flex flex-col items-end justify-between">
        {event.registrationRequired ? (
          <button
            onClick={handleRegister}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg
                     hover:bg-primary-700 transition-colors whitespace-nowrap"
          >
            Register
          </button>
        ) : (
          <span className="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium rounded-full">
            Drop-in
          </span>
        )}
        {event.spotsAvailable !== undefined && event.spotsAvailable <= 3 && (
          <span className="text-xs text-red-600 dark:text-red-400 font-medium mt-2">
            Almost full!
          </span>
        )}
      </div>
    </div>
  );
}

function WeekView({ events }: { events: LibraryEvent[] }) {
  // Group events by date for the next 7 days
  const today = new Date();
  const days: { date: string; label: string; events: LibraryEvent[] }[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    days.push({
      date: dateStr,
      label,
      events: events.filter((e) => e.date === dateStr),
    });
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <div key={day.date}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
            {day.label}
          </h3>
          {day.events.length > 0 ? (
            <div className="space-y-3">
              {day.events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60 py-3 pl-4 border-l-2 border-border">
              No events scheduled
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function MonthView({ events }: { events: LibraryEvent[] }) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startPadding = firstDay.getDay(); // 0 = Sunday

  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const eventsByDate = new Map<string, LibraryEvent[]>();
  events.forEach((e) => {
    const existing = eventsByDate.get(e.date) || [];
    existing.push(e);
    eventsByDate.set(e.date, existing);
  });

  const cells: { day: number | null; dateStr: string; events: LibraryEvent[] }[] = [];

  // Padding before first day
  for (let i = 0; i < startPadding; i++) {
    cells.push({ day: null, dateStr: "", events: [] });
  }

  // Days of the month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({
      day: d,
      dateStr,
      events: eventsByDate.get(dateStr) || [],
    });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4 text-center">{monthLabel}</h3>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-muted p-2 text-center text-xs font-semibold text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {cells.map((cell, i) => (
          <div
            key={i}
            className={`bg-card p-2 min-h-[80px] ${
              cell.day === today.getDate() && currentMonth === today.getMonth()
                ? "ring-2 ring-primary-500 ring-inset"
                : ""
            }`}
          >
            {cell.day && (
              <>
                <span className="text-sm font-medium text-foreground">{cell.day}</span>
                <div className="mt-1 space-y-0.5">
                  {cell.events.slice(0, 2).map((evt) => (
                    <div
                      key={evt.id}
                      className="text-xs truncate px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                      title={`${evt.title} - ${evt.startTime}`}
                    >
                      {evt.title}
                    </div>
                  ))}
                  {cell.events.length > 2 && (
                    <span className="text-xs text-muted-foreground">
                      +{cell.events.length - 2} more
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EventsPage() {
  const { library } = useLibrary();
  const [events, setEvents] = useState<LibraryEvent[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filterBranch && filterBranch !== "all") params.set("branch", filterBranch);
      if (filterType && filterType !== "all") params.set("type", filterType);

      const res = await fetch(`/api/opac/events?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setBranches(data.branches || []);
        setTypes(data.types || []);
      }
    } catch {
      // Silently handle fetch errors
    } finally {
      setIsLoading(false);
    }
  }, [filterBranch, filterType]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = useMemo(() => {
    if (!searchTerm.trim()) return events;
    const term = searchTerm.toLowerCase();
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(term) ||
        e.description.toLowerCase().includes(term) ||
        e.branch.toLowerCase().includes(term)
    );
  }, [events, searchTerm]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Page header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/opac"
              className="text-primary-200 hover:text-white transition-colors text-sm inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Catalog
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/10 rounded-lg">
              <CalendarDays className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">Events & Programs</h1>
          </div>
          <p className="text-primary-100 text-lg max-w-2xl">
            Discover storytimes, book clubs, workshops, author visits, and more at{" "}
            {library?.name || "your library"}.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters and controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg bg-background
                       text-foreground placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">Filters:</span>
            </div>

            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* View toggle */}
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
            className="ml-auto"
          >
            <TabsList>
              <TabsTrigger value="list" className="gap-1.5">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">List</span>
              </TabsTrigger>
              <TabsTrigger value="week" className="gap-1.5">
                <CalendarDays className="h-4 w-4" />
                <span className="hidden sm:inline">Week</span>
              </TabsTrigger>
              <TabsTrigger value="month" className="gap-1.5">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Month</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse flex gap-6 p-6 bg-card rounded-xl border border-border"
              >
                <div className="w-20 h-20 bg-muted rounded-lg" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No events found</h2>
            <p className="text-muted-foreground">
              {searchTerm || filterBranch !== "all" || filterType !== "all"
                ? "Try adjusting your filters or search term."
                : "Check back soon for upcoming events and programs."}
            </p>
          </div>
        ) : (
          <>
            {viewMode === "list" && (
              <div className="space-y-4">
                {filteredEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
            {viewMode === "week" && <WeekView events={filteredEvents} />}
            {viewMode === "month" && <MonthView events={filteredEvents} />}
          </>
        )}

        {/* Results count */}
        {!isLoading && filteredEvents.length > 0 && (
          <p className="mt-6 text-sm text-muted-foreground text-center">
            Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
