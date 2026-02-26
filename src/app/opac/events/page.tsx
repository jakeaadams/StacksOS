"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { featureFlags } from "@/lib/feature-flags";
import { useLibrary } from "@/hooks/use-library";
import { usePatronSession } from "@/hooks/use-patron-session";
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
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { LibraryEvent } from "@/lib/events-data";
import { useTranslations } from "next-intl";

type ViewMode = "list" | "week" | "month";
type ReminderChannel = "none" | "email" | "sms" | "both";

type EventRegistrationSnapshot = {
  required: boolean;
  capacity: number | null;
  registeredCount: number;
  waitlistedCount: number;
  viewerStatus: "registered" | "waitlisted" | "canceled" | null;
  viewerWaitlistPosition: number | null;
  viewerReminderChannel: ReminderChannel | null;
  viewerReminderScheduledFor: string | null;
};

type EventWithLifecycle = LibraryEvent & {
  registration?: EventRegistrationSnapshot;
};

const AGE_GROUP_COLORS: Record<string, string> = {
  "All Ages": "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  Kids: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  Teens: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  Adults: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  Seniors: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  Storytime: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  "Book Club": "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  "Tech Help": "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  Workshop: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  "Author Visit": "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  Teen: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  Kids: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  Adult: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
};

function formatEventDate(dateStr: string): {
  monthAbbr: string;
  day: string;
} {
  const date = new Date(dateStr + "T12:00:00");
  return {
    monthAbbr: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: date.getDate().toString(),
  };
}

function formatReminderTime(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EventCard({
  event,
  isLoggedIn,
  isBusy,
  onRequireLogin,
  onRegister,
  onCancel,
  onReminderChange,
}: {
  event: EventWithLifecycle;
  isLoggedIn: boolean;
  isBusy: boolean;
  onRequireLogin: () => void;
  onRegister: (eventId: string) => void;
  onCancel: (eventId: string) => void;
  onReminderChange: (eventId: string, channel: ReminderChannel) => void;
}) {
  const t = useTranslations("eventsPage");
  const dateInfo = formatEventDate(event.date);

  const registration = event.registration;
  const viewerStatus = registration?.viewerStatus || null;
  const isRegistered = viewerStatus === "registered";
  const isWaitlisted = viewerStatus === "waitlisted";

  const capacity = registration?.capacity;
  const isAtCapacity =
    typeof capacity === "number" ? registration!.registeredCount >= capacity : false;

  const reminderValue = (registration?.viewerReminderChannel || "email") as ReminderChannel;
  const reminderTime = formatReminderTime(registration?.viewerReminderScheduledFor || null);

  return (
    <div className="flex gap-4 md:gap-6 p-4 md:p-6 bg-card rounded-xl border border-border hover:shadow-md transition-shadow">
      <div className="shrink-0 w-16 md:w-20 text-center">
        <div className="stx-action-primary text-xs font-bold rounded-t-lg py-1 px-2">
          {dateInfo.monthAbbr}
        </div>
        <div className="bg-muted border border-t-0 border-border rounded-b-lg py-2 px-2">
          <span className="text-2xl md:text-3xl font-bold text-foreground">{dateInfo.day}</span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          <h3 className="text-lg font-semibold text-foreground">{event.title}</h3>
          <Badge
            className={`text-xs ${EVENT_TYPE_COLORS[event.type] || "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300"}`}
            variant="secondary"
          >
            {event.type}
          </Badge>
          <Badge
            className={`text-xs ${AGE_GROUP_COLORS[event.ageGroup] || "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300"}`}
            variant="secondary"
          >
            {event.ageGroup}
          </Badge>
          {isRegistered ? (
            <Badge className="text-xs bg-emerald-100 text-emerald-800" variant="secondary">
              Registered
            </Badge>
          ) : null}
          {isWaitlisted ? (
            <Badge className="text-xs bg-amber-100 text-amber-800" variant="secondary">
              Waitlist #{registration?.viewerWaitlistPosition ?? "-"}
            </Badge>
          ) : null}
        </div>

        <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{event.description}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {event.startTime} - {event.endTime}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {event.branch}
          </span>
          {registration?.capacity !== null && registration ? (
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" />
              {t("spotsLeft", {
                available: Math.max(0, (registration.capacity || 0) - registration.registeredCount),
                capacity: registration.capacity || 0,
              })}
            </span>
          ) : event.spotsAvailable !== undefined ? (
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" />
              {t("spotsLeft", {
                available: event.spotsAvailable ?? 0,
                capacity: event.capacity ?? 0,
              })}
            </span>
          ) : null}
          {registration?.waitlistedCount ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              Waitlist: {registration.waitlistedCount}
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-2 justify-between">
        {isRegistered || isWaitlisted ? (
          <>
            <div className="w-[170px]">
              <label className="text-[11px] text-muted-foreground mb-1 block">Reminder</label>
              <Select
                value={reminderValue}
                onValueChange={(value) => onReminderChange(event.id, value as ReminderChannel)}
                disabled={isBusy}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Off</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Email + SMS</SelectItem>
                </SelectContent>
              </Select>
              {reminderTime ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Next: {reminderTime}</p>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={() => onCancel(event.id)}
              variant="destructive"
              className="min-w-[136px] whitespace-nowrap"
              disabled={isBusy}
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isWaitlisted ? (
                "Leave Waitlist"
              ) : (
                "Cancel"
              )}
            </Button>
          </>
        ) : event.registrationRequired ? (
          isLoggedIn ? (
            <Button
              type="button"
              onClick={() => onRegister(event.id)}
              className="stx-action-primary min-w-[136px] whitespace-nowrap disabled:opacity-60"
              disabled={isBusy}
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isAtCapacity ? (
                "Join Waitlist"
              ) : (
                "Register"
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onRequireLogin}
              variant="secondary"
              className="whitespace-nowrap"
            >
              Log in to register
            </Button>
          )
        ) : (
          <>
            <span className="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium rounded-full">
              Drop-in
            </span>
            {isLoggedIn ? (
              <Button
                type="button"
                onClick={() => onRegister(event.id)}
                variant="outline"
                size="sm"
                className="whitespace-nowrap disabled:opacity-60"
                disabled={isBusy}
              >
                {isBusy ? "Saving..." : "Save to My Events"}
              </Button>
            ) : null}
          </>
        )}

        {registration?.capacity !== null &&
        registration &&
        !isRegistered &&
        !isWaitlisted &&
        isAtCapacity ? (
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">At capacity</span>
        ) : null}
      </div>
    </div>
  );
}

function WeekView({
  events,
  isLoggedIn,
  busyEventId,
  onRequireLogin,
  onRegister,
  onCancel,
  onReminderChange,
}: {
  events: EventWithLifecycle[];
  isLoggedIn: boolean;
  busyEventId: string | null;
  onRequireLogin: () => void;
  onRegister: (eventId: string) => void;
  onCancel: (eventId: string) => void;
  onReminderChange: (eventId: string, channel: ReminderChannel) => void;
}) {
  const today = new Date();
  const days: { date: string; label: string; events: EventWithLifecycle[] }[] = [];

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
      date: dateStr!,
      label,
      events: events.filter((event) => event.date === dateStr),
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
                <EventCard
                  key={event.id}
                  event={event}
                  isLoggedIn={isLoggedIn}
                  isBusy={busyEventId === event.id}
                  onRequireLogin={onRequireLogin}
                  onRegister={onRegister}
                  onCancel={onCancel}
                  onReminderChange={onReminderChange}
                />
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

function MonthView({ events }: { events: EventWithLifecycle[] }) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startPadding = firstDay.getDay();

  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const eventsByDate = new Map<string, EventWithLifecycle[]>();
  events.forEach((event) => {
    const existing = eventsByDate.get(event.date) || [];
    existing.push(event);
    eventsByDate.set(event.date, existing);
  });

  const cells: { day: number | null; dateStr: string; events: EventWithLifecycle[] }[] = [];

  for (let i = 0; i < startPadding; i++) {
    cells.push({ day: null, dateStr: "", events: [] });
  }

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
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="bg-muted p-2 text-center text-xs font-semibold text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {cells.map((cell, index) => (
          <div
            key={index}
            className={`bg-card p-2 min-h-[80px] ${
              cell.day === today.getDate() && currentMonth === today.getMonth()
                ? "ring-2 ring-primary-500 ring-inset"
                : ""
            }`}
          >
            {cell.day ? (
              <>
                <span className="text-sm font-medium text-foreground">{cell.day}</span>
                <div className="mt-1 space-y-0.5">
                  {cell.events.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className="text-xs truncate px-1 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                      title={`${event.title} - ${event.startTime}`}
                    >
                      {event.title}
                    </div>
                  ))}
                  {cell.events.length > 2 ? (
                    <span className="text-xs text-muted-foreground">
                      +{cell.events.length - 2} more
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EventsPage() {
  if (!featureFlags.opacEvents) {
    notFound();
  }

  const t = useTranslations("eventsPage");
  const router = useRouter();
  const { library } = useLibrary();
  const { isLoggedIn } = usePatronSession();

  const [events, setEvents] = useState<EventWithLifecycle[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [eventsSource, setEventsSource] = useState<"mock" | "none">("none");
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filterBranch && filterBranch !== "all") params.set("branch", filterBranch);
      if (filterType && filterType !== "all") params.set("type", filterType);

      const res = await fetch(`/api/opac/events?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) return;

      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
      setBranches(Array.isArray(data.branches) ? data.branches : []);
      setTypes(Array.isArray(data.types) ? data.types : []);
      setEventsSource(data?.source === "mock" ? "mock" : "none");
    } catch {
      // Ignore list-fetch errors; page stays interactive.
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
      (event) =>
        event.title.toLowerCase().includes(term) ||
        event.description.toLowerCase().includes(term) ||
        event.branch.toLowerCase().includes(term)
    );
  }, [events, searchTerm]);

  const requireLogin = useCallback(() => {
    router.push("/opac/login?redirect=/opac/events");
  }, [router]);

  const mutateRegistration = useCallback(
    async (payload: Record<string, any>) => {
      const eventId = String(payload.eventId || "");
      if (!eventId) return;
      if (!isLoggedIn) {
        requireLogin();
        return;
      }

      setBusyEventId(eventId);
      try {
        const res = await fetch("/api/opac/events/registrations", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => null);

        if (res.status === 401) {
          requireLogin();
          return;
        }

        if (!res.ok || data?.ok === false) {
          toast.error(String(data?.error || `Request failed (${res.status})`));
          return;
        }

        toast.success(String(data?.message || "Event registration updated."));
        await fetchEvents();
      } catch {
        toast.error("Unable to update event registration right now.");
      } finally {
        setBusyEventId(null);
      }
    },
    [fetchEvents, isLoggedIn, requireLogin]
  );

  const handleRegister = useCallback(
    async (eventId: string) => {
      await mutateRegistration({
        action: "register",
        eventId,
        reminderChannel: "email",
      });
    },
    [mutateRegistration]
  );

  const handleCancel = useCallback(
    async (eventId: string) => {
      await mutateRegistration({
        action: "cancel",
        eventId,
      });
    },
    [mutateRegistration]
  );

  const handleReminderChange = useCallback(
    async (eventId: string, reminderChannel: ReminderChannel) => {
      await mutateRegistration({
        action: "update_reminders",
        eventId,
        reminderChannel,
      });
    },
    [mutateRegistration]
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <Link
              href="/opac"
              className="text-primary-200 hover:text-white transition-colors text-sm inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Catalog
            </Link>
            {isLoggedIn ? (
              <Link
                href="/opac/account/events"
                className="text-xs md:text-sm rounded-full border border-white/30 px-3 py-1.5 bg-white/10 hover:bg-white/20"
              >
                My Event Registrations
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/10 rounded-lg">
              <CalendarDays className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">{t("title")}</h1>
          </div>
          <p className="text-primary-100 text-lg max-w-2xl">
            {t("discoverEvents")} {library?.name || "your library"}.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {!isLoading && eventsSource === "none" ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Events are not configured for this library yet. Ask staff to connect a real events
            source.
          </div>
        ) : null}

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label={t("searchEvents")}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">{t("filters")}:</span>
            </div>

            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("allBranches")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allBranches")}</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    {branch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("allTypes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTypes")}</SelectItem>
                {types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
            className="ml-auto"
          >
            <TabsList>
              <TabsTrigger value="list" className="gap-1.5">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">{t("list")}</span>
              </TabsTrigger>
              <TabsTrigger value="week" className="gap-1.5">
                <CalendarDays className="h-4 w-4" />
                <span className="hidden sm:inline">{t("week")}</span>
              </TabsTrigger>
              <TabsTrigger value="month" className="gap-1.5">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">{t("month")}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

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
            <h2 className="text-xl font-semibold text-foreground mb-2">{t("noEventsFound")}</h2>
            <p className="text-muted-foreground">
              {searchTerm || filterBranch !== "all" || filterType !== "all"
                ? t("tryAdjustingFilters")
                : t("checkBackSoon")}
            </p>
          </div>
        ) : (
          <>
            {viewMode === "list" ? (
              <div className="space-y-4">
                {filteredEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isLoggedIn={isLoggedIn}
                    isBusy={busyEventId === event.id}
                    onRequireLogin={requireLogin}
                    onRegister={handleRegister}
                    onCancel={handleCancel}
                    onReminderChange={handleReminderChange}
                  />
                ))}
              </div>
            ) : null}

            {viewMode === "week" ? (
              <WeekView
                events={filteredEvents}
                isLoggedIn={isLoggedIn}
                busyEventId={busyEventId}
                onRequireLogin={requireLogin}
                onRegister={handleRegister}
                onCancel={handleCancel}
                onReminderChange={handleReminderChange}
              />
            ) : null}

            {viewMode === "month" ? <MonthView events={filteredEvents} /> : null}
          </>
        )}

        {!isLoading && filteredEvents.length > 0 ? (
          <p className="mt-6 text-sm text-muted-foreground text-center">
            {t("showingEvents", { count: filteredEvents.length })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
