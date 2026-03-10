"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, CreditCard, Loader2, Lock } from "lucide-react";
import { fetchWithAuth } from "@/lib/client-fetch";

// ---------------------------------------------------------------------------
// TypeScript declarations for Square Web Payments SDK (loaded via <script>)
// ---------------------------------------------------------------------------

interface SquareTokenizeResult {
  status: "OK" | "ERROR";
  token?: string;
  errors?: Array<{ message: string }>;
}

interface SquareCard {
  attach(selector: string): Promise<void>;
  tokenize(): Promise<SquareTokenizeResult>;
  destroy(): Promise<void>;
}

interface SquarePayments {
  card(): Promise<SquareCard>;
}

interface SquareSDK {
  payments(applicationId: string, locationId: string): SquarePayments;
}

declare global {
  interface Window {
    Square?: SquareSDK;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SquarePaymentFormProps {
  applicationId: string;
  locationId: string;
  amount: number;
  currency: string;
  intentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Square SDK script loader
// ---------------------------------------------------------------------------

function getSquareScriptUrl(applicationId: string): string {
  // Sandbox keys start with "sandbox-"
  return applicationId.startsWith("sandbox-")
    ? "https://sandbox.web.squarecdn.com/v1/square.js"
    : "https://web.squarecdn.com/v1/square.js";
}

let squareScriptPromise: Promise<void> | null = null;

function loadSquareScript(applicationId: string): Promise<void> {
  if (window.Square) return Promise.resolve();
  if (squareScriptPromise) return squareScriptPromise;

  squareScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = getSquareScriptUrl(applicationId);
    script.onload = () => resolve();
    script.onerror = () => {
      squareScriptPromise = null;
      reject(new Error("Failed to load Square Web Payments SDK"));
    };
    document.head.appendChild(script);
  });

  return squareScriptPromise;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SquarePaymentForm({
  applicationId,
  locationId,
  amount,
  currency,
  intentId,
  onSuccess,
  onCancel,
}: SquarePaymentFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const cardRef = useRef<SquareCard | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load SDK and initialize card
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadSquareScript(applicationId);

        if (cancelled || !window.Square) return;

        const payments = window.Square.payments(applicationId, locationId);
        const card = await payments.card();

        if (cancelled) {
          await card.destroy();
          return;
        }

        await card.attach("#square-card-container");
        cardRef.current = card;
        setSdkReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize Square payments");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (cardRef.current) {
        cardRef.current.destroy().catch(() => {});
        cardRef.current = null;
      }
    };
  }, [applicationId, locationId]);

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!cardRef.current || isProcessing) return;

      setIsProcessing(true);
      setError(null);

      try {
        // Tokenize the card
        const result = await cardRef.current.tokenize();

        if (result.status !== "OK" || !result.token) {
          const errMsg =
            result.errors?.[0]?.message ||
            "Card tokenization failed. Please check your card details.";
          setError(errMsg);
          setIsProcessing(false);
          return;
        }

        // Send the token to our server to complete the payment
        const res = await fetchWithAuth("/api/opac/payments/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "square",
            intentId,
            token: result.token,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Payment failed. Please try again.");
        }

        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    },
    [intentId, isProcessing, onSuccess]
  );

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Amount display */}
        <div className="text-center p-4 bg-muted/50 rounded-xl">
          <p className="text-sm text-muted-foreground">Payment Amount</p>
          <p className="text-3xl font-bold text-foreground">{formattedAmount}</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Square Card Element */}
        <div className="rounded-lg border border-border p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading payment form...</span>
            </div>
          )}
          <div
            id="square-card-container"
            ref={containerRef}
            style={{ minHeight: isLoading ? 0 : 90 }}
          />
        </div>

        {/* Security note */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
          <Lock className="h-3 w-3" />
          <span>Secured by Square. Your card details are never stored on our servers.</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!sdkReady || isProcessing} className="flex-1">
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Pay {formattedAmount}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
