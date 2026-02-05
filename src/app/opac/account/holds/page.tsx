"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession, PatronHold } from "@/hooks/use-patron-session";
import { useLibrary } from "@/hooks/use-library";
import { UnoptimizedImage } from "@/components/shared";
import { featureFlags } from "@/lib/feature-flags";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  BookOpen,
  Clock,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowLeft,
  Pause,
  Play,
  X,
  Headphones,
  Smartphone,
  MonitorPlay,
} from "lucide-react";

const formatIcons: Record<string, React.ElementType> = {
  book: BookOpen,
  ebook: Smartphone,
  audiobook: Headphones,
  dvd: MonitorPlay,
};

export default function HoldsPage() {
  const router = useRouter();
  const { library } = useLibrary();
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
      router.push("/opac/login?redirect=/opac/account/holds");
    }
  }, [sessionLoading, isLoggedIn, router]);

  useEffect(() => {
    if (isLoggedIn) {
      setIsLoading(true);
      fetchHolds().finally(() => setIsLoading(false));
    }
  }, [fetchHolds, isLoggedIn]);

  const handleAction = async (
    holdId: number, 
    action: "cancel" | "suspend" | "activate"
  ) => {
    setActionLoading(holdId);
    setMessage(null);
    
    let result;
    switch (action) {
      case "cancel":
        result = await cancelHold(holdId);
        break;
      case "suspend":
        result = await suspendHold(holdId);
        break;
      case "activate":
        result = await activateHold(holdId);
        break;
    }
    
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
    setPickupLoading(true);
    setMessage(null);

    try {
      const res = await changeHoldPickup(pickupHold.id, pickupLocationId);
      setMessage({
        type: res.success ? "success" : "error",
        text: res.message,
      });
      if (res.success) {
        setPickupHold(null);
      }
    } finally {
      setPickupLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  const readyHolds = holds.filter(h => h.status === "ready");
  const inTransitHolds = holds.filter(h => h.status === "in_transit");
  const pendingHolds = holds.filter(h => h.status === "pending");
  const suspendedHolds = holds.filter(h => h.status === "suspended");

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction?.action === "cancel"
            ? "Cancel this hold?"
            : confirmAction?.action === "suspend"
              ? "Suspend this hold?"
              : "Activate this hold?"
        }
        description={
          confirmAction
            ? `${confirmAction.hold.title}${confirmAction.hold.author ? ` by ${confirmAction.hold.author}` : ""}`
            : ""
        }
        confirmText={
          confirmAction?.action === "cancel"
            ? "Cancel hold"
            : confirmAction?.action === "suspend"
              ? "Suspend"
              : "Activate"
        }
        variant={confirmAction?.action === "cancel" ? "destructive" : "default"}
        onConfirm={() => {
          if (!confirmAction) return;
          return handleAction(confirmAction.hold.id, confirmAction.action);
        }}
      />
      <div className="max-w-4xl mx-auto px-4">
        <Link 
          href="/opac/account"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">My Holds</h1>
          <p className="text-muted-foreground">{holds.length} hold{holds.length !== 1 && "s"}</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3
                        ${message.type === "success" 
                          ? "bg-green-50 border border-green-200" 
                          : "bg-red-50 border border-red-200"}`}>
            {message.type === "success" 
              ? <CheckCircle className="h-5 w-5 text-green-600" />
              : <AlertCircle className="h-5 w-5 text-red-600" />
            }
            <p className={message.type === "success" ? "text-green-800" : "text-red-800"}>
              {message.text}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : holds.length === 0 ? (
          <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center">
            <Clock className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No holds</h2>
            <p className="text-muted-foreground mb-6">You don&apos;t have any items on hold.</p>
            <Link
              href="/opac/search"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white 
                       rounded-lg font-medium hover:bg-primary-700 transition-colors"
            >
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Ready for pickup */}
            {readyHolds.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Ready for Pickup ({readyHolds.length})
                </h2>
                <div className="space-y-3">
                  {readyHolds.map((hold) => (
                    <HoldCard 
                      key={hold.id} 
                      hold={hold}
                      onCancel={() => setConfirmAction({ hold, action: "cancel" })}
                      isLoading={actionLoading === hold.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* In Transit */}
            {inTransitHolds.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-blue-700 mb-3 flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  In Transit ({inTransitHolds.length})
                </h2>
                <div className="space-y-3">
                  {inTransitHolds.map((hold) => (
                    <HoldCard 
                      key={hold.id} 
                      hold={hold}
                      onCancel={() => setConfirmAction({ hold, action: "cancel" })}
                      onChangePickup={
                        featureFlags.opacHoldsUXV2 ? () => openChangePickup(hold) : undefined
                      }
                      isLoading={actionLoading === hold.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Pending */}
            {pendingHolds.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground/80 mb-3">
                  Waiting ({pendingHolds.length})
                </h2>
                <div className="space-y-3">
                  {pendingHolds.map((hold) => (
                    <HoldCard 
                      key={hold.id} 
                      hold={hold}
                      onCancel={() => setConfirmAction({ hold, action: "cancel" })}
                      onSuspend={() => setConfirmAction({ hold, action: "suspend" })}
                      onChangePickup={
                        featureFlags.opacHoldsUXV2 ? () => openChangePickup(hold) : undefined
                      }
                      isLoading={actionLoading === hold.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Suspended */}
            {suspendedHolds.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-amber-700 mb-3 flex items-center gap-2">
                  <Pause className="h-5 w-5" />
                  Suspended ({suspendedHolds.length})
                </h2>
                <div className="space-y-3">
                  {suspendedHolds.map((hold) => (
                    <HoldCard 
                      key={hold.id} 
                      hold={hold}
                      onCancel={() => setConfirmAction({ hold, action: "cancel" })}
                      onActivate={() => setConfirmAction({ hold, action: "activate" })}
                      onChangePickup={
                        featureFlags.opacHoldsUXV2 ? () => openChangePickup(hold) : undefined
                      }
                      isLoading={actionLoading === hold.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {pickupHold && featureFlags.opacHoldsUXV2 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl max-w-md w-full shadow-xl border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-2">Change pickup location</h2>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {pickupHold.title}
            </p>

            <label className="block text-sm font-medium text-foreground/80 mb-2">
              New pickup location
            </label>
            <select
              value={pickupLocationId || ""}
              onChange={(e) => setPickupLocationId(parseInt(e.target.value, 10) || null)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={pickupLoading}
            >
              <option value="">Select a location…</option>
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
                className="flex-1 py-2 border border-border rounded-lg text-foreground/80 hover:bg-muted/30 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangePickup}
                disabled={pickupLoading || !pickupLocationId}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {pickupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HoldCard({ 
  hold, 
  onCancel,
  onSuspend,
  onActivate,
  onChangePickup,
  isLoading,
}: { 
  hold: PatronHold; 
  onCancel: () => void;
  onSuspend?: () => void;
  onActivate?: () => void;
  onChangePickup?: () => void;
  isLoading: boolean;
}) {
  const Icon = formatIcons[hold.format] || BookOpen;

  const statusColors: Record<string, string> = {
    ready: "bg-green-100 text-green-800",
    in_transit: "bg-blue-100 text-blue-800",
    pending: "bg-muted/50 text-foreground",
    suspended: "bg-amber-100 text-amber-800",
  };

  const statusLabels: Record<string, string> = {
    ready: "Ready for Pickup",
    in_transit: "In Transit",
    pending: "Waiting",
    suspended: "Suspended",
  };

  return (
    <div className={`bg-card rounded-xl shadow-sm border p-4 flex gap-4
                   ${hold.status === "ready" ? "border-green-200 bg-green-50/50" : "border-border"}`}>
      <div className="w-16 h-24 bg-muted rounded-lg overflow-hidden shrink-0">
        {hold.coverUrl ? (
          <UnoptimizedImage
            src={hold.coverUrl} 
            alt={hold.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/50">
            <Icon className="h-8 w-8 text-muted-foreground/70" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground truncate">{hold.title}</h3>
          <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ${statusColors[hold.status]}`}>
            {statusLabels[hold.status]}
          </span>
        </div>
        
        {hold.author && (
          <p className="text-sm text-muted-foreground truncate">{hold.author}</p>
        )}
        
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {hold.pickupLocationName}
          </span>
          
          {hold.status === "pending" && typeof hold.queuePosition === "number" ? (
            <>
              <span className="text-muted-foreground/70">•</span>
              <span>
                Position {hold.queuePosition}
                {typeof hold.totalHolds === "number" ? ` of ${hold.totalHolds}` : ""}
              </span>
            </>
          ) : hold.status === "pending" && featureFlags.opacHoldsUXV2 ? (
            <>
              <span className="text-muted-foreground/70">•</span>
              <span>Queue position unavailable</span>
            </>
          ) : null}

          {hold.expirationDate && hold.status === "ready" && (
            <>
              <span className="text-muted-foreground/70">•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Pickup by {new Date(hold.expirationDate).toLocaleDateString()}
              </span>
            </>
          )}

          {hold.suspendedUntil && hold.status === "suspended" && (
            <>
              <span className="text-muted-foreground/70">•</span>
              <span>Until {new Date(hold.suspendedUntil).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 shrink-0">
        {onChangePickup && hold.status !== "ready" ? (
          <button
            type="button"
            onClick={onChangePickup}
            disabled={isLoading}
            className="px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted/30 transition-colors disabled:opacity-50"
          >
            Change pickup
          </button>
        ) : null}
        {onActivate && (
          <button type="button"
            onClick={onActivate}
            disabled={isLoading}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium
                     hover:bg-green-700 transition-colors disabled:opacity-50 
                     flex items-center gap-1"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Activate
          </button>
        )}
        {onSuspend && (
          <button type="button"
            onClick={onSuspend}
            disabled={isLoading}
            className="px-3 py-1.5 border border-border rounded-lg text-sm font-medium
                     hover:bg-muted/30 transition-colors disabled:opacity-50 
                     flex items-center gap-1"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            Suspend
          </button>
        )}
        <button type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="px-3 py-1.5 border border-red-300 text-red-700 rounded-lg text-sm font-medium
                   hover:bg-red-50 transition-colors disabled:opacity-50 
                   flex items-center gap-1"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Cancel
        </button>
      </div>
    </div>
  );
}
