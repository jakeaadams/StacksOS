"use client";
/**
 * Activity Log Page - Staff activity feed interface
 * 
 * Displays a reverse chronological feed of all system activities including:
 * - User logins
 * - Circulation events (checkouts, checkins)
 * - Hold operations
 * - Payment transactions
 */


import * as React from "react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  EmptyState,
  ListSkeleton,
} from "@/components/shared";

import { useApi, useDebounce } from "@/hooks";
import { DEBOUNCE_DELAY_MS } from "@/lib/constants";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Activity,
  LogIn,
  BookOpen,
  BookCheck,
  Hand,
  CreditCard,
  Search,
  RefreshCw,
  Calendar,
  Clock,

  Filter,
  ChevronDown,
  ArrowDownUp,
  Loader2,
  AlertCircle,
  History,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

type ActivityType =
  | "login"
  | "checkout"
  | "checkin"
  | "hold"
  | "payment"
  | "patron_change"
  | "all";

type ApiActivityType = Exclude<ActivityType, "all">;

interface ApiActivity {
  id: string;
  type: ApiActivityType;
  timestamp: string;
  actor: {
    id: number | null;
    username: string | null;
    name: string | null;
  };
  target?: {
    type: string;
    id: number | string;
    label: string;
  };
  details: Record<string, any>;
  workstation?: string;
}

interface ActivityItem {
  id: string;
  type: ActivityType;
  userId: string;
  userName: string;
  userAvatar?: string;
  description: string;
  details?: string;
  targetId?: string;
  targetLabel?: string;
  timestamp: string;
  status: "success" | "warning" | "error" | "info";
  metadata?: Record<string, unknown>;
}

interface ApiActivityResponse {
  ok: boolean;
  activities: ApiActivity[];
  capabilities?: {
    patron_change?: boolean;
  };
  pagination: {
    limit: number;
    offset: number;
    count: number;
    type: string;
  };
  filters?: {
    user_id?: number | null;
    start_date?: string | null;
    end_date?: string | null;
  };
}

// ============================================================================
// Constants
// ============================================================================

type ActivityTypeOption = { value: ActivityType; label: string; icon: React.ComponentType<{ className?: string }> };

const ACTIVITY_TYPES: ActivityTypeOption[] = [
  { value: "all", label: "All Activities", icon: Activity },
  { value: "login", label: "Logins", icon: LogIn },
  { value: "checkout", label: "Checkouts", icon: BookOpen },
  { value: "checkin", label: "Checkins", icon: BookCheck },
  { value: "hold", label: "Holds", icon: Hand },
  { value: "payment", label: "Payments", icon: CreditCard },
  { value: "patron_change", label: "Patron Changes", icon: History },
];

const DATE_RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "all", label: "All Time" },
];

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  login: LogIn,
  checkout: BookOpen,
  checkin: BookCheck,
  hold: Hand,
  payment: CreditCard,
  patron_change: History,
};

const ACTIVITY_COLORS: Record<string, string> = {
  login: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  checkout: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  checkin: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  hold: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  payment: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  patron_change: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
};

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800",
  warning: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800",
  error: "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-800",
  info: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800",
};

// ============================================================================
// Utility Functions
// ============================================================================

function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  if (diffWeek < 4) return `${diffWeek} week${diffWeek === 1 ? "" : "s"} ago`;
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatFullTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return typeof timestamp === "string" && timestamp.trim() ? timestamp : "Unknown";
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  const safe = typeof name === "string" ? name : "";
  const trimmed = safe.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getDateRangeParams(range: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (range) {
    case "today":
      return { startDate: today.toISOString() };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: yesterday.toISOString(), endDate: today.toISOString() };
    }
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { startDate: weekAgo.toISOString() };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { startDate: monthAgo.toISOString() };
    }
    default:
      return {};
  }
}

function formatMoneyUSD(amount: number | null | undefined): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount);
}

function toActivityItem(activity: ApiActivity): ActivityItem {
  const actorId = activity.actor.id;
  const actorLabel =
    (activity.actor.name && activity.actor.name.trim()) ||
    (activity.actor.username && activity.actor.username.trim()) ||
    (actorId ? `User #${actorId}` : "Unknown user");

  const base: Omit<ActivityItem, "description" | "details" | "status"> = {
    id: activity.id,
    type: activity.type,
    userId: actorId ? String(actorId) : "",
    userName: actorLabel,
    userAvatar: undefined,
    targetId: activity.target?.id != null ? String(activity.target.id) : undefined,
    targetLabel: activity.target?.label || undefined,
    timestamp: activity.timestamp,
    metadata: activity.details as Record<string, unknown>,
  };

  if (activity.type === "login") {
    const details = activity.workstation ? `Workstation: ${activity.workstation}` : undefined;
    return { ...base, description: "Signed in", details, status: "success" };
  }

  if (activity.type === "checkout") {
    const label = activity.target?.label ? ` (${activity.target.label})` : "";
    return { ...base, description: `Checked out an item${label}`, status: "success" };
  }

  if (activity.type === "checkin") {
    const label = activity.target?.label ? ` (${activity.target.label})` : "";
    return { ...base, description: `Checked in an item${label}`, status: "success" };
  }

  if (activity.type === "hold") {
    const cancelTime = activity.details?.cancel_time;
    const fulfillmentTime = activity.details?.fulfillment_time;
    const frozen = Boolean(activity.details?.frozen);

    const status: ActivityItem["status"] = cancelTime ? "warning" : "info";
    const verb = cancelTime
      ? "Cancelled a hold"
      : fulfillmentTime
        ? "Fulfilled a hold"
        : "Placed a hold";

    const details = frozen ? "Frozen" : undefined;
    return { ...base, description: verb, details, status };
  }

  if (activity.type === "payment") {
    const amount = typeof activity.details?.amount === "number" ? activity.details.amount : null;
    const amountLabel = formatMoneyUSD(amount);
    const paymentType = typeof activity.details?.payment_type === "string" ? activity.details.payment_type : null;

    const details = [paymentType, amountLabel].filter(Boolean).join(" • ") || undefined;
    return { ...base, description: "Accepted a payment", details, status: "success" };
  }

  if (activity.type === "patron_change") {
    const changes = activity.details?.changes;
    const changedFields =
      changes && typeof changes === "object"
        ? Object.keys(changes).slice(0, 4).join(", ")
        : "";
    const details = changedFields ? `Updated: ${changedFields}${Object.keys(changes).length > 4 ? "…" : ""}` : undefined;
    return { ...base, description: "Updated patron record", details, status: "info" };
  }

  // Fallback (should be unreachable if ApiActivityType stays in sync)
  return { ...base, description: "Activity recorded", status: "info" };
}

// ============================================================================
// Components
// ============================================================================

interface ActivityCardProps {
  activity: ActivityItem;
}

function ActivityCard({ activity }: ActivityCardProps) {
  const Icon = ACTIVITY_ICONS[activity.type] || Activity;
  const colorClass = ACTIVITY_COLORS[activity.type] || "bg-muted text-muted-foreground";
  const statusClass = STATUS_COLORS[activity.status] || STATUS_COLORS.info;

  return (
    <div className="group relative flex gap-4 p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/30 hover:border-border transition-all duration-200">
      {/* Activity Type Icon */}
      <div className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${colorClass}`}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6 flex-shrink-0">
              <AvatarImage src={activity.userAvatar} alt={activity.userName} />
              <AvatarFallback className="text-[10px] font-medium">
                {getInitials(activity.userName)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm truncate">{activity.userName}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge 
              variant="outline" 
              className={`text-[10px] px-2 py-0.5 rounded-full ${statusClass}`}
            >
              {activity.status}
            </Badge>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {getRelativeTime(activity.timestamp)}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-foreground leading-relaxed">
          {activity.description}
        </p>

        {/* Details & Target */}
        {(activity.details || activity.targetLabel) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {activity.targetLabel && (
              <Badge variant="secondary" className="text-xs font-normal rounded-full">
                {activity.targetLabel}
              </Badge>
            )}
            {activity.details && (
              <span className="text-xs text-muted-foreground">
                {activity.details}
              </span>
            )}
          </div>
        )}

        {/* Timestamp (full) */}
        <p className="text-[11px] text-muted-foreground pt-1">
          <Clock className="inline h-3 w-3 mr-1 -mt-0.5" />
          {formatFullTimestamp(activity.timestamp)}
        </p>
      </div>
    </div>
  );
}

interface FilterBarProps {
  activityType: ActivityType;
  onActivityTypeChange: (type: ActivityType) => void;
  activityTypeOptions: ActivityTypeOption[];
  dateRange: string;
  onDateRangeChange: (range: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

function FilterBar({
  activityType,
  onActivityTypeChange,
  activityTypeOptions,
  dateRange,
  onDateRangeChange,
  searchQuery,
  onSearchChange,
  onRefresh,
  isRefreshing,
}: FilterBarProps) {
  return (
    <Card className="rounded-2xl border-border/70 shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Activity Type Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Activity Type
            </label>
            <Select value={activityType} onValueChange={(v) => onActivityTypeChange(v as ActivityType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {activityTypeOptions.map((type) => {
                  const TypeIcon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4" />
                        <span>{type.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Filter */}
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Date Range
            </label>
            <Select value={dateRange} onValueChange={onDateRangeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map((range) => (
                  <SelectItem key={range.value} value={range.value}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>{range.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* User Search */}
          <div className="flex-[2] min-w-[250px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Search by User
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or barcode..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="!pl-14"
              />
            </div>
          </div>

          {/* Refresh Button */}
          <div className="flex items-end">
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-10 w-10"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ActivityStatsProps {
  activities: ActivityItem[];
  total: number;
}

function ActivityStats({ activities, total }: ActivityStatsProps) {
  const stats = useMemo(() => {
    const counts: Record<string, number> = {
      logins: 0,
      circulation: 0,
      holds: 0,
      payments: 0,
    };

    activities.forEach((a) => {
      if (a.type === "login") counts.logins++;
      else if (a.type === "checkout" || a.type === "checkin") counts.circulation++;
      else if (a.type === "hold") counts.holds++;
      else if (a.type === "payment") counts.payments++;
    });

    return counts;
  }, [activities]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Card className="rounded-xl border-border/50 shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[hsl(var(--brand-1))]/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-[hsl(var(--brand-1))]" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/50 shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <LogIn className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{stats.logins}</p>
            <p className="text-xs text-muted-foreground">Logins</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/50 shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{stats.circulation}</p>
            <p className="text-xs text-muted-foreground">Circulation</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/50 shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Hand className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{stats.holds}</p>
            <p className="text-xs text-muted-foreground">Holds</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/50 shadow-sm col-span-2 lg:col-span-1">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="text-2xl font-semibold">{stats.payments}</p>
            <p className="text-xs text-muted-foreground">Payments</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ActivityLogPage() {
  // Filter state
  const [activityType, setActivityType] = useState<ActivityType>("all");
  const [dateRange, setDateRange] = useState("week");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, DEBOUNCE_DELAY_MS);

  // Pagination state
  const pageSize = 25;
  const [offset, setOffset] = useState(0);
  const [allActivities, setAllActivities] = useState<ActivityItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Build API URL with filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (activityType !== "all") params.set("type", activityType);
    const dateParams = getDateRangeParams(dateRange);
    if (dateParams.startDate) params.set("start_date", dateParams.startDate);
    if (dateParams.endDate) params.set("end_date", dateParams.endDate);

    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    
    const queryString = params.toString();
    return `/api/evergreen/activity${queryString ? `?${queryString}` : ""}`;
  }, [activityType, dateRange, offset, pageSize]);

  // Fetch activities
  const { data, isLoading, error, refetch } = useApi<ApiActivityResponse>(apiUrl, {
    revalidateOnFocus: false,
  });

  // Update local state when data changes
  useEffect(() => {
    if (data) {
      const nextItems = Array.isArray(data.activities)
        ? data.activities.flatMap((a) => {
            try {
              return [toActivityItem(a)];
            } catch (_error) {
              return [];
            }
          })
        : [];
      if (offset > 0) {
        setAllActivities((prev) => [...prev, ...nextItems]);
      } else {
        setAllActivities(nextItems);
      }
      const count = typeof data.pagination?.count === "number" ? data.pagination.count : nextItems.length;
      setHasMore(count >= pageSize);
      setIsLoadingMore(false);
    }
  }, [data, offset, pageSize]);

  const patronChangeSupported = data?.capabilities?.patron_change !== false;

  const activityTypeOptions = useMemo<ActivityTypeOption[]>(() => {
    if (patronChangeSupported) return ACTIVITY_TYPES;
    return ACTIVITY_TYPES.filter((t) => t.value !== "patron_change");
  }, [patronChangeSupported]);

  // If Evergreen doesn't support patron-change activity, keep the UI safe.
  useEffect(() => {
    if (!patronChangeSupported && activityType === "patron_change") {
      setActivityType("all");
    }
  }, [activityType, patronChangeSupported]);

  // Reset pagination when filters change
  useEffect(() => {
    setOffset(0);
    setAllActivities([]);
    setHasMore(true);
  }, [activityType, dateRange]);

  // Infinite scroll observer
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      // Older browsers / hardened environments: fall back to the manual “Load More” button.
      return;
    }
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          setIsLoadingMore(true);
          setOffset((prev) => prev + pageSize);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoading, isLoadingMore, pageSize]);

  const handleRefresh = useCallback(() => {
    setOffset(0);
    setAllActivities([]);
    setHasMore(true);
    refetch();
  }, [refetch]);

  const filteredActivities = useMemo(() => {
    const q = (debouncedSearch || "").trim().toLowerCase();
    if (!q) return allActivities;
    return allActivities.filter((a) => {
      const haystack = [
        a.userName,
        a.description,
        a.details || "",
        a.targetLabel || "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [allActivities, debouncedSearch]);

  const shownCount = filteredActivities.length;
  const loadedCount = allActivities.length;

  return (
    <PageContainer>
      <PageHeader
        title="Activity Log"
        subtitle="Monitor all system activities in real-time"
        breadcrumbs={[{ label: "Staff" }, { label: "Activity Log" }]}
        actions={[
          {
            label: "Refresh",
            onClick: handleRefresh,
            icon: RefreshCw,
            variant: "outline",
          },
        ]}
      >
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="secondary" className="rounded-full">
            <History className="h-3 w-3 mr-1" />
            {shownCount.toLocaleString()} activities
          </Badge>
          {!patronChangeSupported ? (
            <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
              <AlertCircle className="h-3 w-3 mr-1" />
              Patron changes unavailable
            </Badge>
          ) : null}
          {activityType !== "all" && (
            <Badge variant="outline" className="rounded-full">
              <Filter className="h-3 w-3 mr-1" />
              {activityTypeOptions.find((t) => t.value === activityType)?.label}
            </Badge>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        {/* Filter Bar */}
        <FilterBar
          activityType={activityType}
          onActivityTypeChange={setActivityType}
          activityTypeOptions={activityTypeOptions}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
          isRefreshing={isLoading && offset === 0}
        />

        {/* Stats Summary */}
        <ActivityStats activities={filteredActivities} total={shownCount} />

        {/* Activity Feed */}
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="p-0">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Activity Feed</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Showing {shownCount.toLocaleString()}
                {!!debouncedSearch && ` of ${loadedCount.toLocaleString()} loaded`}
              </span>
            </div>

            {/* Content */}
            <ScrollArea className="h-[600px]">
              <div className="p-4 space-y-3">
                {/* Initial Loading */}
                {isLoading && offset === 0 && allActivities.length === 0 && (
                  <div className="py-12">
                    <ListSkeleton items={8} />
                  </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                  <EmptyState
                    icon={AlertCircle}
                    title="Failed to load activities"
                    description={error.message || "An error occurred while fetching the activity log."}
                    action={{
                      label: "Try Again",
                      onClick: handleRefresh,
                    }}
                  />
                )}

                {/* Empty State */}
                {!isLoading && !error && filteredActivities.length === 0 && (
                  <EmptyState
                    icon={Activity}
                    title="No activities found"
                    description={
                      searchQuery || activityType !== "all"
                        ? "Try adjusting your filters or search terms."
                        : "Activity will appear here as staff perform actions in the system."
                    }
                    action={
                      searchQuery || activityType !== "all"
                        ? {
                            label: "Clear Filters",
                            onClick: () => {
                              setActivityType("all");
                              setDateRange("week");
                              setSearchQuery("");
                            },
                          }
                        : undefined
                    }
                  />
                )}

                {/* Activity List */}
                {filteredActivities.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))}

                {/* Load More Trigger */}
                {hasMore && allActivities.length > 0 && (
                  <div ref={loadMoreRef} className="py-4 flex justify-center">
                    {isLoadingMore ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading more...</span>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsLoadingMore(true);
                          setOffset((prev) => prev + pageSize);
                        }}
                      >
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Load More
                      </Button>
                    )}
                  </div>
                )}

                {/* End of List */}
                {!hasMore && allActivities.length > 0 && (
                  <div className="py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      End of activity log
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
