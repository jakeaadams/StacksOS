/**
import { DEBOUNCE_DELAY_MS } from "@/lib/constants";
 * Activity Log Page - Staff activity feed interface
 * 
 * Displays a reverse chronological feed of all system activities including:
 * - User logins
 * - Circulation events (checkouts, checkins)
 * - Hold operations
 * - Payment transactions
 */

"use client";

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
  LogOut,
  BookOpen,
  BookCheck,
  Hand,
  CreditCard,
  DollarSign,
  Search,
  RefreshCw,
  Calendar,
  Clock,

  Filter,
  ChevronDown,
  ArrowDownUp,
  Loader2,
  AlertCircle,
  XCircle,
  CheckCircle2,
  History,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

type ActivityType = "login" | "logout" | "checkout" | "checkin" | "hold_place" | "hold_cancel" | "hold_pickup" | "payment" | "refund" | "fine" | "all";

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

interface ActivityResponse {
  activities: ActivityItem[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "All Activities", icon: Activity },
  { value: "login", label: "Logins", icon: LogIn },
  { value: "checkout", label: "Checkouts", icon: BookOpen },
  { value: "checkin", label: "Checkins", icon: BookCheck },
  { value: "hold_place", label: "Holds Placed", icon: Hand },
  { value: "hold_pickup", label: "Holds Picked Up", icon: CheckCircle2 },
  { value: "hold_cancel", label: "Holds Cancelled", icon: XCircle },
  { value: "payment", label: "Payments", icon: CreditCard },
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
  logout: LogOut,
  checkout: BookOpen,
  checkin: BookCheck,
  hold_place: Hand,
  hold_cancel: XCircle,
  hold_pickup: CheckCircle2,
  payment: CreditCard,
  refund: DollarSign,
  fine: AlertCircle,
};

const ACTIVITY_COLORS: Record<string, string> = {
  login: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  logout: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  checkout: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  checkin: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  hold_place: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  hold_cancel: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  hold_pickup: "bg-green-500/10 text-green-600 dark:text-green-400",
  payment: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  refund: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  fine: "bg-red-500/10 text-red-600 dark:text-red-400",
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getDateRangeParams(range: string): { from?: string; to?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (range) {
    case "today":
      return { from: today.toISOString() };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday.toISOString(), to: today.toISOString() };
    }
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: weekAgo.toISOString() };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { from: monthAgo.toISOString() };
    }
    default:
      return {};
  }
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
          {new Date(activity.timestamp).toLocaleString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

interface FilterBarProps {
  activityType: ActivityType;
  onActivityTypeChange: (type: ActivityType) => void;
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
                {ACTIVITY_TYPES.map((type) => {
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
      if (a.type === "login" || a.type === "logout") counts.logins++;
      else if (a.type === "checkout" || a.type === "checkin") counts.circulation++;
      else if (a.type.startsWith("hold_")) counts.holds++;
      else if (a.type === "payment" || a.type === "refund" || a.type === "fine") counts.payments++;
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
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allActivities, setAllActivities] = useState<ActivityItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Build API URL with filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (activityType !== "all") params.set("type", activityType);
    if (debouncedSearch) params.set("user", debouncedSearch);
    if (cursor) params.set("cursor", cursor);
    
    const dateParams = getDateRangeParams(dateRange);
    if (dateParams.from) params.set("from", dateParams.from);
    if (dateParams.to) params.set("to", dateParams.to);
    
    params.set("limit", "25");
    
    const queryString = params.toString();
    return `/api/evergreen/activity${queryString ? `?${queryString}` : ""}`;
  }, [activityType, dateRange, debouncedSearch, cursor]);

  // Fetch activities
  const { data, isLoading, error, refetch } = useApi<ActivityResponse>(apiUrl, {
    revalidateOnFocus: false,
  });

  // Update local state when data changes
  useEffect(() => {
    if (data) {
      if (cursor) {
        // Append new activities
        setAllActivities((prev) => [...prev, ...data.activities]);
      } else {
        // Replace activities (fresh load or filter change)
        setAllActivities(data.activities);
      }
      setHasMore(data.hasMore);
      setIsLoadingMore(false);
    }
  }, [data, cursor]);

  // Reset pagination when filters change
  useEffect(() => {
    setCursor(undefined);
    setAllActivities([]);
    setHasMore(true);
  }, [activityType, dateRange, debouncedSearch]);

  // Infinite scroll observer
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore && data?.nextCursor) {
          setIsLoadingMore(true);
          setCursor(data.nextCursor);
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
  }, [hasMore, isLoading, isLoadingMore, data?.nextCursor]);

  const handleRefresh = useCallback(() => {
    setCursor(undefined);
    setAllActivities([]);
    setHasMore(true);
    refetch();
  }, [refetch]);

  const totalCount = data?.total ?? allActivities.length;

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
            {totalCount.toLocaleString()} activities
          </Badge>
          {activityType !== "all" && (
            <Badge variant="outline" className="rounded-full">
              <Filter className="h-3 w-3 mr-1" />
              {ACTIVITY_TYPES.find((t) => t.value === activityType)?.label}
            </Badge>
          )}
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        {/* Filter Bar */}
        <FilterBar
          activityType={activityType}
          onActivityTypeChange={setActivityType}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
          isRefreshing={isLoading && !cursor}
        />

        {/* Stats Summary */}
        <ActivityStats activities={allActivities} total={totalCount} />

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
                Showing {allActivities.length} of {totalCount.toLocaleString()}
              </span>
            </div>

            {/* Content */}
            <ScrollArea className="h-[600px]">
              <div className="p-4 space-y-3">
                {/* Initial Loading */}
                {isLoading && !cursor && allActivities.length === 0 && (
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
                {!isLoading && !error && allActivities.length === 0 && (
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
                {allActivities.map((activity) => (
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
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (data?.nextCursor) {
                          setIsLoadingMore(true);
                          setCursor(data.nextCursor);
                        }
                      }}>
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
