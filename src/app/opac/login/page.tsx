"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/usePatronSession";
import { useLibrary } from "@/hooks/useLibrary";
import {
  BookOpen,
  CreditCard,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoggedIn, isLoading: sessionLoading, error: sessionError } = usePatronSession();
  const { library } = useLibrary();

  const [cardNumber, setCardNumber] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const redirectUrl = searchParams.get("redirect") || "/opac/account";

  // Redirect if already logged in
  useEffect(() => {
    if (isLoggedIn && !sessionLoading) {
      router.push(redirectUrl);
    }
  }, [isLoggedIn, sessionLoading, router, redirectUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cardNumber.trim()) {
      setError("Please enter your library card number");
      return;
    }

    if (!pin.trim()) {
      setError("Please enter your PIN");
      return;
    }

    setIsLoading(true);

    try {
      const success = await login(cardNumber.trim(), pin.trim());
      
      if (success) {
        router.push(redirectUrl);
      } else {
        setError(sessionError || "Invalid card number or PIN. Please try again.");
      }
    } catch (_error) {
      setError("Unable to connect to the library system. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 
                  flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 
                        rounded-2xl shadow-lg mb-4">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {library?.name || "Library"} Account
          </h1>
          <p className="text-muted-foreground mt-2">
            Sign in to manage your checkouts, holds, and more
          </p>
        </div>

        {/* Login card */}
        <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Card number field */}
            <div>
              <label 
                htmlFor="cardNumber" 
                className="block text-sm font-medium text-foreground/80 mb-2"
              >
                Library Card Number
              </label>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
                <input
                  type="text"
                  id="cardNumber"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="Enter your card number"
                  className="w-full pl-14 pr-4 py-3 border border-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           text-foreground placeholder:text-muted-foreground"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* PIN field */}
            <div>
              <label 
                htmlFor="pin" 
                className="block text-sm font-medium text-foreground/80 mb-2"
              >
                PIN
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
                <input
                  type={showPin ? "text" : "password"}
                  id="pin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter your PIN"
                  className="w-full pl-14 pr-12 py-3 border border-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           text-foreground placeholder:text-muted-foreground"
                  autoComplete="current-password"
                />
                <button type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 
                           hover:text-muted-foreground transition-colors"
                  aria-label={showPin ? "Hide PIN" : "Show PIN"}
                >
                  {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-border text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-foreground/80">Remember me</span>
              </label>
              <Link 
                href="/opac/help/forgot-pin"
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Forgot your PIN?
              </Link>
            </div>

            {/* Submit button */}
            <button type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-primary-600 text-white rounded-lg font-medium
                       hover:bg-primary-700 transition-colors disabled:opacity-50 
                       disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-card text-muted-foreground">New to the library?</span>
            </div>
          </div>

          {/* Get a card link */}
          <Link
            href="/opac/register"
            className="block w-full py-3 border-2 border-primary-600 text-primary-600 
                     rounded-lg font-medium text-center hover:bg-primary-50 transition-colors"
          >
            Get a Library Card
          </Link>
        </div>

        {/* Help text */}
        <div className="mt-6 text-center">
          <Link 
            href="/opac/help"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm"
          >
            <HelpCircle className="h-4 w-4" />
            Need help signing in?
          </Link>
        </div>

        {/* Privacy note */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          By signing in, you agree to our{" "}
          <Link href="/opac/privacy" className="text-primary-600 hover:underline">
            Privacy Policy
          </Link>
          {" "}and{" "}
          <Link href="/opac/terms" className="text-primary-600 hover:underline">
            Terms of Use
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function OPACLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
