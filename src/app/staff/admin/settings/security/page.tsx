"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchWithAuth } from "@/lib/client-fetch";
import { PageContainer, PageContent, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertCircle, Clock, Loader2, Save, Shield, ShieldCheck } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SecuritySettings {
  mfa: {
    secretConfigured: boolean;
    enabled: boolean;
    required: boolean;
    issuer: string;
  };
  sessions: {
    defaultDurationMinutes: number;
    rememberMeDurationMinutes: number;
  };
}

export default function SecuritySettingsPage() {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    fetchWithAuth("/api/admin/security-settings")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          setMfaEnabled(data.mfa?.enabled ?? false);
          setMfaRequired(data.mfa?.required ?? false);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth("/api/admin/security-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaEnabled, mfaRequired: mfaEnabled && mfaRequired }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.settings?.mfa) {
          setSettings((prev) =>
            prev
              ? {
                  ...prev,
                  mfa: data.settings.mfa,
                }
              : prev
          );
        }
        toast.success("Security settings saved.");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || "Failed to save settings.");
      }
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader
          title="Security"
          subtitle="Configure multi-factor authentication and session policies."
          breadcrumbs={[
            { label: "Administration", href: "/staff/admin" },
            { label: "Settings", href: "/staff/admin/settings" },
            { label: "Security" },
          ]}
        />
        <PageContent className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </PageContent>
      </PageContainer>
    );
  }

  const secretConfigured = settings?.mfa?.secretConfigured ?? false;

  return (
    <PageContainer>
      <PageHeader
        title="Security"
        subtitle="Configure multi-factor authentication and session policies."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Settings", href: "/staff/admin/settings" },
          { label: "Security" },
        ]}
        actions={[
          {
            label: "Save",
            onClick: handleSave,
            icon: Save,
            variant: "default",
            disabled: isSaving,
          },
        ]}
      />

      <PageContent className="space-y-6">
        {/* MFA Card */}
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Multi-Factor Authentication (TOTP)</CardTitle>
                  <CardDescription>
                    Allow patrons to secure their accounts with an authenticator app.
                  </CardDescription>
                </div>
              </div>
              <Badge variant={mfaEnabled ? "default" : "secondary"}>
                {mfaEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {!secretConfigured && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl dark:bg-amber-950/20 dark:border-amber-900/50">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200 text-sm">
                    MFA encryption key not configured
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Set{" "}
                    <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-xs">
                      STACKSOS_MFA_SECRET
                    </code>{" "}
                    in your environment (32+ characters) to enable this feature.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-2">
              <div>
                <Label htmlFor="mfa-enabled" className="text-base font-medium">
                  Enable MFA for patrons
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  When enabled, patrons can optionally enroll an authenticator app for two-step
                  login. This preference is saved in tenant config; the encryption secret remains
                  deploy-managed.
                </p>
              </div>
              <Switch
                id="mfa-enabled"
                checked={mfaEnabled}
                onCheckedChange={(checked) => {
                  setMfaEnabled(checked);
                  if (!checked) setMfaRequired(false);
                }}
                disabled={!secretConfigured}
              />
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label
                    htmlFor="mfa-required"
                    className={`text-base font-medium ${!mfaEnabled ? "text-muted-foreground" : ""}`}
                  >
                    Require MFA for all patrons
                  </Label>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Force all patrons to set up two-factor authentication before accessing their
                    account.
                  </p>
                </div>
                <Switch
                  id="mfa-required"
                  checked={mfaRequired}
                  onCheckedChange={setMfaRequired}
                  disabled={!mfaEnabled}
                />
              </div>
            </div>

            {settings?.mfa?.issuer && (
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Issuer name:</strong> {settings.mfa.issuer}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This appears in the patron&apos;s authenticator app. Configure via{" "}
                  <code className="bg-muted px-1 rounded text-xs">STACKSOS_MFA_ISSUER</code> when
                  bootstrapping a tenant or edit the tenant config directly if you need a custom
                  issuer.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session Policies Card */}
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Session Policies</CardTitle>
                <CardDescription>
                  Session durations for patron and staff authentication.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium text-foreground">Default Session</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {settings?.sessions?.defaultDurationMinutes
                    ? `${settings.sessions.defaultDurationMinutes / 60}h`
                    : "2h"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Standard patron login duration</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium text-foreground">Remember Me</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {settings?.sessions?.rememberMeDurationMinutes
                    ? `${settings.sessions.rememberMeDurationMinutes / 60}h`
                    : "24h"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Extended session for &quot;Remember Me&quot;
                </p>
              </div>
            </div>
            <p className="text-xs border-l-2 border-indigo-500 pl-3 bg-indigo-50 dark:bg-indigo-950/20 py-2 rounded-r">
              <strong>Note:</strong> Session durations are configured via environment variables.
              Library patrons on shared public terminals should use short sessions for security.
            </p>
          </CardContent>
        </Card>

        {/* Security Info */}
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Security Overview</CardTitle>
                <CardDescription>
                  Current security posture for this library environment.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "MFA encryption key", ok: secretConfigured },
                { label: "MFA enrollment", ok: mfaEnabled },
                { label: "Patron passkeys (WebAuthn)", ok: true },
                { label: "CSRF protection", ok: true },
                { label: "Rate limiting", ok: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  {item.ok ? (
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  )}
                  <span className="text-sm text-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
