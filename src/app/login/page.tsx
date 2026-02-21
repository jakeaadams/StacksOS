"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Loader2, Lock, User, Building2, CheckCircle2, Sparkles, Shield, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { clientLogger } from "@/lib/client-logger";
import { fetchWithAuth } from "@/lib/client-fetch";

interface OrgUnit {
  id: number;
  shortname: string;
  name: string;
  children?: OrgUnit[];
}

function flattenOrgTree(org: OrgUnit, depth = 0): Array<OrgUnit & { depth: number }> {
  const result: Array<OrgUnit & { depth: number }> = [{ ...org, depth }];
  if (org.children) {
    for (const child of org.children) {
      result.push(...flattenOrgTree(child, depth + 1));
    }
  }
  return result;
}

const DEVICE_KEY = "stacksos_device_id";
const WORKSTATION_KEY = "stacksos_workstation";
const WORKSTATION_ORG_KEY = "stacksos_workstation_org";
const USERNAME_KEY = "stacksos_username";
const LOGIN_ORG_OVERRIDE_KEY = "stacksos_login_org_override";

function slug(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 16);
}

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "SERVER";
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;

  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().split("-")[0]
      : Math.random().toString(36).slice(2, 8);

  localStorage.setItem(DEVICE_KEY, random!);
  return random!;
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoSetupMessage, setAutoSetupMessage] = useState("");
  const [orgs, setOrgs] = useState<Array<OrgUnit & { depth: number }>>([]);
  const [orgOverride, setOrgOverride] = useState("");
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Prefill from local storage for a smoother workstation/location handoff.
    const savedUsername = localStorage.getItem(USERNAME_KEY) || "";
    if (savedUsername) setUsername(savedUsername);

    const orgOverrideValue = localStorage.getItem(LOGIN_ORG_OVERRIDE_KEY);
    if (orgOverrideValue) {
      setOrgOverride(orgOverrideValue);
      localStorage.removeItem(LOGIN_ORG_OVERRIDE_KEY);
    }
  }, []);

  useEffect(() => {
    async function fetchOrgs() {
      try {
        const res = await fetch("/api/evergreen/orgs", { credentials: "include" });
        const data = await res.json();
        if (data?.payload?.[0]) {
          const flattened = flattenOrgTree(data.payload[0]);
          setOrgs(flattened);
        }
      } catch (_error) {
        clientLogger.error("Failed to fetch orgs:", _error);
      }
    }
    fetchOrgs();
  }, []);

  const getOrgById = (id?: number | null) => {
    if (!id) return undefined;
    return orgs.find((o) => o.id === id);
  };

  const getStoredWorkstation = () => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem(WORKSTATION_KEY);
    if (stored) return stored;

    return "";
  };

  const saveWorkstation = (name: string, orgId?: number) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(WORKSTATION_KEY, name);
    if (orgId) localStorage.setItem(WORKSTATION_ORG_KEY, String(orgId));
    localStorage.setItem(USERNAME_KEY, username);
  };

  const buildWorkstationName = (orgId: number) => {
    const org = getOrgById(orgId);
    const orgShort = slug(org?.shortname || `ORG${orgId}`);
    const device = slug(deviceId || getOrCreateDeviceId());
    return `STACKSOS-${orgShort}-${device}`;
  };

  const attemptLogin = async (
    workstationName?: string,
    creds?: { username: string; password: string }
  ) => {
    const payload: Record<string, string> = {
      username: creds?.username ?? username,
      password: creds?.password ?? password,
    };
    if (workstationName) payload.workstation = workstationName;

    const res = await fetchWithAuth("/api/evergreen/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return { ok: data.ok, data };
  };

  const registerWorkstation = async (name: string, orgId: number) => {
    const res = await fetchWithAuth("/api/evergreen/workstations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, org_id: orgId }),
    });

    const data = await res.json();
    if (data.ok) return { ok: true, data };

    const message = String(data.error || "");
    if (message.toLowerCase().includes("exist")) {
      return { ok: true, data };
    }

    return { ok: false, data };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    const cleanPassword = password;

    if (!cleanUsername || !cleanPassword) {
      setError("Username and password required");
      return;
    }

    setError("");
    setIsLoading(true);
    setAutoSetupMessage("");

    try {
      const requestedNext =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next") || ""
          : "";
      const nextPath = requestedNext.startsWith("/") ? requestedNext : "/staff";

      const storedWorkstation = getStoredWorkstation();
      const loginResult = await attemptLogin(storedWorkstation || undefined, {
        username: cleanUsername,
        password: cleanPassword,
      });

      if (!loginResult.ok) {
        setError(loginResult.data.error || "Authentication failed");
        return;
      }

      if (storedWorkstation && !loginResult.data.needsWorkstation) {
        saveWorkstation(
          storedWorkstation,
          parseInt(localStorage.getItem(WORKSTATION_ORG_KEY) || "", 10)
        );
        // Full reload ensures the AuthProvider session check runs with the new cookie.
        window.location.assign(nextPath);
        return;
      }

      const userHomeOu = loginResult.data?.user?.home_ou;
      const overrideOrgId = orgOverride ? parseInt(orgOverride, 10) : undefined;
      const orgId = overrideOrgId || userHomeOu || orgs[0]?.id || 1;
      const workstationName = buildWorkstationName(orgId);

      setAutoSetupMessage("Setting up this device for your library...");

      const registerResult = await registerWorkstation(workstationName, orgId);
      if (!registerResult.ok) {
        setError(registerResult.data?.error || "Failed to register this device. Please try again.");
        return;
      }

      const relogin = await attemptLogin(workstationName, {
        username: cleanUsername,
        password: cleanPassword,
      });
      if (!relogin.ok) {
        setError(relogin.data?.error || "Authentication failed after setup.");
        return;
      }

      saveWorkstation(workstationName, orgId);
      window.location.assign(nextPath);
    } catch (_error) {
      setError("Connection failed. Please try again.");
    } finally {
      setIsLoading(false);
      setAutoSetupMessage("");
    }
  };

  const showOrgSelector = orgs.length > 1;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative overflow-hidden rounded-3xl border border-border/70 surface-glass p-8 shadow-xl">
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[hsl(var(--brand-2))]/20 blur-3xl" />
            <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-[hsl(var(--brand-1))]/15 blur-3xl" />

            <div className="relative">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-1))] via-[hsl(var(--brand-3))] to-[hsl(var(--brand-2))] flex items-center justify-center shadow-lg">
                  <span className="text-white font-semibold text-sm tracking-[0.2em]">SO</span>
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">StacksOS</h1>
                  <p className="text-sm text-muted-foreground">Modern library operations, built on Evergreen</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full">Evergreen Connected</Badge>
                <Badge variant="secondary" className="rounded-full">Multi‑Branch Ready</Badge>
              </div>

              <div className="mt-8 space-y-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-9 w-9 rounded-full bg-[hsl(var(--brand-1))]/10 text-[hsl(var(--brand-1))] flex items-center justify-center">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Fast circulation workflows</p>
                    <p>Scan, resolve, and complete checkouts in seconds.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-9 w-9 rounded-full bg-[hsl(var(--brand-3))]/10 text-[hsl(var(--brand-3))] flex items-center justify-center">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Unified staff experience</p>
                    <p>One consistent UI across circulation, cataloging, and reports.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Secure by default</p>
                    <p>Evergreen permissions + StacksOS guardrails for every action.</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 text-xs text-muted-foreground">
                Powered by Evergreen ILS<br /><span className="opacity-70">Built by the Adams Group of Companies</span>
              </div>
            </div>
          </div>

          <Card className="rounded-3xl border-border/70 shadow-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Sign in to your workspace</CardTitle>
              <CardDescription>
                Use your Evergreen credentials to start a secure session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {autoSetupMessage && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-[hsl(var(--brand-1))]/20 bg-[hsl(var(--brand-1))]/10 px-3 py-2 text-[hsl(var(--brand-1))] text-sm">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  {autoSetupMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-rose-600 text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      className="pl-14"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="pl-14"
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {showOrgSelector && (
                  <div className="space-y-2">
                    <Label htmlFor="location">Location (optional)</Label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-2.5 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                      <Select value={orgOverride} onValueChange={setOrgOverride}>
                        <SelectTrigger id="location" className="pl-14">
                          <SelectValue placeholder="Use your home library" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {orgs.map((org) => (
                            <SelectItem key={org.id} value={String(org.id)}>
                              <span style={{ paddingLeft: `${org.depth * 12}px` }}>
                                {org.shortname} - {org.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose a location for this session if you work across branches.
                    </p>
                  </div>
                )}


                <Button
                  type="submit"
                  className="w-full rounded-full"
                  disabled={isLoading || !username || !password}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
