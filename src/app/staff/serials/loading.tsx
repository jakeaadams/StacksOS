import { Skeleton } from "@/components/ui/skeleton";

export default function SerialsLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Search bar skeleton */}
      <div className="flex gap-4">
        <Skeleton className="h-12 flex-1" />
        <Skeleton className="h-12 w-32" />
      </div>

      {/* Table skeleton */}
      <div className="border rounded-lg">
        <div className="p-3 border-b">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="divide-y">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-3 flex items-center gap-4">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
