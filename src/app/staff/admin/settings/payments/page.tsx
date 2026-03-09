"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchWithAuth } from "@/lib/client-fetch";
import { useApi } from "@/hooks";
import { PageContainer, PageContent, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Shield,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentGateway = "stripe" | "square" | "paypal";

interface PaymentSettingsResponse {
  ok: boolean;
  provider: string;
  publicKey: string;
  secretKeyConfigured: boolean;
  secretKeyLast4: string;
  webhookSecretConfigured: boolean;
  mode: "test" | "live";
  currency: string;
  minimumAmount: number;
  allowPartialPayment: boolean;
  customization: {
    statementDescriptor: string;
    supportEmail: string;
    receiptMessage: string;
  };
}

interface FormState {
  enabled: boolean;
  gateway: PaymentGateway;
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  // Square fields
  squareAccessToken: string;
  squareLocationId: string;
  squareEnvironment: "sandbox" | "production";
  // PayPal fields
  paypalClientId: string;
  paypalClientSecret: string;
  paypalEnvironment: "sandbox" | "live";
  // Common fields
  currency: string;
  minimumAmount: string;
  allowPartialPayment: boolean;
  statementDescriptor: string;
  supportEmail: string;
  receiptMessage: string;
}

const CURRENCIES = [
  { value: "usd", label: "USD — US Dollar" },
  { value: "cad", label: "CAD — Canadian Dollar" },
  { value: "gbp", label: "GBP — British Pound" },
  { value: "eur", label: "EUR — Euro" },
  { value: "aud", label: "AUD — Australian Dollar" },
];

const GATEWAY_OPTIONS: { value: PaymentGateway; label: string }[] = [
  { value: "stripe", label: "Stripe" },
  { value: "square", label: "Square" },
  { value: "paypal", label: "PayPal" },
];

function resolveGateway(provider: string | undefined): PaymentGateway {
  if (provider === "square" || provider === "paypal") return provider;
  return "stripe";
}

function initialForm(data: PaymentSettingsResponse | null): FormState {
  const gateway = resolveGateway(data?.provider);
  return {
    enabled: data?.provider !== undefined && data.provider !== "none",
    gateway,
    publicKey: data?.publicKey || "",
    secretKey: "",
    webhookSecret: "",
    squareAccessToken: "",
    squareLocationId: "",
    squareEnvironment: "sandbox",
    paypalClientId: "",
    paypalClientSecret: "",
    paypalEnvironment: "sandbox",
    currency: data?.currency || "usd",
    minimumAmount: data ? String(data.minimumAmount / 100) : "1.00",
    allowPartialPayment: data?.allowPartialPayment ?? true,
    statementDescriptor: data?.customization?.statementDescriptor || "",
    supportEmail: data?.customization?.supportEmail || "",
    receiptMessage: data?.customization?.receiptMessage || "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaymentSettingsPage() {
  const [form, setForm] = useState<FormState>(() => initialForm(null));
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    mode?: string;
    error?: string;
  } | null>(null);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showSquareAccessToken, setShowSquareAccessToken] = useState(false);
  const [showPaypalClientSecret, setShowPaypalClientSecret] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const { data, isLoading, refetch } = useApi<PaymentSettingsResponse>(
    "/api/admin/payment-settings",
    { immediate: true }
  );

  useEffect(() => {
    if (!data || isInitialized) return;
    setForm(initialForm(data));
    setIsInitialized(true);
  }, [data, isInitialized]);

  const patch = (updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const isTestMode =
    form.gateway === "stripe" &&
    (form.publicKey.startsWith("pk_test") || (!form.publicKey && data?.mode === "test"));

  const isSquareSandbox = form.gateway === "square" && form.squareEnvironment === "sandbox";
  const isPaypalSandbox = form.gateway === "paypal" && form.paypalEnvironment === "sandbox";

  const showTestBadge = form.enabled && (isTestMode || isSquareSandbox || isPaypalSandbox);
  const testBadgeLabel =
    isTestMode || isSquareSandbox || isPaypalSandbox ? "Test Mode" : "Live Mode";

  // ---------------------------------------------------------------------------
  // Validate Stripe secret key
  // ---------------------------------------------------------------------------

  const handleValidate = async () => {
    const key = form.secretKey.trim();
    if (!key) {
      toast.error("Please enter a secret key to validate.");
      return;
    }
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await fetchWithAuth("/api/admin/payment-settings/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretKey: key }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(String(json?.error || "Validation request failed"));
      }
      setValidationResult(json);
      if (json.valid) {
        toast.success(`Key is valid (${json.mode} mode).`);
      } else {
        toast.error(json.error || "Key is invalid.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to validate key.");
    } finally {
      setIsValidating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Save settings
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const minimumCents = Math.round(parseFloat(form.minimumAmount || "0") * 100);
      if (Number.isNaN(minimumCents) || minimumCents < 0) {
        toast.error("Minimum payment must be a valid dollar amount.");
        return;
      }

      const provider = form.enabled ? form.gateway : "none";

      const res = await fetchWithAuth("/api/admin/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          currency: form.currency,
          minimumAmount: minimumCents,
          allowPartialPayment: form.allowPartialPayment,
          customization: {
            statementDescriptor: form.statementDescriptor.trim() || undefined,
            supportEmail: form.supportEmail.trim() || undefined,
            receiptMessage: form.receiptMessage.trim() || undefined,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(String(json?.error || "Failed to save payment settings."));
      }
      toast.success("Payment settings saved.");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save payment settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Payment Processing"
        subtitle="Configure online fine and fee payment processing for patrons."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Settings", href: "/staff/admin/settings" },
          { label: "Payment Processing" },
        ]}
      />

      <PageContent className="space-y-6">
        {/* Info card */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Payment Gateway Configuration
            </CardTitle>
            <CardDescription>
              Accept credit/debit card payments for fines and fees directly from the OPAC. Select a
              payment gateway and configure its credentials below.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            StacksOS handles payment state independently and writes back to Evergreen when
            transactions settle. No Evergreen schema changes required.
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Payment Provider */}
            <Card className="rounded-2xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Payment Provider</CardTitle>
                    <CardDescription>
                      Enable or disable online payments for your library.
                    </CardDescription>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) => patch({ enabled: checked })}
                    aria-label="Enable payment processing"
                  />
                </div>
              </CardHeader>
              {form.enabled && (
                <CardContent className="space-y-4">
                  {/* Gateway selector */}
                  <div className="space-y-1.5">
                    <Label htmlFor="gateway">Gateway</Label>
                    <Select
                      value={form.gateway}
                      onValueChange={(value) => patch({ gateway: value as PaymentGateway })}
                    >
                      <SelectTrigger id="gateway">
                        <SelectValue placeholder="Select gateway" />
                      </SelectTrigger>
                      <SelectContent>
                        {GATEWAY_OPTIONS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {showTestBadge && (
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={testBadgeLabel === "Test Mode" ? "outline" : "default"}
                        className={
                          testBadgeLabel === "Test Mode"
                            ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"
                            : "bg-green-100 dark:bg-green-950/20 text-green-700 dark:text-green-300"
                        }
                      >
                        {testBadgeLabel}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {testBadgeLabel === "Test Mode"
                          ? "Using test/sandbox credentials — no real charges will be made."
                          : "Using live credentials — real charges will be processed."}
                      </span>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {form.enabled && (
              <>
                {/* ----- Stripe API Keys ----- */}
                {form.gateway === "stripe" && (
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Stripe API Keys
                      </CardTitle>
                      <CardDescription>
                        Your keys are stored securely as environment variables and never exposed to
                        the browser or logged.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Publishable key */}
                      <div className="space-y-1.5">
                        <Label htmlFor="publishable-key">Publishable Key</Label>
                        <Input
                          id="publishable-key"
                          value={form.publicKey}
                          onChange={(e) => patch({ publicKey: e.target.value })}
                          placeholder="pk_test_..."
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Starts with <code>pk_test_</code> or <code>pk_live_</code>. This key is
                          safe to embed in client-side code.
                        </p>
                      </div>

                      {/* Secret key */}
                      <div className="space-y-1.5">
                        <Label htmlFor="secret-key">Secret Key</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="secret-key"
                              type={showSecretKey ? "text" : "password"}
                              value={form.secretKey}
                              onChange={(e) => {
                                patch({ secretKey: e.target.value });
                                setValidationResult(null);
                              }}
                              placeholder={
                                data?.secretKeyConfigured
                                  ? `Configured (••••${data.secretKeyLast4})`
                                  : "sk_test_..."
                              }
                              className="font-mono text-sm pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecretKey(!showSecretKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              tabIndex={-1}
                            >
                              {showSecretKey ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleValidate}
                            disabled={isValidating || !form.secretKey.trim()}
                            className="gap-2 shrink-0"
                          >
                            {isValidating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4" />
                            )}
                            Validate
                          </Button>
                        </div>
                        {data?.secretKeyConfigured && !form.secretKey && (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Secret key is configured (ends in {data.secretKeyLast4}). Enter a new
                            key to change it.
                          </p>
                        )}
                        {validationResult && (
                          <p
                            className={`text-xs flex items-center gap-1 ${
                              validationResult.valid ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {validationResult.valid ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" />
                                Valid {validationResult.mode} mode key
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-3 w-3" />
                                {validationResult.error || "Invalid key"}
                              </>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Webhook secret */}
                      <div className="space-y-1.5">
                        <Label htmlFor="webhook-secret">Webhook Secret</Label>
                        <div className="relative">
                          <Input
                            id="webhook-secret"
                            type={showWebhookSecret ? "text" : "password"}
                            value={form.webhookSecret}
                            onChange={(e) => patch({ webhookSecret: e.target.value })}
                            placeholder={
                              data?.webhookSecretConfigured ? "Configured (••••)" : "whsec_..."
                            }
                            className="font-mono text-sm pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showWebhookSecret ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          From Stripe Dashboard &rarr; Developers &rarr; Webhooks. Required for
                          server-side payment confirmation.
                        </p>
                        {data?.webhookSecretConfigured && !form.webhookSecret && (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Webhook secret is configured.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ----- Square Credentials ----- */}
                {form.gateway === "square" && (
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Square Credentials
                      </CardTitle>
                      <CardDescription>
                        Your credentials are stored securely as environment variables and never
                        exposed to the browser or logged.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Access Token */}
                      <div className="space-y-1.5">
                        <Label htmlFor="square-access-token">Access Token</Label>
                        <div className="relative">
                          <Input
                            id="square-access-token"
                            type={showSquareAccessToken ? "text" : "password"}
                            value={form.squareAccessToken}
                            onChange={(e) => patch({ squareAccessToken: e.target.value })}
                            placeholder="EAAAl..."
                            className="font-mono text-sm pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSquareAccessToken(!showSquareAccessToken)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showSquareAccessToken ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          From your{" "}
                          <a
                            href="https://developer.squareup.com/apps"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-4"
                          >
                            Square Developer Dashboard
                          </a>
                          .
                        </p>
                      </div>

                      {/* Location ID */}
                      <div className="space-y-1.5">
                        <Label htmlFor="square-location-id">Location ID</Label>
                        <Input
                          id="square-location-id"
                          value={form.squareLocationId}
                          onChange={(e) => patch({ squareLocationId: e.target.value })}
                          placeholder="L..."
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          The Square location to associate payments with.
                        </p>
                      </div>

                      {/* Environment */}
                      <div className="space-y-1.5">
                        <Label htmlFor="square-environment">Environment</Label>
                        <Select
                          value={form.squareEnvironment}
                          onValueChange={(value) =>
                            patch({ squareEnvironment: value as "sandbox" | "production" })
                          }
                        >
                          <SelectTrigger id="square-environment">
                            <SelectValue placeholder="Select environment" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sandbox">Sandbox</SelectItem>
                            <SelectItem value="production">Production</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ----- PayPal Credentials ----- */}
                {form.gateway === "paypal" && (
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        PayPal Credentials
                      </CardTitle>
                      <CardDescription>
                        Your credentials are stored securely as environment variables and never
                        exposed to the browser or logged.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Client ID */}
                      <div className="space-y-1.5">
                        <Label htmlFor="paypal-client-id">Client ID</Label>
                        <Input
                          id="paypal-client-id"
                          value={form.paypalClientId}
                          onChange={(e) => patch({ paypalClientId: e.target.value })}
                          placeholder="AV..."
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          From your{" "}
                          <a
                            href="https://developer.paypal.com/dashboard/applications"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-4"
                          >
                            PayPal Developer Dashboard
                          </a>
                          .
                        </p>
                      </div>

                      {/* Client Secret */}
                      <div className="space-y-1.5">
                        <Label htmlFor="paypal-client-secret">Client Secret</Label>
                        <div className="relative">
                          <Input
                            id="paypal-client-secret"
                            type={showPaypalClientSecret ? "text" : "password"}
                            value={form.paypalClientSecret}
                            onChange={(e) => patch({ paypalClientSecret: e.target.value })}
                            placeholder="EK..."
                            className="font-mono text-sm pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPaypalClientSecret(!showPaypalClientSecret)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showPaypalClientSecret ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Environment */}
                      <div className="space-y-1.5">
                        <Label htmlFor="paypal-environment">Environment</Label>
                        <Select
                          value={form.paypalEnvironment}
                          onValueChange={(value) =>
                            patch({ paypalEnvironment: value as "sandbox" | "live" })
                          }
                        >
                          <SelectTrigger id="paypal-environment">
                            <SelectValue placeholder="Select environment" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sandbox">Sandbox</SelectItem>
                            <SelectItem value="live">Live</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Payment Options (all providers) */}
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle>Payment Options</CardTitle>
                    <CardDescription>
                      Configure currency, minimum amounts, and partial payment behavior.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="currency">Currency</Label>
                        <Select
                          value={form.currency}
                          onValueChange={(value) => patch({ currency: value })}
                        >
                          <SelectTrigger id="currency">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="minimum-amount">Minimum Payment</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            $
                          </span>
                          <Input
                            id="minimum-amount"
                            value={form.minimumAmount}
                            onChange={(e) => patch({ minimumAmount: e.target.value })}
                            placeholder="1.00"
                            className="pl-7"
                            type="number"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Minimum amount patrons can pay in a single transaction.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2">
                      <div>
                        <p className="font-medium text-sm">Allow Partial Payments</p>
                        <p className="text-xs text-muted-foreground">
                          Let patrons pay part of their balance instead of the full amount.
                        </p>
                      </div>
                      <Switch
                        checked={form.allowPartialPayment}
                        onCheckedChange={(checked) => patch({ allowPartialPayment: checked })}
                        aria-label="Allow partial payments"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Receipt & Branding (all providers) */}
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle>Receipt & Branding</CardTitle>
                    <CardDescription>
                      Customize what appears on card statements, receipts, and payment confirmation
                      emails.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="statement-descriptor">Statement Descriptor</Label>
                        <Input
                          id="statement-descriptor"
                          value={form.statementDescriptor}
                          onChange={(e) =>
                            patch({
                              statementDescriptor: e.target.value.slice(0, 22),
                            })
                          }
                          placeholder="Library Payment"
                          maxLength={22}
                        />
                        <p className="text-xs text-muted-foreground">
                          Appears on patron card statements ({form.statementDescriptor.length}
                          /22 chars). Letters, numbers, and spaces only.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="support-email">Support Email</Label>
                        <Input
                          id="support-email"
                          type="email"
                          value={form.supportEmail}
                          onChange={(e) => patch({ supportEmail: e.target.value })}
                          placeholder="billing@library.org"
                        />
                        <p className="text-xs text-muted-foreground">
                          Shown on payment receipts for payment inquiries.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="receipt-message">Custom Receipt Message</Label>
                      <Textarea
                        id="receipt-message"
                        value={form.receiptMessage}
                        onChange={(e) => patch({ receiptMessage: e.target.value })}
                        placeholder="Thank you for supporting your local library! Your payment helps us serve the community."
                        rows={3}
                        maxLength={500}
                      />
                      <p className="text-xs text-muted-foreground">
                        Appended to payment receipt emails ({form.receiptMessage.length}
                        /500 chars).
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Webhook Endpoint Info (Stripe only) */}
                {form.gateway === "stripe" && (
                  <Card className="rounded-2xl border-dashed">
                    <CardHeader>
                      <CardTitle className="text-base">Webhook Endpoint</CardTitle>
                      <CardDescription>
                        Configure this URL in your Stripe Dashboard under Developers &rarr;
                        Webhooks.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground mb-1">Endpoint URL</p>
                        <code className="text-sm font-mono text-foreground break-all">
                          {typeof window !== "undefined"
                            ? `${window.location.origin}/api/opac/payments/webhook`
                            : "https://your-domain.com/api/opac/payments/webhook"}
                        </code>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">Events to listen for:</p>
                        <ul className="list-disc list-inside text-xs space-y-0.5 ml-1">
                          <li>
                            <code>payment_intent.succeeded</code>
                          </li>
                          <li>
                            <code>payment_intent.payment_failed</code>
                          </li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Save button */}
            <div className="flex justify-end">
              <Button type="button" className="gap-2" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Payment Settings
              </Button>
            </div>
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
