"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePatronSession } from "@/hooks/use-patron-session";
import {
  User,
  Mail,
  Phone,
  Bell,
  Lock,
  Shield,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface PatronSettings {
  email?: string;
  phone?: string;
  smsNumber?: string;
  smsCarrier?: string;
  holdNotifyEmail: boolean;
  holdNotifySms: boolean;
  holdNotifyPhone: boolean;
  overdueNotifyEmail: boolean;
  defaultPickupLocation?: number;
  defaultSearchLocation?: number;
  keepHistory: boolean;
  personalizedRecommendations?: boolean;
  readingHistoryPersonalization?: boolean;
}

export default function AccountSettingsPage() {
  const _t = useTranslations("settingsPage");
  const router = useRouter();
  const { patron, isLoggedIn, isLoading: sessionLoading } = usePatronSession();

  const [settings, setSettings] = useState<PatronSettings>({
    holdNotifyEmail: true,
    holdNotifySms: false,
    holdNotifyPhone: false,
    overdueNotifyEmail: true,
    keepHistory: false,
    personalizedRecommendations: false,
    readingHistoryPersonalization: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "notifications" | "privacy">("profile");

  // PIN change state
  const [showPinChange, setShowPinChange] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPins, setShowPins] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetchWithAuth("/api/opac/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings((prev) => data.settings || prev);
      }
    } catch (err: unknown) {
      clientLogger.error("Error fetching settings:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/settings");
      return;
    }

    if (isLoggedIn) {
      void fetchSettings();
    }
  }, [fetchSettings, isLoggedIn, router, sessionLoading]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSaveSuccess(false);

      const response = await fetchWithAuth("/api/opac/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save settings");
      }
    } catch {
      setError("Unable to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePinChange = async () => {
    setPinError(null);
    setPinSuccess(false);

    if (!currentPin) {
      setPinError("Please enter your current PIN");
      return;
    }

    if (!newPin || newPin.length < 4) {
      setPinError("New PIN must be at least 4 characters");
      return;
    }

    if (newPin !== confirmPin) {
      setPinError("New PINs do not match");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetchWithAuth("/api/opac/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });

      if (response.ok) {
        setPinSuccess(true);
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
        setShowPinChange(false);
        setTimeout(() => setPinSuccess(false), 3000);
      } else {
        const data = await response.json();
        setPinError(data.error || "Failed to change PIN");
      }
    } catch {
      setPinError("Unable to change PIN. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (sessionLoading || isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Link
            href="/opac/account"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your profile, notifications, and privacy preferences.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card border-b">
        <div className="max-w-3xl mx-auto px-4">
          <nav className="flex gap-8">
            {[
              { id: "profile", label: "Profile", icon: User },
              { id: "notifications", label: "Notifications", icon: Bell },
              { id: "privacy", label: "Privacy & Security", icon: Shield },
            ].map((tab: any) => (
              <Button
                type="button"
                variant="ghost"
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`h-auto items-center gap-2 rounded-none border-b-2 px-0 py-4 text-sm font-medium transition-colors
                  ${
                    activeTab === tab.id
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Success/Error messages */}
        {saveSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-green-700">Settings saved successfully!</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Contact Information</h2>

            <div className="space-y-4">
              {/* Name (read-only) */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-foreground/80 mb-1">
                  Name
                </label>
                <div className="px-4 py-3 bg-muted/30 rounded-lg text-foreground/80">
                  {patron?.firstName} {patron?.lastName}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Contact your library to update your name.
                </p>
              </div>

              {/* Card Number (read-only) */}
              <div>
                <label
                  htmlFor="library-card"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Library Card
                </label>
                <div className="px-4 py-3 bg-muted/30 rounded-lg text-foreground/80 font-mono">
                  {patron?.cardNumber || ""}
                </div>
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email-address"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
                  <Input
                    id="email-address"
                    type="email"
                    value={settings.email || ""}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="h-11 rounded-lg border-border pl-14 pr-4"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor="phone-number"
                  className="block text-sm font-medium text-foreground/80 mb-1"
                >
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
                  <Input
                    id="phone-number"
                    type="tel"
                    value={settings.phone || ""}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="h-11 rounded-lg border-border pl-14 pr-4"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="items-center gap-2 px-6"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-6">Notification Preferences</h2>

            <div className="space-y-6">
              {/* Hold notifications */}
              <div>
                <h3 className="font-medium text-foreground mb-3">Hold Ready Notifications</h3>
                <div className="space-y-3">
                  <label
                    htmlFor="email-me-when-holds-are-ready"
                    className="flex items-center gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={settings.holdNotifyEmail}
                      onChange={(e) =>
                        setSettings({ ...settings, holdNotifyEmail: e.target.checked })
                      }
                      className="rounded border-border text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-foreground/80">Email me when holds are ready</span>
                  </label>
                  <label htmlFor="call-me-when-holds-are-ready" className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.holdNotifyPhone}
                      onChange={(e) =>
                        setSettings({ ...settings, holdNotifyPhone: e.target.checked })
                      }
                      className="rounded border-border text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-foreground/80">Call me when holds are ready</span>
                  </label>
                  <label htmlFor="text-me-when-holds-are-ready" className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.holdNotifySms}
                      onChange={(e) =>
                        setSettings({ ...settings, holdNotifySms: e.target.checked })
                      }
                      className="rounded border-border text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-foreground/80">Text me when holds are ready</span>
                  </label>
                </div>
              </div>

              {/* Overdue notifications */}
              <div>
                <h3 className="font-medium text-foreground mb-3">Overdue Reminders</h3>
                <label
                  htmlFor="email-me-when-items-are-overdue"
                  className="flex items-center gap-3"
                >
                  <input
                    type="checkbox"
                    checked={settings.overdueNotifyEmail}
                    onChange={(e) =>
                      setSettings({ ...settings, overdueNotifyEmail: e.target.checked })
                    }
                    className="rounded border-border text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-foreground/80">Email me when items are overdue</span>
                </label>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="items-center gap-2 px-6"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === "privacy" && (
          <div className="space-y-6">
            {/* PIN Change */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">Change PIN</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Update your account PIN for added security.
              </p>

              {pinSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-green-700 text-sm">PIN changed successfully!</p>
                </div>
              )}

              {!showPinChange ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPinChange(true)}
                  className="items-center gap-2 px-4"
                >
                  <Lock className="h-4 w-4" />
                  Change PIN
                </Button>
              ) : (
                <div className="space-y-4">
                  {pinError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-700 text-sm">{pinError}</p>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="current-pin"
                      className="block text-sm font-medium text-foreground/80 mb-1"
                    >
                      Current PIN
                    </label>
                    <div className="relative">
                      <Input
                        id="current-pin"
                        type={showPins ? "text" : "password"}
                        value={currentPin}
                        onChange={(e) => setCurrentPin(e.target.value)}
                        className="h-10 rounded-lg px-4"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="new-pin"
                      className="block text-sm font-medium text-foreground/80 mb-1"
                    >
                      New PIN
                    </label>
                    <Input
                      id="new-pin"
                      type={showPins ? "text" : "password"}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      className="h-10 rounded-lg px-4"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="confirm-new-pin"
                      className="block text-sm font-medium text-foreground/80 mb-1"
                    >
                      Confirm New PIN
                    </label>
                    <Input
                      id="confirm-new-pin"
                      type={showPins ? "text" : "password"}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      className="h-10 rounded-lg px-4"
                    />
                  </div>

                  <label htmlFor="show-pins" className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showPins}
                      onChange={(e) => setShowPins(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-muted-foreground">Show PINs</span>
                  </label>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={handlePinChange}
                      disabled={isSaving}
                      className="px-4"
                    >
                      {isSaving ? "Saving..." : "Update PIN"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowPinChange(false);
                        setCurrentPin("");
                        setNewPin("");
                        setConfirmPin("");
                        setPinError(null);
                      }}
                      className="px-4"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Reading History */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">Reading History</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Control whether your checkout history is saved.
              </p>

              <label htmlFor="keep-my-reading-history" className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={settings.keepHistory}
                  onChange={(e) => setSettings({ ...settings, keepHistory: e.target.checked })}
                  className="mt-1 rounded border-border text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-foreground font-medium">Keep my reading history</span>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    When enabled, you can view your past checkouts. When disabled, your checkout
                    history will not be saved.
                  </p>
                </div>
              </label>

              <div className="mt-4">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="items-center gap-2 px-6"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">Recommendations</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Choose how StacksOS builds book recommendations. Personalization is off by default.
              </p>

              <div className="space-y-4">
                <label
                  htmlFor="enable-personalized-recommendations"
                  className="flex items-start gap-3"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(settings.personalizedRecommendations)}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        personalizedRecommendations: e.target.checked,
                        readingHistoryPersonalization: e.target.checked
                          ? settings.readingHistoryPersonalization
                          : false,
                      })
                    }
                    className="mt-1 rounded border-border text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <span className="text-foreground font-medium">
                      Enable personalized recommendations
                    </span>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      When enabled, recommendations may use your holds and lists. Your reading
                      history is never used unless you explicitly enable it below.
                    </p>
                  </div>
                </label>

                <label
                  htmlFor="use-my-reading-history-for-recommendations"
                  className={`flex items-start gap-3 ${settings.personalizedRecommendations ? "" : "opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(settings.readingHistoryPersonalization)}
                    onChange={(e) =>
                      setSettings({ ...settings, readingHistoryPersonalization: e.target.checked })
                    }
                    disabled={!settings.personalizedRecommendations}
                    className="mt-1 rounded border-border text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <span className="text-foreground font-medium">
                      Use my reading history for recommendations
                    </span>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      If enabled, recommendations may use your checkout history. This requires
                      Reading History to be enabled above.
                    </p>
                  </div>
                </label>

                <div className="mt-2">
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="items-center gap-2 px-6"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
