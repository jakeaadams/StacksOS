"use client";

import { useCallback, useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { AlertCircle, CreditCard, Loader2, Lock } from "lucide-react";

// Lazily initialize the Stripe promise — key comes from the payment config API.
let stripePromise: ReturnType<typeof loadStripe> | null = null;

function getStripePromise(publishableKey: string) {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

/** Reset the Stripe promise if the key changes (e.g., switching test/live). */
export function resetStripePromise() {
  stripePromise = null;
}

// ---------------------------------------------------------------------------
// Inner payment form (must be inside <Elements>)
// ---------------------------------------------------------------------------

interface CheckoutFormProps {
  amount: number;
  currency: string;
  onCancel: () => void;
  returnUrl: string;
}

function CheckoutForm({ amount, currency, onCancel, returnUrl }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;

      setIsProcessing(true);
      setError(null);

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
      });

      // If confirmPayment returns, it means there was an error
      // (on success, Stripe redirects to return_url)
      if (result.error) {
        setError(result.error.message || "Payment failed. Please try again.");
      }

      setIsProcessing(false);
    },
    [stripe, elements, returnUrl]
  );

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Amount display */}
      <div className="text-center p-4 bg-muted/50 rounded-xl">
        <p className="text-sm text-muted-foreground">Payment Amount</p>
        <p className="text-3xl font-bold text-foreground">{formattedAmount}</p>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Stripe Payment Element */}
      <div className="rounded-lg border border-border p-4">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {/* Security note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
        <Lock className="h-3 w-3" />
        <span>Secured by Stripe. Your card details are never stored on our servers.</span>
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
        <Button type="submit" disabled={!stripe || !elements || isProcessing} className="flex-1">
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing…
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
  );
}

// ---------------------------------------------------------------------------
// Outer wrapper that initializes Stripe Elements
// ---------------------------------------------------------------------------

export interface PaymentFormProps {
  publishableKey: string;
  clientSecret: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PaymentForm({
  publishableKey,
  clientSecret,
  amount,
  currency,
  onCancel,
}: PaymentFormProps) {
  const stripe = getStripePromise(publishableKey);
  const returnUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/opac/account/payment-result`;

  return (
    <div className="w-full max-w-md mx-auto">
      <Elements
        stripe={stripe}
        options={{
          clientSecret,
          appearance: {
            theme: "stripe",
            variables: {
              colorPrimary: "#2563eb",
              borderRadius: "8px",
            },
          },
        }}
      >
        <CheckoutForm
          amount={amount}
          currency={currency}
          onCancel={onCancel}
          returnUrl={returnUrl}
        />
      </Elements>
    </div>
  );
}
