"use client";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer,
  PageHeader,
  PageContent,
} from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks";
import { toast } from "sonner";
import {
  Monitor,
  Search,
  Bell,
  Building2,
  Save,
  RotateCcw,
  Moon,
  Sun,
  Laptop,
  Volume2,
  BellRing,
  MapPin,
  LayoutGrid,
  LayoutList,
  Maximize2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface UserSettings {
  // Display settings
  theme: "light" | "dark" | "system";
  density: "compact" | "comfortable" | "spacious";

  // Search settings
  defaultSearchScope: "all" | "catalog" | "patrons" | "items";
  resultsPerPage: number;
  autoSuggest: boolean;

  // Notification settings
  soundAlerts: boolean;
  desktopNotifications: boolean;

  // Workstation settings
  workstationId: string;
  workstationName: string;
  workstationOrg: number | null;
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: "system",
  density: "comfortable",
  defaultSearchScope: "all",
  resultsPerPage: 25,
  autoSuggest: true,
  soundAlerts: true,
  desktopNotifications: false,
  workstationId: "",
  workstationName: "",
  workstationOrg: null,
};

const STORAGE_KEY = "stacksos_user_settings";

// ============================================================================
// Helper Components
// ============================================================================

interface SettingSectionProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingSection({ icon: Icon, title, description, children }: SettingSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function SettingsPage() {
  const _router = useRouter();
  const { user, orgs } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch workstations for the dropdown
  const { data: workstationData } = useApi<any>(
    user?.homeLibraryId ? `/api/evergreen/workstations?org_id=${user.homeLibraryId}` : null,
    { immediate: !!user?.homeLibraryId }
  );
  const { data: sessionData, refetch: refetchSessions } = useApi<any>("/api/security/sessions", { immediate: true });

  const workstations = workstationData?.workstations || [];
  const sessions = Array.isArray(sessionData?.sessions) ? sessionData.sessions : [];

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }

      // Also load workstation from auth context if available
      if (user?.workstation) {
        setSettings((prev) => ({
          ...prev,
          workstationName: user.workstation,
          workstationOrg: user.homeLibraryId,
        }));
      }
    } catch (err) {
      clientLogger.error("Failed to load settings:", err);
    }
  }, [user]);

  // Apply theme when it changes
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "dark") {
      root.classList.add("dark");
    } else if (settings.theme === "light") {
      root.classList.remove("dark");
    } else {
      // System preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }, [settings.theme]);

  // Update a setting
  const updateSetting = useCallback(<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback(async () => {
    setIsSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

	      // Also try to save to Evergreen API if available
	      try {
	        const response = await fetchWithAuth("/api/evergreen/user-settings", {
	          method: "POST",
	          headers: { "Content-Type": "application/json" },
	          body: JSON.stringify({
	            settings: {
	              "stacksos.preferences.theme": settings.theme,
              "stacksos.preferences.density": settings.density,
              "stacksos.preferences.search": {
                scope: settings.defaultSearchScope,
                resultsPerPage: settings.resultsPerPage,
                autoSuggest: settings.autoSuggest,
              },
              "stacksos.preferences.notifications": {
                soundAlerts: settings.soundAlerts,
                desktopNotifications: settings.desktopNotifications,
              },
            },
          }),
        });

        if (response.ok) {
          toast.success("Settings saved to Evergreen");
        }
      } catch {
        // Silently fail Evergreen sync - localStorage is the primary store
      }

      toast.success("Settings saved successfully");
      setHasChanges(false);
    } catch (err) {
      toast.error("Failed to save settings");
      clientLogger.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  // Reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(true);
    toast.info("Settings reset to defaults");
  }, []);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      toast.error("This browser does not support desktop notifications");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      updateSetting("desktopNotifications", true);
      toast.success("Desktop notifications enabled");
    } else {
      toast.error("Notification permission denied");
    }
  }, [updateSetting]);

  return (
    <PageContainer>
      <PageHeader
        title="User Settings"
        subtitle="Customize your StacksOS experience"
        breadcrumbs={[
          { label: "Dashboard", href: "/staff" },
          { label: "Settings" },
        ]}
        actions={[
          {
            label: "Reset to Defaults",
            onClick: resetSettings,
            variant: "outline" as const,
            icon: RotateCcw,
          },
          {
            label: isSaving ? "Saving..." : "Save Settings",
            onClick: saveSettings,
            disabled: !hasChanges || isSaving,
            icon: Save,
          },
        ]}
      />

      <PageContent>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Display Settings */}
          <SettingSection
            icon={Monitor}
            title="Display"
            description="Appearance and layout preferences"
          >
            <SettingRow
              label="Theme"
              description="Choose your preferred color scheme"
            >
              <Select
                value={settings.theme}
                onValueChange={(value) => updateSetting("theme", value as UserSettings["theme"])}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      <span>Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      <span>Dark</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Laptop className="h-4 w-4" />
                      <span>System</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <Separator />

            <SettingRow
              label="UI Density"
              description="Adjust spacing and sizing of interface elements"
            >
              <Select
                value={settings.density}
                onValueChange={(value) => updateSetting("density", value as UserSettings["density"])}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">
                    <div className="flex items-center gap-2">
                      <LayoutList className="h-4 w-4" />
                      <span>Compact</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="comfortable">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" />
                      <span>Comfortable</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="spacious">
                    <div className="flex items-center gap-2">
                      <Maximize2 className="h-4 w-4" />
                      <span>Spacious</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </SettingSection>

          {/* Search Settings */}
          <SettingSection
            icon={Search}
            title="Search"
            description="Customize search behavior and defaults"
          >
            <SettingRow
              label="Default Search Scope"
              description="Where to search by default"
            >
              <Select
                value={settings.defaultSearchScope}
                onValueChange={(value) => updateSetting("defaultSearchScope", value as UserSettings["defaultSearchScope"])}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="catalog">Catalog</SelectItem>
                  <SelectItem value="patrons">Patrons</SelectItem>
                  <SelectItem value="items">Items</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <Separator />

            <SettingRow
              label="Results Per Page"
              description="Number of results to display"
            >
              <Select
                value={String(settings.resultsPerPage)}
                onValueChange={(value) => updateSetting("resultsPerPage", Number(value))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <Separator />

            <SettingRow
              label="Auto-Suggest"
              description="Show suggestions while typing"
            >
              <Switch
                checked={settings.autoSuggest}
                onCheckedChange={(checked) => updateSetting("autoSuggest", checked)}
              />
            </SettingRow>
          </SettingSection>

          {/* Notification Settings */}
          <SettingSection
            icon={Bell}
            title="Notifications"
            description="Alerts and notification preferences"
          >
            <SettingRow
              label="Sound Alerts"
              description="Play sounds for checkouts, errors, and alerts"
            >
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <Switch
                  checked={settings.soundAlerts}
                  onCheckedChange={(checked) => updateSetting("soundAlerts", checked)}
                />
              </div>
            </SettingRow>

            <Separator />

            <SettingRow
              label="Desktop Notifications"
              description="Show browser notifications for important events"
            >
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-muted-foreground" />
                {settings.desktopNotifications ? (
                  <Switch
                    checked={settings.desktopNotifications}
                    onCheckedChange={(checked) => updateSetting("desktopNotifications", checked)}
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={requestNotificationPermission}
                  >
                    Enable
                  </Button>
                )}
              </div>
            </SettingRow>
          </SettingSection>

          {/* Workstation Settings */}
          <SettingSection
            icon={Building2}
            title="Workstation"
            description="Current workstation and location settings"
          >
            <SettingRow
              label="Current Workstation"
              description={user?.workstation || "No workstation registered"}
            >
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                  {user?.workstation || "N/A"}
                </span>
              </div>
            </SettingRow>

            <Separator />

            <SettingRow
              label="Home Library"
              description="Your assigned library location"
            >
              <span className="text-sm font-medium">
                {user?.homeLibrary || "Not set"}
              </span>
            </SettingRow>

            <Separator />

            <SettingRow
              label="Active Organization"
              description="Currently selected organization unit"
            >
              <Select
                value={String(user?.activeOrgId || "")}
                onValueChange={(_value) => {
                  // In a full implementation, this would update the active org
                  toast.info("Organization switching will be available in a future update");
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={String(org.id)}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            {workstations.length > 0 && (
              <>
                <Separator />
                <SettingRow
                  label="Change Workstation"
                  description="Switch to a different workstation"
                >
                  <Select
                    value={settings.workstationId}
                    onValueChange={(value) => {
                      const ws = workstations.find((w: any) => String(w.id || w[0]) === value);
                      if (ws) {
                        updateSetting("workstationId", value);
                        updateSetting("workstationName", ws.name || ws[1]);
                        toast.info("Workstation change requires re-login to take effect");
                      }
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select workstation" />
                    </SelectTrigger>
                    <SelectContent>
                      {workstations.map((ws: any) => {
                        const id = ws.id || ws[0];
                        const name = ws.name || ws[1];
                        return (
                          <SelectItem key={id} value={String(id)}>
                            {name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </SettingRow>
              </>
            )}
          </SettingSection>

          {/* Security Settings */}
          <SettingSection
            icon={ShieldCheck}
            title="Security"
            description="Session activity, device list, and revocation controls"
          >
            <div className="text-sm text-muted-foreground">
              Idle timeout is enforced by the server (configured by `STACKSOS_IDLE_TIMEOUT_MINUTES`). If your session is revoked or expires, you will be prompted to log in again.
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Active sessions</Label>
                  <p className="text-xs text-muted-foreground">Devices and browsers that have used this account recently.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refetchSessions()}>
                  Refresh
                </Button>
              </div>

              {sessions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No session records yet.</div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s: any) => (
                    <div key={s.id} className="rounded-lg border p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{String(s.id).slice(0, 12)}…</span>
                          {s.revoked_at ? (
                            <span className="text-xs text-red-700">revoked</span>
                          ) : (
                            <span className="text-xs text-green-700">active</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Last seen: {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : "—"}
                          {s.ip ? ` • IP: ${s.ip}` : ""}
                        </div>
                        {s.user_agent ? (
                          <div className="text-xs text-muted-foreground mt-1 truncate">{s.user_agent}</div>
                        ) : null}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!s.revoked_at}
                        onClick={async () => {
                          const ok = window.confirm("Revoke this session? The device will be forced to log back in.");
                          if (!ok) return;
                          try {
                            const resp = await fetchWithAuth("/api/security/sessions", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ sessionId: s.id }),
                            });
                            const json = await resp.json();
                            if (!resp.ok || json.ok === false) throw new Error(json.error || "Revoke failed");
                            toast.success("Session revoked");
                            await refetchSessions();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Revoke failed");
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SettingSection>
        </div>

        {/* Floating save bar when there are unsaved changes */}
        {hasChanges && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <Card className="shadow-lg border-primary/20">
              <CardContent className="flex items-center gap-4 p-4">
                <p className="text-sm text-muted-foreground">
                  You have unsaved changes
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Reload from storage
                      const stored = localStorage.getItem(STORAGE_KEY);
                      if (stored) {
                        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
                      } else {
                        setSettings(DEFAULT_SETTINGS);
                      }
                      setHasChanges(false);
                    }}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveSettings}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}
