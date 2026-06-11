"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { fetchWithAuth } from "@/lib/client-fetch";

// ---------------------------------------------------------------------------
// TypeScript declarations for PayPal JS SDK (loaded via <script>)
// ---------------------------------------------------------------------------

interface PayPalButtonsConfig {
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
  style?: {
    layout?: "vertical" | "horizontal";
    color?: "gold" | "blue" | "silver" | "white" | "black";
    shape?: "rect" | "pill";
    label?: "paypal" | "checkout" | "buynow" | "pay";
    height?: number;
  };
}

interface PayPalButtonsComponent {
  render(selector: string): Promise<void>;
  close(): Promise<void>;
}

interface PayPalNamespace {
  Buttons(config: PayPalButtonsConfig): PayPalButtonsComponent;
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PayPalPaymentFormProps {
  clientId: string;
  amount: number;
  currency: string;
  intentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// PayPal SDK script loader
// ---------------------------------------------------------------------------

let paypalScriptPromise: Promise<void> | null = null;
let loadedClientId: string | null = null;

function loadPayPalScript(clientId: string, currency: string): Promise<void> {
  // If already loaded with the same client ID, reuse
  if (window.paypal && loadedClientId === clientId) return Promise.resolve();

  // If loading with a different client ID, reset
  if (loadedClientId !== clientId) {
    paypalScriptPromise = null;
  }

  if (paypalScriptPromise) return paypalScriptPromise;

  loadedClientId = clientId;
  paypalScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency.toUpperCase())}`;
    script.onload = () => resolve();
    script.onerror = () => {
      paypalScriptPromise = null;
      loadedClientId = null;
      reject(new Error("Failed to load PayPal SDK"));
    };
    document.head.appendChild(script);
  });

  return paypalScriptPromise;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PayPalPaymentForm({
  clientId,
  amount,
  currency,
  intentId,
  onSuccess,
  onCancel,
}: PayPalPaymentFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonsRef = useRef<PayPalButtonsComponent | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs for callbacks to avoid re-initializing PayPal buttons on every render
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

  // Load SDK and render buttons
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadPayPalScript(clientId, currency);

        if (cancelled || !window.paypal) return;

        const buttons = window.paypal.Buttons({
          createOrder: async () => {
            // The server already created the PayPal order; return its ID
            return intentId;
          },
          onApprove: async (data: { orderID: string }) => {
            setIsProcessing(true);
            setError(null);

            try {
              // Call our server to capture the payment
              const res = await fetchWithAuth("/api/opac/payments/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider: "paypal",
                  intentId: data.orderID,
                }),
              });

              const responseData = await res.json();

              if (!res.ok) {
                throw new Error(responseData?.error || "Payment capture failed.");
              }

              onSuccessRef.current();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
            } finally {
              setIsProcessing(false);
            }
          },
          onCancel: () => {
            onCancelRef.current();
          },
          onError: (err: unknown) => {
            const message =
              err instanceof Error ? err.message : "A PayPal error occurred. Please try again.";
            setError(message);
          },
          style: {
            layout: "vertical",
            color: "blue",
            shape: "rect",
            label: "pay",
            height: 45,
          },
        });

        if (cancelled) return;

        buttonsRef.current = buttons;
        await buttons.render("#paypal-button-container");

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize PayPal");
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (buttonsRef.current) {
        buttonsRef.current.close().catch(() => {});
        buttonsRef.current = null;
      }
    };
  }, [clientId, currency, intentId]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="space-y-6">
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

        {/* Processing overlay */}
        {isProcessing && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Processing payment...</span>
          </div>
        )}

        {/* PayPal Buttons container */}
        <div className="rounded-lg border border-border p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading PayPal...</span>
            </div>
          )}
          <div
            id="paypal-button-container"
            ref={containerRef}
            style={{ minHeight: isLoading ? 0 : 45 }}
          />
        </div>

        {/* Security note */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
          <Lock className="h-3 w-3" />
          <span>Secured by PayPal. Your financial details are never shared with us.</span>
        </div>

        {/* Cancel button */}
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
        </div>
      </div>
    </div>
  );
}
