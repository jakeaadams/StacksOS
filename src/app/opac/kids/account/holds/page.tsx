"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { featureFlags } from "@/lib/feature-flags";
import { usePatronSession, type PatronHold } from "@/hooks/usePatronSession";
import { useKidsParentGate } from "@/contexts/kids-parent-gate-context";
import { useLibrary } from "@/hooks/useLibrary";
import { UnoptimizedImage } from "@/components/shared";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  Clock,
  Gift,
  Loader2,
  MapPin,
  Pause,
  Play,
  X,
} from "lucide-react";

export default function KidsHoldsPage() {
  const router = useRouter();
  const { library } = useLibrary();
  const gate = useKidsParentGate();
  const {
    isLoggedIn,
    isLoading: sessionLoading,
    holds,
    fetchHolds,
    cancelHold,
    suspendHold,
    activateHold,
    changeHoldPickup,
  } = usePatronSession();

  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    hold: PatronHold;
    action: "cancel" | "suspend" | "activate";
  } | null>(null);

  const [pickupHold, setPickupHold] = useState<PatronHold | null>(null);
  const [pickupLocationId, setPickupLocationId] = useState<number | null>(null);
  const [pickupLoading, setPickupLoading] = useState(false);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/kids/account/holds");
    }
  }, [sessionLoading, isLoggedIn, router]);

  useEffect(() => {
    if (!isLoggedIn) return;
    setIsLoading(true);
    void fetchHolds().finally(() => setIsLoading(false));
  }, [fetchHolds, isLoggedIn]);

  const handleAction = async (hold: PatronHold, action: "cancel" | "suspend" | "activate") => {
    const ok = await gate.requestUnlock({
      reason:
        action === "cancel"
          ? "Cancel a hold"
          : action === "suspend"
            ? "Pause a hold"
            : "Resume a hold",
    });
    if (!ok) {
      setMessage({ type: "error", text: "Parent/guardian PIN required." });
      setTimeout(() => setMessage(null), 4000);
      return;
    }

    setActionLoading(hold.id);
    setMessage(null);

    let result;
    if (action === "cancel") result = await cancelHold(hold.id);
    else if (action === "suspend") result = await suspendHold(hold.id);
    else result = await activateHold(hold.id);

    setMessage({
      type: result.success ? "success" : "error",
      text: result.message,
    });
    setActionLoading(null);
    setTimeout(() => setMessage(null), 5000);
  };

  const pickupLocations = (library?.locations || []).filter((l) => l.isPickupLocation);

  const openChangePickup = (hold: PatronHold) => {
    setPickupHold(hold);
    setPickupLocationId(hold.pickupLocationId);
  };

  const handleChangePickup = async () => {
    if (!pickupHold || !pickupLocationId) return;
    const ok = await gate.requestUnlock({ reason: "Change hold pickup location" });
    if (!ok) {
      setMessage({ type: "error", text: "Parent/guardian PIN required." });
      setTimeout(() => setMessage(null), 4000);
      return;
    }
    setPickupLoading(true);
    setMessage(null);
    try {
      const res = await changeHoldPickup(pickupHold.id, pickupLocationId);
      setMessage({ type: res.success ? "success" : "error", text: res.message });
      if (res.success) setPickupHold(null);
    } finally {
      setPickupLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const readyHolds = useMemo(() => holds.filter((h) => h.status === "ready"), [holds]);
  const inTransitHolds = useMemo(() => holds.filter((h) => h.status === "in_transit"), [holds]);
  const pendingHolds = useMemo(() => holds.filter((h) => h.status === "pending"), [holds]);
  const suspendedHolds = useMemo(() => holds.filter((h) => h.status === "suspended"), [holds]);

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction?.action === "cancel"
            ? "Cancel this hold?"
            : confirmAction?.action === "suspend"
              ? "Pause this hold?"
              : "Resume this hold?"
        }
        description={
          confirmAction
            ? `${confirmAction.hold.title}${confirmAction.hold.author ? ` by ${confirmAction.hold.author}` : ""}`
            : ""
        }
        variant={confirmAction?.action === "cancel" ? "destructive" : "default"}
        confirmText={confirmAction?.action === "cancel" ? "Cancel hold" : confirmAction?.action === "suspend" ? "Pause" : "Resume"}
        onConfirm={() => {
          if (!confirmAction) return;
          return handleAction(confirmAction.hold, confirmAction.action);
        }}
      />

      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground/80 hover:bg-muted/50"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">Books on Hold</h1>
          <p className="text-sm text-muted-foreground">{holds.length} hold{holds.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {message ? (
        <div
          className={`mb-6 rounded-2xl border-2 p-4 flex items-center gap-3 ${
            message.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <Gift className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600" />
          )}
          <p className={message.type === "success" ? "text-green-800 font-medium" : "text-red-800 font-medium"}>
            {message.text}
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
        </div>
      ) : holds.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <Clock className="h-7 w-7 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">No holds yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">When you place a hold, it will show up here.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/opac/kids"
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-purple-500 px-5 py-3 text-white font-bold shadow-md hover:from-sky-600 hover:to-purple-600"
            >
              Find books
            </Link>
            <Link
              href="/opac/kids/account"
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-card px-5 py-3 font-medium hover:bg-muted/50"
            >
              Back
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {readyHolds.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold text-green-700 mb-3 flex items-center gap-2">
                <Gift className="h-5 w-5" />
                Ready to pick up ({readyHolds.length})
              </h2>
              <div className="space-y-3">
                {readyHolds.map((hold) => (
                  <KidsHoldCard
                    key={hold.id}
                    hold={hold}
                    isLoading={actionLoading === hold.id}
                    onCancel={() => setConfirmAction({ hold, action: "cancel" })}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {inTransitHolds.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold text-blue-700 mb-3 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                On the way ({inTransitHolds.length})
              </h2>
              <div className="space-y-3">
                {inTransitHolds.map((hold) => (
                  <KidsHoldCard
                    key={hold.id}
                    hold={hold}
                    isLoading={actionLoading === hold.id}
                    onCancel={() => setConfirmAction({ hold, action: "cancel" })}
                    onChangePickup={featureFlags.opacHoldsUXV2 ? () => openChangePickup(hold) : undefined}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {pendingHolds.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold text-foreground/80 mb-3">Waiting ({pendingHolds.length})</h2>
              <div className="space-y-3">
                {pendingHolds.map((hold) => (
                  <KidsHoldCard
                    key={hold.id}
                    hold={hold}
                    isLoading={actionLoading === hold.id}
                    onCancel={() => setConfirmAction({ hold, action: "cancel" })}
                    onSuspend={() => setConfirmAction({ hold, action: "suspend" })}
                    onChangePickup={featureFlags.opacHoldsUXV2 ? () => openChangePickup(hold) : undefined}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {suspendedHolds.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold text-amber-700 mb-3 flex items-center gap-2">
                <Pause className="h-5 w-5" />
                Paused ({suspendedHolds.length})
              </h2>
              <div className="space-y-3">
                {suspendedHolds.map((hold) => (
                  <KidsHoldCard
                    key={hold.id}
                    hold={hold}
                    isLoading={actionLoading === hold.id}
                    onCancel={() => setConfirmAction({ hold, action: "cancel" })}
                    onActivate={() => setConfirmAction({ hold, action: "activate" })}
                    onChangePickup={featureFlags.opacHoldsUXV2 ? () => openChangePickup(hold) : undefined}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {pickupHold && featureFlags.opacHoldsUXV2 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-3xl max-w-md w-full shadow-xl border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-2">Change pickup library</h2>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{pickupHold.title}</p>

            <label className="block text-sm font-medium text-foreground/80 mb-2">New pickup location</label>
            <select
              value={pickupLocationId || ""}
              onChange={(e) => setPickupLocationId(parseInt(e.target.value, 10) || null)}
              className="w-full px-3 py-2 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-400"
              disabled={pickupLoading}
            >
              <option value="">Select…</option>
              {pickupLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPickupHold(null)}
                disabled={pickupLoading}
                className="flex-1 py-2 rounded-2xl border border-border bg-card font-medium hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangePickup}
                disabled={pickupLoading || !pickupLocationId}
                className="flex-1 py-2 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold shadow-md hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
              >
                {pickupLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KidsHoldCard({
  hold,
  isLoading,
  onCancel,
  onSuspend,
  onActivate,
  onChangePickup,
}: {
  hold: PatronHold;
  isLoading: boolean;
  onCancel: () => void;
  onSuspend?: () => void;
  onActivate?: () => void;
  onChangePickup?: () => void;
}) {
  const statusLabel =
    hold.status === "ready"
      ? "Ready!"
      : hold.status === "in_transit"
        ? "On the way"
        : hold.status === "suspended"
          ? "Paused"
          : "Waiting";

  const statusClasses =
    hold.status === "ready"
      ? "bg-green-100 text-green-800"
      : hold.status === "in_transit"
        ? "bg-blue-100 text-blue-800"
        : hold.status === "suspended"
          ? "bg-amber-100 text-amber-800"
          : "bg-muted/50 text-foreground";

  const expiration = hold.expirationDate ? formatMaybeDate(hold.expirationDate) : null;

  return (
    <div className={`rounded-3xl border-2 bg-card p-4 shadow-sm ${hold.status === "ready" ? "border-green-200 bg-green-50/40" : "border-border"}`}>
      <div className="flex gap-4">
        <Link href={`/opac/kids/record/${hold.recordId}`} className="shrink-0">
          <div className="h-24 w-16 rounded-2xl bg-muted overflow-hidden">
            {hold.coverUrl ? (
              <UnoptimizedImage src={hold.coverUrl} alt={hold.title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-sky-100 to-purple-100">
                <Gift className="h-8 w-8 text-purple-300" />
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/opac/kids/record/${hold.recordId}`} className="min-w-0">
              <h3 className="font-bold text-foreground line-clamp-2 hover:text-purple-700 transition-colors">
                {hold.title}
              </h3>
            </Link>
            <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold ${statusClasses}`}>
              {statusLabel}
            </span>
          </div>
          {hold.author ? <p className="text-sm text-muted-foreground truncate">{hold.author}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {hold.pickupLocationName}
            </span>

            {hold.status === "pending" && typeof hold.queuePosition === "number" ? (
              <>
                <span className="text-muted-foreground/60">•</span>
                <span>
                  #{hold.queuePosition}
                  {typeof hold.totalHolds === "number" ? ` of ${hold.totalHolds}` : ""}
                </span>
              </>
            ) : hold.status === "pending" && featureFlags.opacHoldsUXV2 ? (
              <>
                <span className="text-muted-foreground/60">•</span>
                <span>Queue position unknown</span>
              </>
            ) : null}

            {hold.status === "ready" && expiration ? (
              <>
                <span className="text-muted-foreground/60">•</span>
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-4 w-4" />
                  Pick up by {expiration}
                </span>
              </>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onChangePickup && hold.status !== "ready" ? (
              <button
                type="button"
                onClick={onChangePickup}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted/50 disabled:opacity-50"
              >
                <MapPin className="h-4 w-4" />
                Change pickup
              </button>
            ) : null}

            {onActivate ? (
              <button
                type="button"
                onClick={onActivate}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Resume
              </button>
            ) : null}

            {onSuspend ? (
              <button
                type="button"
                onClick={onSuspend}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted/50 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                Pause
              </button>
            ) : null}

            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-300 bg-card px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMaybeDate(value: string): string {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
