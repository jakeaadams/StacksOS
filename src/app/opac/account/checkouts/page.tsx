"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession, PatronCheckout } from "@/hooks/usePatronSession";
import {
  BookOpen,
  RefreshCw,
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowLeft,
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

export default function CheckoutsPage() {
  const router = useRouter();
  const { 
    isLoggedIn, 
    isLoading: sessionLoading,
    checkouts,
    fetchCheckouts,
    renewItem,
    renewAll,
  } = usePatronSession();

  const [isLoading, setIsLoading] = useState(false);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [renewAllLoading, setRenewAllLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/checkouts");
    }
  }, [sessionLoading, isLoggedIn, router]);

  useEffect(() => {
    if (isLoggedIn) {
      setIsLoading(true);
      fetchCheckouts().finally(() => setIsLoading(false));
    }
  }, [isLoggedIn]);

  const handleRenew = async (checkoutId: number) => {
    setRenewingId(checkoutId);
    setMessage(null);
    
    const result = await renewItem(checkoutId);
    
    setMessage({
      type: result.success ? "success" : "error",
      text: result.message,
    });
    
    setRenewingId(null);
    
    // Clear message after 5 seconds
    setTimeout(() => setMessage(null), 5000);
  };

  const handleRenewAll = async () => {
    setRenewAllLoading(true);
    setMessage(null);
    
    const result = await renewAll();
    
    setMessage({
      type: result.success ? "success" : "error",
      text: result.success 
        ? `Successfully renewed ${result.renewed} item${result.renewed !== 1 ? "s" : ""}`
        : `Renewed ${result.renewed}, failed to renew ${result.failed}`,
    });
    
    setRenewAllLoading(false);
    setTimeout(() => setMessage(null), 5000);
  };

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  const overdueItems = checkouts.filter(c => c.isOverdue);
  const currentItems = checkouts.filter(c => !c.isOverdue);

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Back link */}
        <Link 
          href="/opac/account"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Checkouts</h1>
            <p className="text-muted-foreground">{checkouts.length} item{checkouts.length !== 1 && "s"} checked out</p>
          </div>
          {checkouts.length > 0 && (
            <button type="button"
              onClick={handleRenewAll}
              disabled={renewAllLoading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium
                       hover:bg-primary-700 transition-colors disabled:opacity-50 
                       flex items-center gap-2"
            >
              {renewAllLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Renew All
            </button>
          )}
        </div>

        {/* Message */}
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
        ) : checkouts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-border p-12 text-center">
            <BookOpen className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No checkouts</h2>
            <p className="text-muted-foreground mb-6">You don&apos;t have any items checked out right now.</p>
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
            {/* Overdue items */}
            {overdueItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Overdue ({overdueItems.length})
                </h2>
                <div className="space-y-3">
                  {overdueItems.map((item) => (
                    <CheckoutCard 
                      key={item.id} 
                      checkout={item}
                      onRenew={() => handleRenew(item.id)}
                      isRenewing={renewingId === item.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Current items */}
            {currentItems.length > 0 && (
              <div>
                {overdueItems.length > 0 && (
                  <h2 className="text-lg font-semibold text-foreground mb-3">
                    Current ({currentItems.length})
                  </h2>
                )}
                <div className="space-y-3">
                  {currentItems.map((item) => (
                    <CheckoutCard 
                      key={item.id} 
                      checkout={item}
                      onRenew={() => handleRenew(item.id)}
                      isRenewing={renewingId === item.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckoutCard({ 
  checkout, 
  onRenew, 
  isRenewing 
}: { 
  checkout: PatronCheckout; 
  onRenew: () => void;
  isRenewing: boolean;
}) {
  const Icon = formatIcons[checkout.format] || BookOpen;
  const canRenew = checkout.renewals < checkout.maxRenewals;

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 flex gap-4
                   ${checkout.isOverdue ? "border-red-200 bg-red-50/50" : "border-border"}`}>
      {/* Cover */}
      <div className="w-16 h-24 bg-muted rounded-lg overflow-hidden shrink-0">
        {checkout.coverUrl ? (
          <img 
            src={checkout.coverUrl} 
            alt={checkout.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/50">
            <Icon className="h-8 w-8 text-muted-foreground/70" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground truncate">{checkout.title}</h3>
        {checkout.author && (
          <p className="text-sm text-muted-foreground truncate">{checkout.author}</p>
        )}
        
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span className={`flex items-center gap-1 
                         ${checkout.isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
            <Calendar className="h-4 w-4" />
            {checkout.isOverdue ? "OVERDUE - " : "Due "}
            {checkout.dueDate}
          </span>
          
          <span className="text-muted-foreground/70">•</span>
          
          <span className="text-muted-foreground">
            {checkout.renewals}/{checkout.maxRenewals} renewals used
          </span>
        </div>
      </div>

      {/* Renew button */}
      <div className="shrink-0">
        <button type="button"
          onClick={onRenew}
          disabled={!canRenew || isRenewing}
          className="px-4 py-2 border border-border rounded-lg text-sm font-medium
                   hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center gap-2"
        >
          {isRenewing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {canRenew ? "Renew" : "Max renewals"}
        </button>
      </div>
    </div>
  );
}
