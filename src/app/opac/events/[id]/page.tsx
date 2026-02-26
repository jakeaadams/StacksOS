"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, notFound } from "next/navigation";
import { featureFlags } from "@/lib/feature-flags";
import { usePatronSession } from "@/hooks/use-patron-session";
import {
  ArrowLeft,
  Calendar,
  CalendarPlus,
  Clock,
  Loader2,
  MapPin,
  Users,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { LibraryEvent } from "@/lib/events-data";

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

function generateICalUrl(event: LibraryEvent): string {
  const parseTime = (dateStr: string, timeStr: string): Date => {
    const d = new Date(`${dateStr}T12:00:00`);
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let hours = parseInt(match[1]!, 10);
      const minutes = parseInt(match[2]!, 10);
      const period = match[3]!.toUpperCase();
      if (period === "PM" && hours !== 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      d.setHours(hours, minutes, 0, 0);
    }
    return d;
  };

  const formatICalDate = (d: Date): string => {
    return d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  };

  const start = parseTime(event.date, event.startTime);
  const end = parseTime(event.date, event.endTime);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StacksOS//Events//EN",
    "BEGIN:VEVENT",
    `DTSTART:${formatICalDate(start)}`,
    `DTEND:${formatICalDate(end)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}`,
    `LOCATION:${event.branch}`,
    `UID:${event.id}@stacksos`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const icsContent = lines.join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function EventDetailPage() {
  if (!featureFlags.opacEvents) {
    notFound();
  }

  const params = useParams();
  const router = useRouter();
  const { isLoggedIn } = usePatronSession();
  const eventId = String(params.id || "");

  const [event, setEvent] = useState<EventWithLifecycle | null>(null);
  const [relatedEvents, setRelatedEvents] = useState<EventWithLifecycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [notFoundState, setNotFoundState] = useState(false);

  const fetchEvent = useCallback(async () => {
    if (!eventId) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/opac/events?limit=100`, {
        credentials: "include",
      });
      if (!res.ok) return;

      const data = await res.json();
      const events: EventWithLifecycle[] = Array.isArray(data.events) ? data.events : [];
      const found = events.find((e) => e.id === eventId);
      if (!found) {
        setNotFoundState(true);
        return;
      }
      setEvent(found);

      // Related events: same type or same branch, excluding current
      const related = events
        .filter((e) => e.id !== eventId && (e.type === found.type || e.branch === found.branch))
        .slice(0, 3);
      setRelatedEvents(related);
    } catch {
      // Ignore fetch errors
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetchEvent();
  }, [fetchEvent]);

  const mutateRegistration = useCallback(
    async (payload: Record<string, any>) => {
      if (!isLoggedIn) {
        router.push(`/opac/login?redirect=/opac/events/${eventId}`);
        return;
      }
      setIsBusy(true);
      try {
        const res = await fetch("/api/opac/events/registrations", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => null);

        if (res.status === 401) {
          router.push(`/opac/login?redirect=/opac/events/${eventId}`);
          return;
        }

        if (!res.ok || data?.ok === false) {
          toast.error(String(data?.error || `Request failed (${res.status})`));
          return;
        }

        toast.success(String(data?.message || "Event registration updated."));
        await fetchEvent();
      } catch {
        toast.error("Unable to update event registration right now.");
      } finally {
        setIsBusy(false);
      }
    },
    [eventId, fetchEvent, isLoggedIn, router]
  );

  const registration = event?.registration;
  const viewerStatus = registration?.viewerStatus || null;
  const isRegistered = viewerStatus === "registered";
  const isWaitlisted = viewerStatus === "waitlisted";
  const capacity = registration?.capacity ?? null;
  const registeredCount = registration?.registeredCount ?? 0;
  const waitlistedCount = registration?.waitlistedCount ?? 0;
  const isAtCapacity = capacity !== null ? registeredCount >= capacity : false;
  const spotsLeft = capacity !== null ? Math.max(0, capacity - registeredCount) : null;
  const fillPercent =
    capacity !== null && capacity > 0 ? Math.round((registeredCount / capacity) * 100) : 0;
  const reminderValue = (registration?.viewerReminderChannel || "email") as ReminderChannel;

  const iCalUrl = useMemo(() => (event ? generateICalUrl(event) : null), [event]);

  if (notFoundState) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white py-8 md:py-10">
        <div className="max-w-4xl mx-auto px-4">
          <nav className="flex items-center gap-2 text-sm text-primary-200 mb-4">
            <Link href="/opac" className="hover:text-white transition-colors">
              Catalog
            </Link>
            <span>/</span>
            <Link
              href="/opac/events"
              className="hover:text-white transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Events
            </Link>
            <span>/</span>
            <span className="text-white">{isLoading ? "Loading..." : event?.title || "Event"}</span>
          </nav>
          {!isLoading && event ? (
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/10 rounded-lg mt-1">
                <Calendar className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">{event.title}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge className="bg-white/20 text-white border-0">{event.type}</Badge>
                  <Badge className="bg-white/20 text-white border-0">{event.ageGroup}</Badge>
                  {isRegistered ? (
                    <Badge className="bg-emerald-500/80 text-white border-0">Registered</Badge>
                  ) : null}
                  {isWaitlisted ? (
                    <Badge className="bg-amber-500/80 text-white border-0">
                      Waitlist #{registration?.viewerWaitlistPosition ?? "-"}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : event ? (
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Description */}
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">About this Event</h2>
                <p className="text-muted-foreground leading-relaxed">{event.description}</p>
              </section>

              {/* Details */}
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Details</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-primary-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Date</p>
                      <p className="text-sm text-muted-foreground">{formatFullDate(event.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-primary-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Time</p>
                      <p className="text-sm text-muted-foreground">
                        {event.startTime} - {event.endTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-primary-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Location</p>
                      <p className="text-sm text-muted-foreground">{event.branch}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <User className="h-5 w-5 text-primary-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Age Group</p>
                      <p className="text-sm text-muted-foreground">{event.ageGroup}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Related Events */}
              {relatedEvents.length > 0 ? (
                <section className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Related Events</h2>
                  <div className="space-y-3">
                    {relatedEvents.map((related) => (
                      <Link
                        key={related.id}
                        href={`/opac/events/${related.id}`}
                        className="block rounded-lg border border-border p-4 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{related.title}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {formatFullDate(related.date)} &middot; {related.startTime} &middot;{" "}
                              {related.branch}
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {related.type}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Capacity card */}
              {capacity !== null ? (
                <div className="bg-card rounded-xl border border-border p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Capacity</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Registered</span>
                      <span className="font-medium">
                        {registeredCount} / {capacity}
                      </span>
                    </div>
                    <Progress value={fillPercent} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {spotsLeft === 0
                          ? "Full"
                          : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
                      </span>
                      {waitlistedCount > 0 ? <span>{waitlistedCount} waitlisted</span> : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Registration action */}
              <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Registration</h3>

                {isRegistered || isWaitlisted ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      {isRegistered
                        ? "You are registered for this event."
                        : `You are on the waitlist (position #${registration?.viewerWaitlistPosition ?? "-"}).`}
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Reminder preference
                      </label>
                      <Select
                        value={reminderValue}
                        onValueChange={(value) =>
                          void mutateRegistration({
                            action: "update_reminders",
                            eventId: event.id,
                            reminderChannel: value,
                          })
                        }
                        disabled={isBusy}
                      >
                        <SelectTrigger className="w-full text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Off</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="both">Email + SMS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      onClick={() =>
                        void mutateRegistration({
                          action: "cancel",
                          eventId: event.id,
                        })
                      }
                      variant="destructive"
                      className="w-full"
                      disabled={isBusy}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {isWaitlisted ? "Leave Waitlist" : "Cancel Registration"}
                    </Button>
                  </>
                ) : event.registrationRequired ? (
                  isLoggedIn ? (
                    <Button
                      onClick={() =>
                        void mutateRegistration({
                          action: "register",
                          eventId: event.id,
                          reminderChannel: "email",
                        })
                      }
                      className="stx-action-primary w-full"
                      disabled={isBusy}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {isAtCapacity ? "Join Waitlist" : "Register"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => router.push(`/opac/login?redirect=/opac/events/${eventId}`)}
                      variant="secondary"
                      className="w-full"
                    >
                      Log in to register
                    </Button>
                  )
                ) : (
                  <div className="space-y-3">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium rounded-full">
                      Drop-in - No registration required
                    </span>
                    {isLoggedIn ? (
                      <Button
                        onClick={() =>
                          void mutateRegistration({
                            action: "register",
                            eventId: event.id,
                            reminderChannel: "email",
                          })
                        }
                        variant="outline"
                        className="w-full"
                        disabled={isBusy}
                      >
                        {isBusy ? "Saving..." : "Save to My Events"}
                      </Button>
                    ) : null}
                  </div>
                )}

                {!isRegistered && !isWaitlisted && isAtCapacity && capacity !== null ? (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium text-center">
                    This event is at capacity
                  </p>
                ) : null}
              </div>

              {/* Add to Calendar */}
              {iCalUrl ? (
                <div className="bg-card rounded-xl border border-border p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Add to Calendar</h3>
                  <Button variant="outline" className="w-full" asChild>
                    <a href={iCalUrl} download={`${event.id}.ics`}>
                      <CalendarPlus className="h-4 w-4 mr-2" />
                      Download .ics File
                    </a>
                  </Button>
                </div>
              ) : null}

              {/* Info */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Quick Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>{event.ageGroup}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{event.branch}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      {event.startTime} - {event.endTime}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
