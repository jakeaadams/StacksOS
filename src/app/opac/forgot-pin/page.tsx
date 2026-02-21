"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/hooks/use-library";
import {
  KeyRound,
  CreditCard,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Loader2,
  HelpCircle,
  Mail,
} from "lucide-react";
import { useTranslations } from "next-intl";

type Step = "request" | "success";

export default function ForgotPinPage() {
  const t = useTranslations("forgotPin");
  const { library } = useLibrary();
  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim()) {
      setError("Please enter your library card number or username");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetchWithAuth("/api/opac/forgot-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMaskedEmail(data.maskedEmail || "your registered email");
        setStep("success");
      } else {
        setError(data.error || "Unable to process your request. Please try again.");
      }
    } catch (_error) {
      setError("Unable to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back link */}
        <Link
          href="/opac/login"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>

        {/* Main card */}
        <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
          {step === "request" && (
            <>
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-2xl mb-4">
                  <KeyRound className="h-8 w-8 text-primary-600" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">Forgot your PIN?</h1>
                <p className="text-muted-foreground mt-2">
                  Enter your library card number and we will send reset instructions to your email.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <p id="forgot-pin-error" role="alert" className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="identifier" className="block text-sm font-medium text-foreground/80 mb-2">
                    Library Card Number or Username
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
                    <input
                      type="text"
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={t("cardNumberPlaceholder")}
                      className="w-full pl-14 pr-4 py-3 border border-border rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                               text-foreground placeholder:text-muted-foreground"
                      aria-invalid={!!error}
                      aria-describedby={error ? "forgot-pin-error" : undefined}
                      autoFocus
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    We will send reset instructions to the email address on your account.
                  </p>
                </div>

                <button type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-primary-600 text-white rounded-lg font-medium
                           hover:bg-primary-700 transition-colors disabled:opacity-50 
                           disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-5 w-5" />
                      Send Reset Instructions
                    </>
                  )}
                </button>
              </form>

              {/* No email note */}
              <div className="mt-6 p-4 border border-amber-200 bg-amber-50 rounded-lg">
                <h2 className="font-medium text-amber-800 text-sm">No email on file?</h2>
                <p className="text-sm text-amber-700 mt-1">
                  If you don&apos;t have an email address on your account, 
                  please visit or call your local library branch to reset your PIN.
                </p>
              </div>
            </>
          )}

          {step === "success" && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Check your email</h2>
              <p className="text-muted-foreground mb-6">
                We&apos;ve sent PIN reset instructions to <strong>{maskedEmail}</strong>.
              </p>
              <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground mb-6 text-left">
                <p className="mb-2 font-medium">Didn&apos;t receive the email?</p>
                <ul className="space-y-1">
                  <li>• Check your spam or junk folder</li>
                  <li>• Make sure you entered the correct card number</li>
                  <li>• Wait a few minutes and try again</li>
                </ul>
              </div>
              <div className="space-y-3">
                <button type="button"
                  onClick={() => {
                    setStep("request");
                    setIdentifier("");
                    setError(null);
                  }}
                  className="w-full py-3 border border-border text-foreground/80 rounded-lg font-medium
                           hover:bg-muted/30 transition-colors"
                >
                  Try Again
                </button>
                <Link
                  href="/opac/login"
                  className="block w-full py-3 bg-primary-600 text-white rounded-lg font-medium
                           hover:bg-primary-700 transition-colors text-center"
                >
                  Return to Sign In
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Help section */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
            <HelpCircle className="h-4 w-4" />
            <span>Still need help?</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Contact your library at{" "}
            {library?.phone ? (
              <a href={`tel:${library.phone}`} className="text-primary-600 hover:underline">
                {library.phone}
              </a>
            ) : (
              "your local branch"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
