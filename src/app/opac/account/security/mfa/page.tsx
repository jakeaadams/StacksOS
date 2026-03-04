"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/use-patron-session";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Shield,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type MfaMethod = {
  id: number;
  type: string;
  friendlyName: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type SetupState = "idle" | "qr" | "verify" | "recovery";

export default function MfaPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading } = usePatronSession();

  const [methods, setMethods] = useState<MfaMethod[]>([]);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState<number | null>(null);

  // Setup flow state
  const [setupState, setSetupState] = useState<SetupState>("idle");
  const [setupData, setSetupData] = useState<{
    methodId: number;
    secret: string;
    uri: string;
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/security/mfa");
    }
  }, [sessionLoading, isLoggedIn, router]);

  const fetchMethods = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/opac/mfa");
      const data = await res.json();
      if (res.ok) {
        setMethods(data.methods || []);
        setMfaEnabled(data.enabled ?? false);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchMethods();
  }, [isLoggedIn, fetchMethods]);

  const handleStartSetup = async () => {
    try {
      const res = await fetchWithAuth("/api/opac/mfa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to start MFA setup.");
        return;
      }
      setSetupData(data);
      setSetupState("qr");
    } catch {
      toast.error("Failed to start MFA setup.");
    }
  };

  const handleVerify = async () => {
    if (!setupData || verifyCode.length !== 6) return;
    setIsVerifying(true);
    try {
      const res = await fetchWithAuth("/api/opac/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodId: setupData.methodId, code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Verification failed.");
        return;
      }
      setRecoveryCodes(data.recoveryCodes || []);
      setSetupState("recovery");
      toast.success("Authenticator app enrolled successfully!");
      fetchMethods();
    } catch {
      toast.error("Verification failed.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRevoke = async (methodId: number) => {
    setIsRevoking(methodId);
    try {
      const res = await fetchWithAuth("/api/opac/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodId }),
      });
      if (res.ok) {
        toast.success("MFA method removed.");
        fetchMethods();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to remove MFA method.");
      }
    } catch {
      toast.error("Failed to remove MFA method.");
    } finally {
      setIsRevoking(null);
    }
  };

  const handleCopyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    });
  };

  const handleDownloadRecoveryCodes = () => {
    const blob = new Blob(
      [
        `StacksOS Library - MFA Recovery Codes\n${"=".repeat(40)}\n\n${recoveryCodes.join("\n")}\n\nKeep these codes in a safe place.\nEach code can only be used once.\n`,
      ],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stacksos-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Recovery codes screen (shown once after enrollment)
  // ---------------------------------------------------------------------------

  if (setupState === "recovery") {
    return (
      <div className="min-h-screen bg-muted/30 py-8">
        <div className="max-w-lg mx-auto px-4">
          <div className="stx-surface rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <ShieldCheck className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-foreground">Save Your Recovery Codes</h2>
              <p className="text-sm text-muted-foreground mt-2">
                These codes can be used to access your account if you lose your authenticator app.
                Each code can only be used once.{" "}
                <strong>Save them now — they won&apos;t be shown again.</strong>
              </p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 font-mono text-sm grid grid-cols-2 gap-2">
              {recoveryCodes.map((code, i) => (
                <div key={i} className="px-3 py-1.5 bg-background rounded-lg text-center">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyRecoveryCodes}
                className="flex-1 gap-2"
              >
                {copiedCodes ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedCodes ? "Copied!" : "Copy"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadRecoveryCodes}
                className="flex-1 gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>

            <Button
              type="button"
              onClick={() => {
                setSetupState("idle");
                setSetupData(null);
                setRecoveryCodes([]);
                setVerifyCode("");
              }}
              className="w-full"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // QR code / verification screen
  // ---------------------------------------------------------------------------

  if (setupState === "qr" && setupData) {
    return (
      <div className="min-h-screen bg-muted/30 py-8">
        <div className="max-w-lg mx-auto px-4">
          <div className="stx-surface rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <Shield className="h-10 w-10 text-primary-600 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-foreground">Set Up Authenticator App</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center p-6 bg-white rounded-xl">
              <QRCodeSVG value={setupData.uri} size={200} level="M" />
            </div>

            {/* Manual entry option */}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Can&apos;t scan? Enter code manually
              </summary>
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Secret key:</p>
                <code className="text-sm font-mono break-all select-all">{setupData.secret}</code>
              </div>
            </details>

            {/* Verification input */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Enter the 6-digit code from your app:
              </label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] h-14 font-mono"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSetupState("idle");
                  setSetupData(null);
                  setVerifyCode("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={verifyCode.length !== 6 || isVerifying}
                onClick={handleVerify}
                className="flex-1"
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Verify
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main MFA management view
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Link
          href="/opac/account/settings"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary-600" />
            Two-Factor Authentication
          </h1>
          <p className="text-muted-foreground mt-1">
            Add an extra layer of security to your library account.
          </p>
        </div>

        {!mfaEnabled ? (
          <div className="stx-surface rounded-xl p-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">MFA Not Available</h2>
            <p className="text-muted-foreground">
              Two-factor authentication is not currently configured for this library.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active methods */}
            {methods.length > 0 && (
              <div className="stx-surface rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="font-semibold text-foreground">Active Methods</h2>
                </div>
                <div className="divide-y divide-border/50">
                  {methods.map((method) => (
                    <div key={method.id} className="px-6 py-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <KeyRound className="h-5 w-5 text-green-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{method.friendlyName}</p>
                        <p className="text-sm text-muted-foreground">
                          Added {new Date(method.createdAt).toLocaleDateString()}
                          {method.lastUsedAt && (
                            <>
                              {" "}
                              &middot; Last used {new Date(method.lastUsedAt).toLocaleDateString()}
                            </>
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isRevoking === method.id}
                        onClick={() => handleRevoke(method.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                      >
                        {isRevoking === method.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Set up new method */}
            <div className="stx-surface rounded-xl p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-12 w-12 rounded-xl bg-primary-500/10 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary-700" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Authenticator App</h3>
                  <p className="text-sm text-muted-foreground">
                    Use Google Authenticator, Authy, or any TOTP-compatible app.
                  </p>
                </div>
              </div>
              <Button type="button" onClick={handleStartSetup} className="gap-2">
                <Shield className="h-4 w-4" />
                {methods.length > 0 ? "Set Up Another" : "Set Up Authenticator App"}
              </Button>
            </div>

            {/* Info */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <h3 className="font-semibold text-blue-900 text-sm mb-1">How it works</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>
                  &bull; After entering your card number and PIN, you&apos;ll be asked for a 6-digit
                  code
                </li>
                <li>&bull; Open your authenticator app to get the code</li>
                <li>&bull; If you lose your device, use a recovery code to sign in</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
