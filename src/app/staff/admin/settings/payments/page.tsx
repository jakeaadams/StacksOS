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
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
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

function initialForm(data: PaymentSettingsResponse | null): FormState {
  return {
    enabled: data?.provider === "stripe",
    publicKey: data?.publicKey || "",
    secretKey: "",
    webhookSecret: "",
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
    form.publicKey.startsWith("pk_test") || (!form.publicKey && data?.mode === "test");

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

      const res = await fetchWithAuth("/api/admin/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.enabled ? "stripe" : "none",
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
        subtitle="Configure Stripe for online fine and fee payments from patrons."
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
              Stripe Payment Gateway
            </CardTitle>
            <CardDescription>
              Accept credit/debit card payments for fines and fees directly from the OPAC. API keys
              come from your{" "}
              <a
                href="https://dashboard.stripe.com/apikeys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4"
              >
                Stripe Dashboard
              </a>
              .
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
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={isTestMode ? "outline" : "default"}
                      className={
                        isTestMode
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "bg-green-100 text-green-700"
                      }
                    >
                      {isTestMode ? "Test Mode" : "Live Mode"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {isTestMode
                        ? "Using test API keys — no real charges will be made."
                        : "Using live API keys — real charges will be processed."}
                    </span>
                  </div>
                </CardContent>
              )}
            </Card>

            {form.enabled && (
              <>
                {/* Stripe API Keys */}
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
                        Starts with <code>pk_test_</code> or <code>pk_live_</code>. This key is safe
                        to embed in client-side code.
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
                          Secret key is configured (ends in {data.secretKeyLast4}). Enter a new key
                          to change it.
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

                {/* Payment Options */}
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

                {/* Receipt & Branding */}
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
                          Shown on Stripe receipts for payment inquiries.
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

                {/* Webhook Endpoint Info */}
                <Card className="rounded-2xl border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base">Webhook Endpoint</CardTitle>
                    <CardDescription>
                      Configure this URL in your Stripe Dashboard under Developers &rarr; Webhooks.
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
