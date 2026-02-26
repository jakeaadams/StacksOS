"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePatronSession } from "@/hooks/use-patron-session";
import { Loader2, ArrowLeft, CalendarDays, Clock, MapPin, Bell, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ReminderChannel = "none" | "email" | "sms" | "both";

type RegistrationEvent = {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  branch: string;
  registrationRequired: boolean;
};

type RegistrationRecord = {
  id: number;
  eventId: string;
  status: "registered" | "waitlisted" | "canceled";
  waitlistPosition: number | null;
  reminderChannel: ReminderChannel;
  reminderScheduledFor: string | null;
  updatedAt: string;
  event: RegistrationEvent | null;
};

type HistoryRecord = {
  id: number;
  eventId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AccountEventsPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading } = usePatronSession();

  const [isLoading, setIsLoading] = useState(true);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/events");
    }
  }, [sessionLoading, isLoggedIn, router]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(
        "/api/opac/events/registrations?includeCanceled=true&history=true&historyLimit=30",
        {
          credentials: "include",
        }
      );

      if (res.status === 401) {
        router.push("/opac/login?redirect=/opac/account/events");
        return;
      }

      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        toast.error(String(data?.error || "Failed to load event registrations"));
        return;
      }

      setRegistrations(Array.isArray(data.registrations) ? data.registrations : []);
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      toast.error("Failed to load event registrations");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!sessionLoading && isLoggedIn) {
      void loadData();
    }
  }, [isLoggedIn, loadData, sessionLoading]);

  const mutate = useCallback(
    async (payload: Record<string, any>) => {
      const eventId = String(payload.eventId || "");
      if (!eventId) return;
      setBusyEventId(eventId);
      try {
        const res = await fetch("/api/opac/events/registrations", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || data?.ok === false) {
          toast.error(String(data?.error || `Request failed (${res.status})`));
          return;
        }

        toast.success(String(data?.message || "Updated"));
        await loadData();
      } catch {
        toast.error("Unable to update registration");
      } finally {
        setBusyEventId(null);
      }
    },
    [loadData]
  );

  const active = useMemo(
    () => registrations.filter((registration) => registration.status === "registered"),
    [registrations]
  );
  const waitlisted = useMemo(
    () => registrations.filter((registration) => registration.status === "waitlisted"),
    [registrations]
  );
  const canceled = useMemo(
    () => registrations.filter((registration) => registration.status === "canceled"),
    [registrations]
  );

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-5xl mx-auto px-4 space-y-6">
        <Link
          href="/opac/account"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </Link>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Event Registrations</h1>
            <p className="text-muted-foreground">Manage registrations, waitlists, and reminders.</p>
          </div>
          <Button onClick={() => void loadData()} variant="outline" size="sm" disabled={isLoading}>
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Registered ({active.length})
              </h2>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active event registrations.</p>
              ) : (
                active.map((registration) => (
                  <div
                    key={registration.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {registration.event?.title || registration.eventId}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          <span className="inline-flex items-center gap-1 mr-3">
                            <CalendarDays className="h-4 w-4" />
                            {registration.event?.date || "Date TBD"}
                          </span>
                          <span className="inline-flex items-center gap-1 mr-3">
                            <Clock className="h-4 w-4" />
                            {registration.event?.startTime || ""} -{" "}
                            {registration.event?.endTime || ""}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {registration.event?.branch || "Library"}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                          <Bell className="h-3.5 w-3.5" />
                          Reminder: {registration.reminderChannel}
                          {registration.reminderScheduledFor
                            ? ` (next ${formatDate(registration.reminderScheduledFor)})`
                            : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Select
                          value={registration.reminderChannel}
                          onValueChange={(value) => {
                            void mutate({
                              action: "update_reminders",
                              eventId: registration.eventId,
                              reminderChannel: value,
                            });
                          }}
                        >
                          <SelectTrigger
                            className="h-8 w-[140px] text-xs"
                            disabled={busyEventId === registration.eventId}
                          >
                            <SelectValue placeholder="Reminder channel" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Reminders off</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                            <SelectItem value="both">Email + SMS</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() =>
                            void mutate({
                              action: "cancel",
                              eventId: registration.eventId,
                            })
                          }
                          variant="destructive"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={busyEventId === registration.eventId}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Waitlist ({waitlisted.length})
              </h2>
              {waitlisted.length === 0 ? (
                <p className="text-sm text-muted-foreground">No waitlisted events.</p>
              ) : (
                waitlisted.map((registration) => (
                  <div
                    key={registration.id}
                    className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">
                          {registration.event?.title || registration.eventId}
                        </p>
                        <p className="text-sm text-amber-800">
                          Waitlist position #{registration.waitlistPosition || "-"}
                        </p>
                      </div>
                      <Button
                        onClick={() =>
                          void mutate({ action: "cancel", eventId: registration.eventId })
                        }
                        variant="secondary"
                        size="sm"
                        className="h-8 bg-amber-700 text-white hover:bg-amber-800"
                        disabled={busyEventId === registration.eventId}
                      >
                        Leave waitlist
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Recently Canceled ({canceled.length})
              </h2>
              {canceled.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent cancellations.</p>
              ) : (
                canceled.slice(0, 10).map((registration) => (
                  <div
                    key={registration.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">
                          {registration.event?.title || registration.eventId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Canceled {formatDate(registration.updatedAt)}
                        </p>
                      </div>
                      <Button
                        onClick={() =>
                          void mutate({
                            action: "register",
                            eventId: registration.eventId,
                            reminderChannel: "email",
                          })
                        }
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={busyEventId === registration.eventId}
                      >
                        Re-register
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <div className="rounded-xl border border-border bg-card divide-y">
                  {history.slice(0, 10).map((entry) => (
                    <div
                      key={entry.id}
                      className="px-4 py-3 text-sm flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-medium text-foreground">{entry.action}</span>
                        <span className="text-muted-foreground"> on {entry.eventId}</span>
                        {entry.fromStatus || entry.toStatus ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({entry.fromStatus || "-"} {"->"} {entry.toStatus || "-"})
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
