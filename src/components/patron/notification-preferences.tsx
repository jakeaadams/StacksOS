"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared";
import { Bell, BellOff, Save } from "lucide-react";

interface NotificationPreferencesProps {
  patronId: number;
}

interface Preferences {
  emailEnabled: boolean;
  holdReady: boolean;
  overdue: boolean;
  preOverdue: boolean;
  cardExpiration: boolean;
  fineBill: boolean;
}

export function NotificationPreferences({ patronId }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialPreferences, setInitialPreferences] = useState<Preferences | null>(null);

  useEffect(() => {
    loadPreferences();
  }, [patronId]);

  const loadPreferences = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`/api/evergreen/notices?patron_id=${patronId}`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load preferences");
      }

      const prefs = data.preferences;
      setPreferences(prefs);
      setInitialPreferences(prefs);
      setHasChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load preferences";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (key: keyof Preferences) => {
    if (!preferences) return;

    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    setHasChanges(JSON.stringify(updated) !== JSON.stringify(initialPreferences));
  };

  const handleSave = async () => {
    if (!preferences) return;

    setIsSaving(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/notices", {
        method: "PATCH",
        body: JSON.stringify({
          patron_id: patronId,
          preferences,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to save preferences");
      }

      setInitialPreferences(preferences);
      setHasChanges(false);
      toast.success("Notification preferences saved successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save preferences";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (initialPreferences) {
      setPreferences(initialPreferences);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState message={error} onRetry={loadPreferences} />
        </CardContent>
      </Card>
    );
  }

  if (!preferences) return null;

  const noticeTypes = [
    {
      key: "holdReady" as keyof Preferences,
      label: "Hold Ready",
      description: "Notify me when my holds are ready for pickup",
    },
    {
      key: "preOverdue" as keyof Preferences,
      label: "Pre-Overdue Courtesy",
      description: "Remind me when items are due soon",
    },
    {
      key: "overdue" as keyof Preferences,
      label: "Overdue Items",
      description: "Notify me when items are overdue",
    },
    {
      key: "cardExpiration" as keyof Preferences,
      label: "Card Expiration",
      description: "Remind me when my library card is expiring",
    },
    {
      key: "fineBill" as keyof Preferences,
      label: "Fines and Bills",
      description: "Notify me about outstanding fines or fees",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {preferences.emailEnabled ? (
            <Bell className="h-5 w-5 text-blue-600" />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground/70" />
          )}
          <CardTitle>Email Notification Preferences</CardTitle>
        </div>
        <CardDescription>
          Manage your email notification settings for library notices
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="email-enabled" className="text-base font-semibold">
              Enable Email Notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Master switch for all email notifications
            </p>
          </div>
          <Switch
            id="email-enabled"
            checked={preferences.emailEnabled}
            onCheckedChange={() => handleToggle("emailEnabled")}
          />
        </div>

        <div className="border-t pt-4">
          <div className="space-y-4">
            {noticeTypes.map((type) => (
              <div
                key={type.key}
                className={`flex items-center justify-between ${
                  !preferences.emailEnabled ? "opacity-50" : ""
                }`}
              >
                <div className="space-y-0.5">
                  <Label htmlFor={type.key} className="font-medium">
                    {type.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                </div>
                <Switch
                  id={type.key}
                  checked={preferences[type.key]}
                  onCheckedChange={() => handleToggle(type.key)}
                  disabled={!preferences.emailEnabled}
                />
              </div>
            ))}
          </div>
        </div>

        {hasChanges && (
          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        )}

        {!hasChanges && (
          <p className="text-sm text-muted-foreground text-center pt-4 border-t">
            Changes are saved automatically when you toggle preferences
          </p>
        )}
      </CardContent>
    </Card>
  );
}
