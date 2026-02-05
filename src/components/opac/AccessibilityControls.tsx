"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAccessibilityPrefs } from "@/hooks/use-accessibility-prefs";

export function AccessibilityControls() {
  const { dyslexiaFriendly, setDyslexiaFriendly } = useAccessibilityPrefs();

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Reading comfort</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        These settings are saved on this device and apply to OPAC + Kids pages.
      </p>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label className="text-sm font-medium text-foreground">Dyslexia-friendly typography</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Increases spacing and disables ligatures for readability.
          </p>
        </div>
        <Switch checked={dyslexiaFriendly} onCheckedChange={(checked) => setDyslexiaFriendly(Boolean(checked))} />
      </div>
    </div>
  );
}

