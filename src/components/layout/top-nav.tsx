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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import { DensityToggle } from "@/components/shared";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface OrgUnit {
  id: number;
  name: string;
  shortname: string;
}

interface TopNavProps {
  onCommandOpen: () => void;
  currentLibrary?: string;
  userId?: number;
  userName?: string;
  userInitials?: string;
  userPhotoUrl?: string;
  userTitle?: string;
  onUserPhotoUpdated?: (url: string) => void;
  onLogout?: () => void | Promise<void>;
  orgs?: OrgUnit[];
  evergreenOk?: boolean;
  evergreenStatus?: number;
}

const WORKSTATION_KEY = "stacksos_workstation";
const WORKSTATION_ORG_KEY = "stacksos_workstation_org";
const LOGIN_ORG_OVERRIDE_KEY = "stacksos_login_org_override";

export function TopNav({
  onCommandOpen,
  currentLibrary = "Library",
  userId,
  userName = "Staff User",
  userInitials = "SU",
  userPhotoUrl,
  userTitle = "Library Staff",
  onUserPhotoUpdated,
  onLogout,
  orgs = [],
  evergreenOk = true,
  evergreenStatus,
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

      const res = await fetchWithAuth("/api/upload-patron-photo", {
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

  const handleSwitchLocation = async (orgId: number) => {
    if (typeof window === "undefined") return;
    if (workstationOrgId && orgId === workstationOrgId) return;

    localStorage.setItem(LOGIN_ORG_OVERRIDE_KEY, String(orgId));
    localStorage.removeItem(WORKSTATION_KEY);
    localStorage.removeItem(WORKSTATION_ORG_KEY);

    await onLogout?.();
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
      <header className="sticky top-0 z-50 border-b border-border/70 surface-glass">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          {/* Left: Brand + Location */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-1))] via-[hsl(var(--brand-3))] to-[hsl(var(--brand-2))] flex items-center justify-center shadow-lg">
                <span className="text-white font-semibold text-xs tracking-[0.2em]">SO</span>
              </div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-sm font-semibold">StacksOS</span>
                <span className="text-[11px] text-muted-foreground">Library Operations</span>
              </div>
            </div>

            <div className="h-7 w-px bg-border/80 hidden md:block" />

            <div className="flex items-center gap-2 min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 gap-2 text-foreground/80 hover:text-foreground hover:bg-muted/70 rounded-full"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="text-xs font-medium truncate max-w-[140px]">{currentLibrary}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuLabel>Current Location</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {orgs.length > 0 ? (
                    orgs.map((org) => (
                      <DropdownMenuItem
                        key={org.id}
                        onSelect={(e) => {
                          e.preventDefault();
                          void handleSwitchLocation(org.id);
                        }}
                        className="flex items-center justify-between"
                      >
                        <span className="truncate">{org.name}</span>
                        {workstationOrgId === org.id && <Check className="h-4 w-4 text-emerald-600" />}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>{currentLibrary}</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {workstation && (
                <Badge variant="secondary" className="hidden lg:inline-flex rounded-full px-3 text-[10px]">
                  WS {workstation}
                </Badge>
              )}
            </div>
          </div>

          {/* Center: Command search */}
          <Button
            variant="outline"
            className="hidden md:flex w-[420px] lg:w-[520px] justify-start h-10 rounded-full bg-background/80 border-border/70 text-muted-foreground shadow-sm"
            onClick={onCommandOpen}
          >
            <Search className="mr-2 h-4 w-4" />
            <span className="text-xs">Search patrons, items, records...</span>
            <kbd className="pointer-events-none ml-auto hidden h-6 select-none items-center gap-1 rounded-full bg-muted px-2 font-mono text-[10px] font-medium text-muted-foreground lg:flex">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </Button>

          {/* Right: Actions - rendered in custom order */}
          <div className="flex items-center gap-2">
            <div className="hidden xl:flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span
                className={
                  "inline-flex h-2 w-2 rounded-full " +
                  (evergreenOk ? "bg-emerald-500" : "bg-rose-500")
                }
              />
              <span>{evergreenOk ? "ILS Online" : "ILS Offline"}</span>
            </div>

            <div className="text-xs text-muted-foreground font-mono hidden lg:block whitespace-nowrap">
              {mounted ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
            </div>

            <DensityToggle />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setShortcutsOpen(true)}>
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard shortcuts</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
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
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full relative" aria-label="Notifications">
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
                  className="h-9 w-9 rounded-full"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-2 gap-2 rounded-full">
                  <Avatar className="h-7 w-7">
                    {profilePhotoUrl ? (
                      <AvatarImage src={profilePhotoUrl} alt={`${userName} photo`} />
                    ) : null}
                    <AvatarFallback className="bg-[hsl(var(--brand-1))] text-white text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium hidden md:inline">{userName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {userTitle}{workstation ? ` • WS ${workstation}` : ""}{currentLibrary ? ` • ${currentLibrary}` : ""}
                    </p>
                  </div>
                </DropdownMenuLabel>
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
          <Button
            variant="outline"
            className="w-full justify-start h-10 rounded-full bg-background/80 border-border/70 text-muted-foreground"
            onClick={onCommandOpen}
          >
            <Search className="mr-2 h-4 w-4" />
            <span className="text-xs">Search patrons, items, records...</span>
          </Button>
        </div>
      </header>

      {/* Keyboard shortcuts dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>StacksOS is designed for scan-first, keyboard-first workflows.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {shortcutRows.map((row) => (
              <div key={row.keys} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                <kbd className="rounded-lg border bg-background px-2 py-1 font-mono text-xs">{row.keys}</kbd>
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
                {profilePhotoUrl ? <AvatarImage src={profilePhotoUrl} alt={`${userName} photo`} /> : null}
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
              <div className="text-xs text-muted-foreground">
                JPG/PNG/GIF/WEBP • Max 2MB
              </div>
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
