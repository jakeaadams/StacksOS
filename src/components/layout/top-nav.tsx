"use client";

import Link from "next/link";
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
  GripVertical,
  Settings,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { useCallback, useEffect, useMemo, useState } from "react";

interface OrgUnit {
  id: number;
  name: string;
  shortname: string;
}

interface TopNavProps {
  onCommandOpen: () => void;
  currentLibrary?: string;
  userName?: string;
  userInitials?: string;
  onLogout?: () => void | Promise<void>;
  orgs?: OrgUnit[];
  evergreenOk?: boolean;
  evergreenStatus?: number;
}

const WORKSTATION_KEY = "stacksos_workstation";
const WORKSTATION_ORG_KEY = "stacksos_workstation_org";
const LOGIN_ORG_OVERRIDE_KEY = "stacksos_login_org_override";
const TOPBAR_ORDER_KEY = "stacksos_topbar_order";

// Available toolbar items with their IDs
type ToolbarItemId = "ils-status" | "clock" | "density" | "shortcuts" | "help" | "notifications" | "theme" | "user";

interface ToolbarItem {
  id: ToolbarItemId;
  label: string;
  visible: boolean;
}

const DEFAULT_TOOLBAR_ORDER: ToolbarItem[] = [
  { id: "ils-status", label: "ILS Status", visible: true },
  { id: "clock", label: "Clock", visible: true },
  { id: "density", label: "Density", visible: true },
  { id: "shortcuts", label: "Shortcuts", visible: true },
  { id: "help", label: "Help", visible: true },
  { id: "notifications", label: "Notifications", visible: true },
  { id: "theme", label: "Theme", visible: true },
  { id: "user", label: "User Menu", visible: true },
];

export function TopNav({
  onCommandOpen,
  currentLibrary = "Library",
  userName = "Staff User",
  userInitials = "SU",
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
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [toolbarItems, setToolbarItems] = useState<ToolbarItem[]>(DEFAULT_TOOLBAR_ORDER);
  const [draggedItem, setDraggedItem] = useState<ToolbarItemId | null>(null);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);

    if (typeof window !== "undefined") {
      setWorkstation(localStorage.getItem(WORKSTATION_KEY) || "");
      const rawOrg = localStorage.getItem(WORKSTATION_ORG_KEY);
      const parsed = rawOrg ? parseInt(rawOrg, 10) : NaN;
      setWorkstationOrgId(Number.isFinite(parsed) ? parsed : null);

      // Load saved toolbar order
      const savedOrder = localStorage.getItem(TOPBAR_ORDER_KEY);
      if (savedOrder) {
        try {
          const parsed = JSON.parse(savedOrder) as ToolbarItem[];
          // Merge with defaults to handle any new items
          const mergedItems = DEFAULT_TOOLBAR_ORDER.map((defaultItem) => {
            const saved = parsed.find((p) => p.id === defaultItem.id);
            return saved || defaultItem;
          });
          // Sort by saved order
          mergedItems.sort((a, b) => {
            const aIndex = parsed.findIndex((p) => p.id === a.id);
            const bIndex = parsed.findIndex((p) => p.id === b.id);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
          });
          setToolbarItems(mergedItems);
        } catch (_error) {
          // Use defaults on _error
        }
      }
    }

    return () => clearInterval(timer);
  }, []);

  const saveToolbarOrder = useCallback((items: ToolbarItem[]) => {
    setToolbarItems(items);
    if (typeof window !== "undefined") {
      localStorage.setItem(TOPBAR_ORDER_KEY, JSON.stringify(items));
    }
  }, []);

  const handleDragStart = (id: ToolbarItemId) => {
    setDraggedItem(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: ToolbarItemId) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) return;

    const newItems = [...toolbarItems];
    const draggedIndex = newItems.findIndex((i) => i.id === draggedItem);
    const targetIndex = newItems.findIndex((i) => i.id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [removed] = newItems.splice(draggedIndex, 1);
      newItems.splice(targetIndex, 0, removed);
      setToolbarItems(newItems);
    }
  };

  const handleDragEnd = () => {
    if (draggedItem) {
      saveToolbarOrder(toolbarItems);
    }
    setDraggedItem(null);
  };

  const toggleItemVisibility = (id: ToolbarItemId) => {
    const newItems = toolbarItems.map((item) =>
      item.id === id ? { ...item, visible: !item.visible } : item
    );
    saveToolbarOrder(newItems);
  };

  const resetToDefaults = () => {
    saveToolbarOrder(DEFAULT_TOOLBAR_ORDER);
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

  // Render individual toolbar items
  const renderToolbarItem = (item: ToolbarItem) => {
    if (!item.visible) return null;

    switch (item.id) {
      case "ils-status":
        return (
          <div key={item.id} className="hidden xl:flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span
              className={
                "inline-flex h-2 w-2 rounded-full " +
                (evergreenOk ? "bg-emerald-500" : "bg-rose-500")
              }
            />
            <span>{evergreenOk ? "ILS Online" : "ILS Offline"}</span>
          </div>
        );

      case "clock":
        return (
          <div key={item.id} className="text-xs text-muted-foreground font-mono hidden lg:block whitespace-nowrap">
            {mounted ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
          </div>
        );

      case "density":
        return <DensityToggle key={item.id} />;

      case "shortcuts":
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setShortcutsOpen(true)}>
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts</TooltipContent>
          </Tooltip>
        );

      case "help":
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                <Link href="/staff/help" aria-label="Help & Documentation">
                  <HelpCircle className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Help & Documentation</TooltipContent>
          </Tooltip>
        );

      case "notifications":
        return (
          <DropdownMenu key={item.id}>
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
        );

      case "theme":
        return (
          <Tooltip key={item.id}>
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
        );

      case "user":
        return (
          <DropdownMenu key={item.id}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 px-2 gap-2 rounded-full">
                <Avatar className="h-7 w-7 cursor-pointer hover:ring-2 hover:ring-primary transition-all" title="Click to change photo">
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
                  <p className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors" title="Click to edit profile" onClick={() => setCustomizeOpen(true)}>Library Staff • Click to edit</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCustomizeOpen(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Customize Toolbar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={() => void onLogout?.()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
                <DropdownMenuShortcut>⌘Q</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );

      default:
        return null;
    }
  };

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
            {toolbarItems.map(renderToolbarItem)}
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

      {/* Customize toolbar dialog */}
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Customize Toolbar</DialogTitle>
            <DialogDescription>
              Drag items to reorder. Click to show/hide.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            {toolbarItems.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-move
                  ${draggedItem === item.id ? "opacity-50 border-primary" : "border-border hover:border-primary/50"}
                  ${!item.visible ? "opacity-60" : ""}
                `}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => toggleItemVisibility(item.id)}
                  title={item.visible ? "Hide from toolbar" : "Show in toolbar"}
                >
                  {item.visible ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="sr-only">{item.visible ? "Hide" : "Show"} {item.label}</span>
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={resetToDefaults}>
              Reset to Defaults
            </Button>
            <Button size="sm" onClick={() => setCustomizeOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
