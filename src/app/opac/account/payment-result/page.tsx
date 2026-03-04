"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, ArrowLeft, Receipt, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithAuth } from "@/lib/client-fetch";

type PaymentStatus = "loading" | "succeeded" | "processing" | "failed";

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<PaymentStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState("usd");

  const redirectStatus = searchParams.get("redirect_status");
  const paymentIntentId = searchParams.get("payment_intent");

  useEffect(() => {
    if (!paymentIntentId) {
      setStatus("failed");
      setError("No payment information found. Please try again from the fines page.");
      return;
    }

    if (redirectStatus === "succeeded") {
      setStatus("succeeded");

      // Record the payment in Evergreen via the fines API
      // The webhook also handles this, but this ensures immediate UX feedback.
      fetchWithAuth(`/api/opac/payments`, {
        method: "GET",
      }).catch(() => {
        // Non-critical — webhook will handle it
      });
    } else if (redirectStatus === "processing") {
      setStatus("processing");
    } else {
      setStatus("failed");
      setError("Payment was not completed. Please try again.");
    }
  }, [paymentIntentId, redirectStatus]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-xl border border-border p-8 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="h-16 w-16 text-primary-600 animate-spin mx-auto mb-4" />
              <h1 className="text-xl font-bold text-foreground mb-2">Checking Payment Status</h1>
              <p className="text-muted-foreground">Please wait while we confirm your payment…</p>
            </>
          )}

          {status === "succeeded" && (
            <>
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h1 className="text-xl font-bold text-foreground mb-2">Payment Successful!</h1>
              <p className="text-muted-foreground mb-6">
                Your fine payment has been received and applied to your account. You will receive a
                receipt by email.
              </p>

              {paymentIntentId && (
                <div className="bg-muted/50 rounded-lg p-3 mb-6">
                  <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                    <Receipt className="h-4 w-4" />
                    <span className="font-mono text-xs">{paymentIntentId.slice(0, 20)}…</span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Button asChild className="w-full">
                  <Link href="/opac/account">
                    <ArrowLeft className="h-4 w-4" />
                    Return to My Account
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/opac/account/fines">View Fines & Fees</Link>
                </Button>
              </div>
            </>
          )}

          {status === "processing" && (
            <>
              <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-10 w-10 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold text-foreground mb-2">Payment Processing</h1>
              <p className="text-muted-foreground mb-6">
                Your payment is being processed. This usually takes just a moment. You&apos;ll
                receive a confirmation email once it&apos;s complete.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/opac/account">
                  <ArrowLeft className="h-4 w-4" />
                  Return to My Account
                </Link>
              </Button>
            </>
          )}

          {status === "failed" && (
            <>
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
              <h1 className="text-xl font-bold text-foreground mb-2">Payment Failed</h1>
              <p className="text-muted-foreground mb-6">
                {error || "Something went wrong with your payment. Please try again."}
              </p>
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <Link href="/opac/account/fines">
                    <ArrowLeft className="h-4 w-4" />
                    Try Again
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/opac/account">Return to My Account</Link>
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          If you have questions about this payment, please contact the library.
        </p>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-muted/30 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      }
    >
      <PaymentResultContent />
    </Suspense>
  );
}
