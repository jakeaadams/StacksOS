"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LockKeyhole, ShieldCheck } from "lucide-react";

const STORAGE_KEYS = {
  salt: "stacksos:kidsParentGate:salt",
  pinHash: "stacksos:kidsParentGate:pinHash",
  unlockedUntil: "stacksos:kidsParentGate:unlockedUntilMs",
} as const;

const UNLOCK_TTL_MS = 15 * 60_000;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePin(pin: string): string {
  return String(pin || "").replace(/\s+/g, "").trim();
}

function validatePin(pin: string): string | null {
  const p = normalizePin(pin);
  if (!p) return "PIN is required.";
  if (!/^[0-9]{4,8}$/.test(p)) return "Use 4–8 digits (numbers only).";
  return null;
}

type KidsParentGateContextValue = {
  enabled: boolean;
  isUnlocked: boolean;
  unlockedUntilMs: number;
  setPin: (pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  disable: () => void;
  lockNow: () => void;
  requestUnlock: (opts?: { reason?: string }) => Promise<boolean>;
};

const KidsParentGateContext = React.createContext<KidsParentGateContextValue | undefined>(undefined);

export function KidsParentGateProvider({ children }: { children: React.ReactNode }) {
  const [salt, setSalt] = React.useState<string>("");
  const [pinHash, setPinHash] = React.useState<string>("");
  const [unlockedUntilMs, setUnlockedUntilMs] = React.useState<number>(0);

  const enabled = Boolean(pinHash);
  const [isUnlocked, setIsUnlocked] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) {
      setIsUnlocked(false);
      return;
    }

    const now = Date.now();
    const unlocked = unlockedUntilMs > now;
    setIsUnlocked(unlocked);
    if (!unlocked) return;

    const delay = Math.max(0, unlockedUntilMs - now);
    const t = window.setTimeout(() => setIsUnlocked(false), delay + 25);
    return () => window.clearTimeout(t);
  }, [enabled, unlockedUntilMs]);

  React.useEffect(() => {
    try {
      setSalt(localStorage.getItem(STORAGE_KEYS.salt) || "");
      setPinHash(localStorage.getItem(STORAGE_KEYS.pinHash) || "");
      const untilRaw = localStorage.getItem(STORAGE_KEYS.unlockedUntil) || "";
      const parsed = untilRaw ? parseInt(untilRaw, 10) : NaN;
      setUnlockedUntilMs(Number.isFinite(parsed) ? parsed : 0);
    } catch {
      // ignore
    }
  }, []);

  const persistUnlockedUntil = React.useCallback((until: number) => {
    setUnlockedUntilMs(until);
    try {
      localStorage.setItem(STORAGE_KEYS.unlockedUntil, String(until));
    } catch {
      // ignore
    }
  }, []);

  const lockNow = React.useCallback(() => {
    persistUnlockedUntil(0);
  }, [persistUnlockedUntil]);

  const disable = React.useCallback(() => {
    setPinHash("");
    persistUnlockedUntil(0);
    try {
      localStorage.removeItem(STORAGE_KEYS.pinHash);
      localStorage.removeItem(STORAGE_KEYS.unlockedUntil);
    } catch {
      // ignore
    }
  }, [persistUnlockedUntil]);

  const setPin = React.useCallback(
    async (pin: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      const validation = validatePin(pin);
      if (validation) return { ok: false, error: validation };

      const saltValue =
        salt ||
        (() => {
          const s = randomHex(16);
          setSalt(s);
          try {
            localStorage.setItem(STORAGE_KEYS.salt, s);
          } catch {
            // ignore
          }
          return s;
        })();

      try {
        const hash = await sha256Hex(`${saltValue}:${normalizePin(pin)}`);
        setPinHash(hash);
        persistUnlockedUntil(0);
        try {
          localStorage.setItem(STORAGE_KEYS.pinHash, hash);
        } catch {
          // ignore
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "Could not set PIN on this device." };
      }
    },
    [persistUnlockedUntil, salt]
  );

  // Unlock dialog state
  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [unlockReason, setUnlockReason] = React.useState<string>("");
  const [unlockPin, setUnlockPin] = React.useState("");
  const [unlockError, setUnlockError] = React.useState<string>("");
  const resolveRef = React.useRef<((ok: boolean) => void) | null>(null);

  const closeUnlock = React.useCallback((ok: boolean) => {
    setUnlockOpen(false);
    setUnlockPin("");
    setUnlockError("");
    const resolve = resolveRef.current;
    resolveRef.current = null;
    if (resolve) resolve(ok);
  }, []);

  const requestUnlock = React.useCallback(
    async (opts?: { reason?: string }) => {
      if (!enabled) return true;
      if (Date.now() < unlockedUntilMs) return true;

      setUnlockReason(String(opts?.reason || "A parent/guardian PIN is required."));
      setUnlockOpen(true);

      return await new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
      });
    },
    [enabled, unlockedUntilMs]
  );

  const confirmUnlock = React.useCallback(async () => {
    setUnlockError("");
    if (!pinHash || !salt) {
      setUnlockError("Parent gate isn’t set up on this device.");
      return;
    }
    const validation = validatePin(unlockPin);
    if (validation) {
      setUnlockError(validation);
      return;
    }

    try {
      const candidate = await sha256Hex(`${salt}:${normalizePin(unlockPin)}`);
      if (candidate !== pinHash) {
        setUnlockError("Incorrect PIN. Try again.");
        return;
      }
      const until = Date.now() + UNLOCK_TTL_MS;
      persistUnlockedUntil(until);
      closeUnlock(true);
    } catch {
      setUnlockError("Could not verify PIN on this device.");
    }
  }, [closeUnlock, pinHash, persistUnlockedUntil, salt, unlockPin]);

  const value = React.useMemo<KidsParentGateContextValue>(
    () => ({
      enabled,
      isUnlocked,
      unlockedUntilMs,
      setPin,
      disable,
      lockNow,
      requestUnlock,
    }),
    [disable, enabled, isUnlocked, lockNow, requestUnlock, setPin, unlockedUntilMs]
  );

  return (
    <KidsParentGateContext.Provider value={value}>
      {children}

      <Dialog
        open={unlockOpen}
        onOpenChange={(open) => {
          if (open) return;
          closeUnlock(false);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              Parent/Guardian PIN
            </DialogTitle>
            <DialogDescription>{unlockReason}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="kids-parent-pin">PIN</Label>
              <Input
                id="kids-parent-pin"
                value={unlockPin}
                onChange={(e) => setUnlockPin(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 4–8 digits"
              />
              {unlockError ? <div className="text-sm text-destructive">{unlockError}</div> : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => closeUnlock(false)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmUnlock()}>
              <LockKeyhole className="h-4 w-4 mr-2" />
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </KidsParentGateContext.Provider>
  );
}

export function useKidsParentGate(): KidsParentGateContextValue {
  const ctx = React.useContext(KidsParentGateContext);
  if (!ctx) {
    return {
      enabled: false,
      isUnlocked: false,
      unlockedUntilMs: 0,
      setPin: async () => ({ ok: false, error: "Parent gate is unavailable." }),
      disable: () => {},
      lockNow: () => {},
      requestUnlock: async () => true,
    };
  }
  return ctx;
}
