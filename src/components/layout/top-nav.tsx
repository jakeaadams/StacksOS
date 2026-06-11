"use client";

import Link from "next/link";
import { fetchWithAuth } from "@/lib/client-fetch";
import {
  Search,
  Sun,
  Moon,
  Bell,
  HelpCircle,
  LogOut,
  Building2,
  Keyboard,
  Check,
  Camera,
  ArrowLeftRight,
  UserPlus,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import { DensityToggle, UniversalSearch } from "@/components/shared";
import { ProfileSwitcher } from "@/components/layout/profile-switcher";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/hooks";
import { cn } from "@/lib/utils";

interface OrgUnit {
  id: number;
  name: string;
  shortname: string;
}

interface TopNavProps {
  onCommandOpen: () => void;
  currentLibrary?: string;
  activeOrgId?: number;
  userId?: number;
  userName?: string;
  userInitials?: string;
  userPhotoUrl?: string;
  userTitle?: string;
  onUserPhotoUpdated?: (url: string) => void;
  onLogout?: (redirectTo?: string) => void | Promise<void>;
  orgs?: OrgUnit[];
  evergreenOk?: boolean;
  evergreenStatus?: number;
}

interface EnvResponse {
  env?: {
    label?: string;
    tone?: string;
  };
}

interface PermCheckResponse {
  perms?: Record<string, boolean>;
}

const WORKSTATION_KEY = "stacksos_workstation";
const WORKSTATION_ORG_KEY = "stacksos_workstation_org";
const LOGIN_ORG_OVERRIDE_KEY = "stacksos_login_org_override";
const LOGIN_ORG_OVERRIDE_LABEL_KEY = "stacksos_login_org_override_label";

function getEnvToneClasses(tone?: string | null) {
  // Quiet, token-based environment ribbon that coheres with the dark-first
  // Linear/Vercel palette. Uses semantic status tokens (which are dark-mode
  // aware) rather than saturated solid bars. Class strings are kept as full
  // literals so the Tailwind v4 scanner can emit the arbitrary-value utilities.
  const t = String(tone || "").toLowerCase();
  if (t === "training" || t === "test") {
    return "bg-[hsl(var(--status-error-bg))] text-[hsl(var(--status-error-text))] [box-shadow:inset_0_-1px_0_hsl(var(--status-error)/0.28),inset_0_2px_0_hsl(var(--status-error)/0.5)]";
  }
  if (t === "sandbox" || t === "staging") {
    return "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-text))] [box-shadow:inset_0_-1px_0_hsl(var(--status-warning)/0.28),inset_0_2px_0_hsl(var(--status-warning)/0.5)]";
  }
  if (t === "dev" || t === "development") {
    // Neutral surface for dev — quietest of all.
    return "bg-muted text-muted-foreground [box-shadow:inset_0_-1px_0_hsl(var(--border)),inset_0_2px_0_hsl(var(--border))]";
  }
  // prod/default
  return "bg-[hsl(var(--status-info-bg))] text-[hsl(var(--status-info-text))] [box-shadow:inset_0_-1px_0_hsl(var(--status-info)/0.28),inset_0_2px_0_hsl(var(--status-info)/0.5)]";
}

export function TopNav({
  onCommandOpen,
  currentLibrary = "Library",
  activeOrgId,
  userId,
  userName = "Staff User",
  userInitials = "SU",
  userPhotoUrl,
  userTitle = "Library Staff",
  onUserPhotoUpdated,
  onLogout,
  orgs = [],
  evergreenOk = true,
  evergreenStatus: _evergreenStatus,
}: TopNavProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(new Date());
  const [workstation, setWorkstation] = useState("");
  const [workstationOrgId, setWorkstationOrgId] = useState<number | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | undefined>(userPhotoUrl);
  const [uploadPhotoFile, setUploadPhotoFile] = useState<File | null>(null);
  const [uploadPhotoPreview, setUploadPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const { data: envData } = useApi<EnvResponse>("/api/env", {
    immediate: true,
    revalidateOnFocus: false,
    revalidateInterval: 5 * 60_000,
  });

  const envLabel = String(envData?.env?.label || "").trim();
  const envTone = String(envData?.env?.tone || "").trim();
  const showEnvBanner = envLabel.length > 0;

  const keyPerms = useMemo(
    () => ["VIEW_USER", "UPDATE_USER", "ADMIN_COPY_STATUS", "ADMIN_WORKSTATION", "ADMIN_ACQ_CLAIM"],
    []
  );

  const permsQuery = useMemo(() => encodeURIComponent(keyPerms.join(",")), [keyPerms]);

  const { data: permData } = useApi<PermCheckResponse>(
    userId ? `/api/evergreen/perm-check?perms=${permsQuery}` : null,
    { immediate: !!userId, revalidateOnFocus: false, revalidateInterval: 5 * 60_000 }
  );

  const permSummary = useMemo(() => {
    const map = permData?.perms || null;
    if (!map) return null;
    const allowed = keyPerms.filter((p) => map[p]).length;
    return `Key perms: ${allowed}/${keyPerms.length}`;
  }, [keyPerms, permData?.perms]);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);

    if (typeof window !== "undefined") {
      setWorkstation(localStorage.getItem(WORKSTATION_KEY) || "");
      const rawOrg = localStorage.getItem(WORKSTATION_ORG_KEY);
      const parsed = rawOrg ? parseInt(rawOrg, 10) : NaN;
      setWorkstationOrgId(Number.isFinite(parsed) ? parsed : null);
    }

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setProfilePhotoUrl(userPhotoUrl);
  }, [userPhotoUrl]);

  useEffect(() => {
    if (!uploadPhotoFile) {
      setUploadPhotoPreview(null);
      return;
    }

    const url = URL.createObjectURL(uploadPhotoFile);
    setUploadPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadPhotoFile]);

  const handleUploadProfilePhoto = async () => {
    if (!userId) {
      toast.error("Missing user id; unable to upload photo.");
      return;
    }

    if (!uploadPhotoFile) {
      toast.error("Choose a photo to upload.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadPhotoFile);
      formData.append("patronId", String(userId));

      const res = await fetchWithAuth("/api/patron-photos", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.url) {
        throw new Error(data?.error || "Failed to upload photo");
      }

      setProfilePhotoUrl(data.url);
      onUserPhotoUpdated?.(data.url);
      setUploadPhotoFile(null);
      setProfileOpen(false);
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSwitchLocation = async (org: OrgUnit) => {
    if (typeof window === "undefined") return;
    const orgId = org.id;
    const currentOrgId = workstationOrgId ?? activeOrgId ?? null;
    if (currentOrgId && orgId === currentOrgId) return;

    localStorage.setItem(LOGIN_ORG_OVERRIDE_KEY, String(orgId));
    localStorage.setItem(LOGIN_ORG_OVERRIDE_LABEL_KEY, org.name);
    localStorage.removeItem(WORKSTATION_KEY);
    localStorage.removeItem(WORKSTATION_ORG_KEY);

    const next = window.location.pathname + window.location.search;
    toast.message("Switching location", {
      description: "Sign in again to open a workstation for the selected branch.",
    });
    await onLogout?.(`/login?next=${encodeURIComponent(next)}`);
  };

  const shortcutRows = useMemo(
    () => [
      { keys: "Ctrl/⌘ + K", label: "Global search / command palette" },
      { keys: "Ctrl/⌘ + B", label: "Toggle sidebar" },
      { keys: "Ctrl/⌘ + P", label: "Print (receipt/slips where supported)" },
      { keys: "Esc", label: "Cancel / clear / start new session (contextual)" },
      { keys: "F1", label: "Checkout" },
      { keys: "F2", label: "Checkin" },
      { keys: "F3", label: "Patron search" },
      { keys: "F5", label: "Catalog search" },
    ],
    []
  );

  return (
    <TooltipProvider>
      <header className="surface-glass sticky top-0 z-50 min-w-0 overflow-x-clip border-b border-border/70">
        {showEnvBanner ? (
          <div
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-1 text-[10.5px] font-medium tracking-[0.18em] uppercase",
              getEnvToneClasses(envTone)
            )}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {envLabel}
          </div>
        ) : null}

        <div className="flex min-w-0 items-center gap-2 px-4 py-3 md:gap-3 md:px-5">
          {/* Left: Brand + Location */}
          <div className="flex min-w-0 shrink items-center gap-2 md:gap-3">
            <div className="flex min-w-0 shrink-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-1))] via-[hsl(var(--brand-3))] to-[hsl(var(--brand-2))] shadow-[0_16px_24px_-16px_hsl(var(--brand-3)/0.9)]">
                <span className="text-white font-semibold text-xs tracking-[0.2em]">SO</span>
              </div>
              <div className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span className="text-sm font-semibold stx-brand-text">StacksOS</span>
                <span className="text-[11px] text-muted-foreground">Library Operations</span>
              </div>
            </div>

            <div className="h-7 w-px bg-border/80 hidden md:block" />

            <div className="flex min-w-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="stx-pill h-9 max-w-[170px] gap-2 rounded-full px-3 text-foreground/80 hover:bg-muted/70 hover:text-foreground"
                    aria-label={`Service location: ${currentLibrary}. Switch location`}
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="text-xs font-medium truncate max-w-[140px]">
                      {currentLibrary}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuLabel>Service Location</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {orgs.length > 0 ? (
                    orgs.map((org) => (
                      <DropdownMenuItem
                        key={org.id}
                        onSelect={() => {
                          void handleSwitchLocation(org);
                        }}
                        className="flex items-center justify-between"
                      >
                        <span className="truncate">{org.name}</span>
                        {(workstationOrgId ?? activeOrgId) === org.id && (
                          <Check className="h-4 w-4 text-emerald-600" />
                        )}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>{currentLibrary}</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {workstation && (
                <Badge
                  variant="secondary"
                  className="hidden lg:inline-flex rounded-full px-3 text-[10px] border border-border/60"
                >
                  WS {workstation}
                </Badge>
              )}
            </div>

            <div className="h-7 w-px bg-border/80 hidden lg:block" />

            <div className="hidden lg:block">
              <ProfileSwitcher />
            </div>
          </div>

          {/* Center: Always-visible quick search (Polaris-style) */}
          <div className="hidden min-w-[220px] flex-1 md:block">
            <UniversalSearch variant="topbar" placeholder="Search patrons, items, records..." />
          </div>

          {/* Right: Actions - rendered in custom order */}
          <div className="flex shrink-0 items-center gap-1 lg:gap-2">
            {/* Polaris-style primary actions */}
            <div className="hidden 2xl:flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4">
                <Link href="/staff/circulation/checkin">
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Check In
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4">
                <Link href="/staff/patrons/register">
                  <UserPlus className="h-4 w-4 mr-2" />
                  New Patron
                </Link>
              </Button>
            </div>

            <div className="hidden 2xl:flex items-center gap-2 stx-pill px-3 py-1.5 text-[11px] text-muted-foreground">
              <span
                className={
                  "inline-flex h-2 w-2 rounded-full " +
                  (evergreenOk ? "bg-emerald-500" : "bg-rose-500")
                }
              />
              <span>{evergreenOk ? "ILS Online" : "ILS Offline"}</span>
            </div>

            <div className="text-xs text-muted-foreground font-mono hidden lg:block whitespace-nowrap">
              {mounted
                ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "--:--"}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-9 w-9 rounded-full stx-pill lg:inline-flex"
                  onClick={onCommandOpen}
                  aria-label="Open command palette"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Command palette <span className="ml-2 font-mono text-[10px] opacity-80">⌘K</span>
              </TooltipContent>
            </Tooltip>

            <DensityToggle />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full stx-pill"
                  onClick={() => setShortcutsOpen(true)}
                  aria-label="Keyboard shortcuts"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard shortcuts</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full stx-pill"
                >
                  <Link href="/staff/help" aria-label="Help & Documentation">
                    <HelpCircle className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Help & Documentation</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full relative stx-pill"
                      aria-label="Notifications"
                    >
                      <Bell className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>No notifications yet</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full stx-pill"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label={
                    mounted && theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
                  }
                >
                  {mounted && theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-2 gap-2 rounded-full stx-pill">
                  <Avatar className="h-7 w-7">
                    {profilePhotoUrl ? (
                      <AvatarImage src={profilePhotoUrl} alt={`${userName} photo`} />
                    ) : null}
                    <AvatarFallback className="bg-[hsl(var(--brand-1))] text-white text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[112px] truncate text-xs font-medium xl:inline">
                    {userName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {userTitle}
                      {workstation ? ` • WS ${workstation}` : ""}
                      {currentLibrary ? ` • ${currentLibrary}` : ""}
                    </p>
                    {permSummary ? (
                      <p className="text-[11px] text-muted-foreground">{permSummary}</p>
                    ) : null}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/staff/admin">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Administration
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/staff/admin/permissions">
                    <KeyRound className="mr-2 h-4 w-4" />
                    Permissions
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                  <Camera className="mr-2 h-4 w-4" />
                  Change profile photo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600" onClick={() => void onLogout?.()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                  <DropdownMenuShortcut>⌘Q</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile command bar */}
        <div className="px-4 pb-3 md:hidden">
          <UniversalSearch variant="topbar" placeholder="Search patrons, items, records..." />
        </div>
      </header>

      {/* Keyboard shortcuts dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              StacksOS is designed for scan-first, keyboard-first workflows.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {shortcutRows.map((row) => (
              <div
                key={row.keys}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2"
              >
                <kbd className="rounded-lg border bg-background px-2 py-1 font-mono text-xs">
                  {row.keys}
                </kbd>
                <span className="text-sm text-muted-foreground">{row.label}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={profileOpen}
        onOpenChange={(nextOpen) => {
          setProfileOpen(nextOpen);
          if (!nextOpen) setUploadPhotoFile(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>Update your profile photo.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {profilePhotoUrl ? (
                  <AvatarImage src={profilePhotoUrl} alt={`${userName} photo`} />
                ) : null}
                <AvatarFallback className="bg-[hsl(var(--brand-1))] text-white">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{userName}</div>
                <div className="text-sm text-muted-foreground truncate">{userTitle}</div>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadPhotoFile(e.target.files?.[0] || null)}
              />
              <div className="text-xs text-muted-foreground">JPG/PNG/GIF/WEBP • Max 2MB</div>
            </div>

            {uploadPhotoPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={uploadPhotoPreview}
                alt="Profile photo preview"
                className="h-40 w-40 rounded-full object-cover border bg-muted self-center"
              />
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setProfileOpen(false)}
                disabled={uploadingPhoto}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUploadProfilePhoto}
                disabled={!uploadPhotoFile || uploadingPhoto || !userId}
              >
                {uploadingPhoto ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
