"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useKidsParentGate } from "@/contexts/kids-parent-gate-context";
import { useAccessibilityPrefs } from "@/hooks/useAccessibilityPrefs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Lock, Unlock, Type } from "lucide-react";

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ParentsControls() {
  const gate = useKidsParentGate();
  const { dyslexiaFriendly, setDyslexiaFriendly } = useAccessibilityPrefs();

  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingMs = useMemo(() => gate.unlockedUntilMs - now, [gate.unlockedUntilMs, now]);
  const remainingLabel = remainingMs > 0 ? formatRemaining(remainingMs) : "0:00";

  const requireUnlocked = useCallback(
    async (reason: string) => {
      if (!gate.enabled) return true;
      if (gate.isUnlocked) return true;
      return await gate.requestUnlock({ reason });
    },
    [gate]
  );

  const handleSetPin = useCallback(async () => {
    setMessage(null);
    const p = pin.trim();
    const c = pinConfirm.trim();
    if (!p || !c) {
      setMessage({ type: "error", text: "Enter and confirm your PIN." });
      return;
    }
    if (p !== c) {
      setMessage({ type: "error", text: "PINs do not match." });
      return;
    }

    setBusy(true);
    try {
      if (!(await requireUnlocked("Change the parent gate PIN"))) return;
      const res = await gate.setPin(p);
      if (!res.ok) {
        setMessage({ type: "error", text: res.error });
        return;
      }
      setPin("");
      setPinConfirm("");
      setMessage({ type: "success", text: "Parent gate PIN saved on this device." });
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }, [gate, pin, pinConfirm, requireUnlocked]);

  const handleDisable = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    try {
      if (!(await requireUnlocked("Disable the parent gate"))) return;
      gate.disable();
      setMessage({ type: "success", text: "Parent gate disabled on this device." });
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }, [gate, requireUnlocked]);

  const handleUnlock = useCallback(async () => {
    setMessage(null);
    const ok = await gate.requestUnlock({ reason: "Unlock Kids account actions" });
    if (ok) setMessage({ type: "success", text: "Unlocked. You can make account changes for a short time." });
    else setMessage({ type: "error", text: "Still locked." });
    setTimeout(() => setMessage(null), 4000);
  }, [gate]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Parent/guardian gate</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Optional. Requires a PIN before renewing books or changing/canceling holds in Kids mode. Saved on this device only.
            </p>
          </div>
          <div className="shrink-0">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                gate.enabled
                  ? gate.isUnlocked
                    ? "bg-green-50 text-green-700"
                    : "bg-amber-50 text-amber-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {gate.enabled ? (gate.isUnlocked ? `Unlocked (${remainingLabel})` : "Locked") : "Off"}
            </span>
          </div>
        </div>

        {message ? (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
            <div className="text-sm font-medium text-foreground">{gate.enabled ? "Change PIN" : "Set a PIN"}</div>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="kids-gate-pin">PIN (4–8 digits)</Label>
                <Input
                  id="kids-gate-pin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 1234"
                  disabled={busy}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kids-gate-pin-confirm">Confirm PIN</Label>
                <Input
                  id="kids-gate-pin-confirm"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value)}
                  inputMode="numeric"
                  placeholder="re-enter PIN"
                  disabled={busy}
                />
              </div>
              <Button onClick={() => void handleSetPin()} disabled={busy}>
                Save PIN
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
            <div className="text-sm font-medium text-foreground">Controls</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {gate.enabled ? (
                <>
                  <Button variant="outline" onClick={() => void handleUnlock()} disabled={busy || gate.isUnlocked}>
                    <Unlock className="h-4 w-4 mr-2" />
                    Unlock
                  </Button>
                  <Button variant="outline" onClick={gate.lockNow} disabled={busy || !gate.isUnlocked}>
                    <Lock className="h-4 w-4 mr-2" />
                    Lock now
                  </Button>
                  <Button variant="destructive" onClick={() => void handleDisable()} disabled={busy}>
                    Disable gate
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Set a PIN to enable the gate.
                </div>
              )}
            </div>
            {gate.enabled ? (
              <div className="mt-3 text-xs text-muted-foreground">
                If you forget the PIN, disable the gate by clearing site data for this browser.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Type className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Dyslexia-friendly typography</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Increase spacing for readability. Applies to OPAC + Kids pages on this device.
            </p>
          </div>
          <Switch checked={dyslexiaFriendly} onCheckedChange={(checked) => setDyslexiaFriendly(Boolean(checked))} />
        </div>
      </div>
    </div>
  );
}

