"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { featureFlags } from "@/lib/feature-flags";
import {
  GraduationCap,
  Users,
  ArrowLeftRight,
  Search,
  BarChart3,
  Settings,
  Package,
  Calendar,
  FileText,
  ShoppingCart,
  Truck,
  BookMarked,
  Library,
  Clock,
  AlertCircle,
  CreditCard,
  UserPlus,
  FolderOpen,
  Tag,
  Layers,
  Home,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Receipt,
  Building,
  Globe,
  Database,
  Edit3,
  Share2,
  Download,
  Newspaper,
  Monitor,
  Send,
  WifiOff,
  FileQuestion,
  PackageX,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  UserCog,
  Sliders,
  Inbox,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { WorkformTracker } from "./workform-tracker";

interface NavSection {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeVariant?: "default" | "destructive" | "outline" | "secondary";
  shortcut?: string;
}

const mainNav: NavSection[] = [
  {
    title: "Dashboard",
    defaultOpen: true,
    items: [{ title: "Home", href: "/staff", icon: Home, shortcut: "⌘1" },
      { title: "Activity Log", href: "/staff/activity", icon: Activity }],
  },
  {
    title: "Circulation",
    defaultOpen: true,
    items: [
      { title: "Check Out", href: "/staff/circulation/checkout", icon: ArrowLeftRight, shortcut: "F1" },
      { title: "Check In", href: "/staff/circulation/checkin", icon: Package, shortcut: "F2" },
      { title: "Renew Items", href: "/staff/circulation/renew", icon: Clock },
      { title: "Holds", href: "/staff/circulation/holds-management", icon: BookMarked },
      { title: "Pull List", href: "/staff/circulation/pull-list", icon: ClipboardList },
      { title: "Holds Shelf", href: "/staff/circulation/holds-shelf", icon: Inbox },
      { title: "In-House Use", href: "/staff/circulation/in-house", icon: Library },
      { title: "Bills & Payments", href: "/staff/circulation/bills", icon: CreditCard },
      { title: "Offline Mode", href: "/staff/circulation/offline", icon: WifiOff },
      { title: "Lost/Missing/Damaged", href: "/staff/circulation/lost", icon: PackageX },
      { title: "Claims", href: "/staff/circulation/claims", icon: FileQuestion },
    ],
  },
  {
    title: "Patrons",
    defaultOpen: true,
    items: [
      { title: "Search Patrons", href: "/staff/patrons", icon: Search, shortcut: "F3" },
      { title: "Register Patron", href: "/staff/patrons/register", icon: UserPlus, shortcut: "F4" },
      { title: "Patron Groups", href: "/staff/patrons/groups", icon: Users },
      { title: "Alerts & Notes", href: "/staff/patrons/alerts", icon: AlertCircle },
    ],
  },
  {
    title: "Cataloging",
    defaultOpen: true,
    items: [
      { title: "Search Catalog", href: "/staff/catalog", icon: Search, shortcut: "F5" },
      { title: "Create Record", href: "/staff/catalog/create", icon: FileText },
      { title: "MARC Editor", href: "/staff/cataloging/marc-editor", icon: Edit3 },
      { title: "Authority Control", href: "/staff/cataloging/authority", icon: Share2 },
      { title: "Z39.50 Search", href: "/staff/cataloging/z3950", icon: Globe },
      { title: "Holdings", href: "/staff/cataloging/holdings", icon: Layers },
      { title: "MARC Import", href: "/staff/cataloging/import", icon: Download },
      ...(featureFlags.recordBuckets
        ? [{ title: "Record Buckets", href: "/staff/catalog/buckets", icon: FolderOpen }]
        : []),
      ...(featureFlags.marcBatchEdit
        ? [{ title: "MARC Batch Edit", href: "/staff/catalog/batch", icon: Layers }]
        : []),
      { title: "Item Status", href: "/staff/catalog/item-status", icon: Tag },
    ],
  },
  ...(featureFlags.ill
    ? [
        {
          title: "ILL",
          defaultOpen: false,
          items: [{ title: "ILL Requests", href: "/staff/ill", icon: Send }],
        },
      ]
    : []),
  ...(featureFlags.courseReserves
    ? [
        {
          title: "Course Reserves",
          defaultOpen: false,
          items: [{ title: "Course Materials", href: "/staff/course-reserves", icon: GraduationCap }],
        },
      ]
    : []),
  {
    title: "Booking",
    defaultOpen: false,
    items: [{ title: "Room & Equipment", href: "/staff/booking", icon: Monitor }],
  },
  {
    title: "Acquisitions",
    defaultOpen: false,
    items: [
      { title: "Selection Lists", href: "/staff/acquisitions/selection", icon: ClipboardList },
      { title: "Purchase Orders", href: "/staff/acquisitions/orders", icon: ShoppingCart },
      { title: "Receiving", href: "/staff/acquisitions/receiving", icon: Truck },
      { title: "Invoices", href: "/staff/acquisitions/invoices", icon: Receipt },
      { title: "Vendors", href: "/staff/acquisitions/vendors", icon: Building },
      { title: "Funds", href: "/staff/acquisitions/funds", icon: CreditCard },
      { title: "Funding Sources", href: "/staff/acquisitions/funding-sources", icon: Layers },
      { title: "Allocations", href: "/staff/acquisitions/allocations", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Serials",
    defaultOpen: false,
    items: [
      { title: "Serial Control", href: "/staff/serials", icon: Newspaper },
      { title: "Subscriptions", href: "/staff/serials/subscriptions", icon: Calendar },
      { title: "Routing Lists", href: "/staff/serials/routing", icon: Users },
    ],
  },
  {
    title: "Reports",
    defaultOpen: false,
    items: [
      { title: "Dashboard", href: "/staff/reports", icon: BarChart3 },
      ...(featureFlags.reportTemplates
        ? [{ title: "Report Templates", href: "/staff/reports/templates", icon: FileText }]
        : []),
      ...(featureFlags.myReports
        ? [{ title: "My Reports", href: "/staff/reports/my-reports", icon: FolderOpen }]
        : []),
      ...(featureFlags.scheduledReports
        ? [{ title: "Scheduled Reports", href: "/staff/reports/scheduled", icon: Clock }]
        : []),
    ],
  },
  {
    title: "Administration",
    defaultOpen: false,
    items: [
      { title: "Local Admin", href: "/staff/admin", icon: Settings },
      { title: "System Settings", href: "/staff/admin/settings", icon: Sliders },
      { title: "My Settings", href: "/staff/settings", icon: UserCog },
      { title: "Policy Inspector", href: "/staff/admin/policy-inspector", icon: Database },
      { title: "Item Statuses", href: "/staff/admin/item-statuses", icon: Tag },
      { title: "Stat Categories", href: "/staff/admin/stat-categories", icon: BarChart3 },
      ...(featureFlags.copyTags
        ? [{ title: "Copy Tags", href: "/staff/admin/copy-tags", icon: BookMarked }]
        : []),
      ...(featureFlags.serverAdmin
        ? [{ title: "Server Admin", href: "/staff/admin/server", icon: Database }]
        : []),
      ...(featureFlags.adminWorkstations
        ? [{ title: "Workstations", href: "/staff/admin/workstations", icon: Building }]
        : []),
      ...(featureFlags.userManagement
        ? [{ title: "User Management", href: "/staff/admin/users", icon: Users }]
        : []),
    ],
  },
];

function NavSection({ section, collapsed }: { section: NavSection; collapsed: boolean }) {
  const [isOpen, setIsOpen] = useState(section.defaultOpen ?? false);
  const pathname = usePathname();
  const hasActiveItem = section.items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  if (collapsed) {
    return (
      <TooltipProvider>
        <div className="py-1">
          {section.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-all mb-1 relative",
                      isActive
                        ? "bg-[hsl(var(--brand-1))] text-white shadow-sm"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 bg-rose-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.title}</p>
                  {item.shortcut && (
                    <p className="text-xs text-muted-foreground">{item.shortcut}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="mb-3">
      <button type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between w-full px-2 py-1.5 text-[11px] font-semibold tracking-wider uppercase",
          hasActiveItem ? "text-[hsl(var(--brand-1))]" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {section.title}
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {isOpen && (
        <div className="space-y-1 mt-1">
          {section.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
                  isActive
                    ? "bg-[hsl(var(--brand-1))]/10 text-foreground shadow-sm border border-[hsl(var(--brand-1))]/15"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 flex-shrink-0",
                    isActive ? "text-[hsl(var(--brand-1))]" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="truncate flex-1">{item.title}</span>
                {item.badge && (
                  <Badge
                    variant={item.badgeVariant || "secondary"}
                    className={cn(
                      "h-5 px-2 text-[10px] font-semibold rounded-full",
                      isActive && "bg-[hsl(var(--brand-1))]/15 text-[hsl(var(--brand-1))]"
                    )}
                  >
                    {item.badge}
                  </Badge>
                )}
                {item.shortcut && !isActive && (
                  <span className="text-[10px] text-muted-foreground/70 font-mono">{item.shortcut}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  evergreenOk?: boolean;
  evergreenStatus?: number;
  branchName?: string;
}

export function Sidebar({ collapsed = false, onToggleCollapse, evergreenOk = true, evergreenStatus, branchName }: SidebarProps) {
  return (
    <aside
      className={cn(
        "border-r border-border/70 surface-glass flex flex-col transition-all duration-200",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className={cn("flex items-center justify-between px-3 py-3", collapsed && "justify-center")}>
        {!collapsed && (
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Navigation
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <ScrollArea className="flex-1 pb-4">
        <div className={cn(collapsed ? "px-2" : "px-3")}>
          {collapsed ? null : <WorkformTracker />}
          <nav className="space-y-1">
          {mainNav.map((section) => (
            <NavSection key={section.title} section={section} collapsed={collapsed} />
          ))}
          </nav>
        </div>
      </ScrollArea>

      <div className={cn("border-t border-border/70 px-3 py-3", collapsed && "px-2")}>
        {collapsed ? (
          <div className="flex items-center justify-center">
            <span className={"h-2.5 w-2.5 rounded-full " + (evergreenOk ? "bg-emerald-500" : "bg-rose-500")} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={"h-2 w-2 rounded-full " + (evergreenOk ? "bg-emerald-500" : "bg-rose-500")} />
              <span>{evergreenOk ? "ILS Online" : "ILS Offline"}</span>
              {typeof evergreenStatus === "number" && (
                <span className="text-[10px] text-muted-foreground/70">({evergreenStatus})</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground/70">
              {branchName || "StacksOS"}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
