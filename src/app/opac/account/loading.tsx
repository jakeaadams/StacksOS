import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        {/* Profile header skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        {/* Quick stat cards grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stx-surface rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-4 w-4" />
              </div>
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>

        {/* Quick actions skeleton */}
        <div className="stx-surface rounded-xl p-6 space-y-4">
          <Skeleton className="h-6 w-36" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Recent activity skeleton */}
        <div className="stx-surface rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <Skeleton className="h-6 w-40" />
          </div>
          <div className="divide-y divide-border/50">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <Skeleton className="h-12 w-9 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
