"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAccessibilityPrefs, type FontSizeOption } from "@/hooks/use-accessibility-prefs";
import { cn } from "@/lib/utils";

const FONT_SIZE_OPTIONS: { value: FontSizeOption; label: string; desc: string }[] = [
  { value: "small", label: "Small", desc: "14px" },
  { value: "medium", label: "Medium", desc: "16px (default)" },
  { value: "large", label: "Large", desc: "18px" },
  { value: "x-large", label: "Extra Large", desc: "20px" },
];

export function AccessibilityControls() {
  const {
    dyslexiaFriendly,
    setDyslexiaFriendly,
    highContrast,
    setHighContrast,
    fontSize,
    setFontSize,
    reduceMotion,
    setReduceMotion,
  } = useAccessibilityPrefs();

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Reading comfort</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        These settings are saved on this device and apply to OPAC + Kids pages.
      </p>

      {/* Dyslexia-friendly typography */}
      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label className="text-sm font-medium text-foreground">
            Dyslexia-friendly typography
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Increases spacing and disables ligatures for readability.
          </p>
        </div>
        <Switch
          checked={dyslexiaFriendly}
          onCheckedChange={(checked) => setDyslexiaFriendly(Boolean(checked))}
          aria-label="Toggle dyslexia-friendly typography"
        />
      </div>

      {/* High Contrast Mode */}
      <div className="mt-5 flex items-start justify-between gap-4 border-t border-border pt-5">
        <div className="min-w-0">
          <Label className="text-sm font-medium text-foreground">High contrast mode</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Increases contrast ratios for text, borders, and focus indicators.
          </p>
        </div>
        <Switch
          checked={highContrast}
          onCheckedChange={(checked) => setHighContrast(Boolean(checked))}
          aria-label="Toggle high contrast mode"
        />
      </div>

      {/* Reduced Motion */}
      <div className="mt-5 flex items-start justify-between gap-4 border-t border-border pt-5">
        <div className="min-w-0">
          <Label className="text-sm font-medium text-foreground">Reduce motion</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Disables animations and transitions throughout the catalog.
          </p>
        </div>
        <Switch
          checked={reduceMotion}
          onCheckedChange={(checked) => setReduceMotion(Boolean(checked))}
          aria-label="Toggle reduced motion"
        />
      </div>

      {/* Font Size Controls */}
      <div className="mt-5 border-t border-border pt-5">
        <Label className="text-sm font-medium text-foreground">Font size</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust the base text size for the catalog.
        </p>
        <fieldset className="mt-3" aria-label="Font size selection">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FONT_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFontSize(opt.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-center text-sm transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  fontSize === opt.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                aria-pressed={fontSize === opt.value}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-xs opacity-70">{opt.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
