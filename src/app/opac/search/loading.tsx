import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Search bar skeleton */}
      <div className="border-b p-4">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-12 w-full" />
        </div>
      </div>

      {/* Results area */}
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex gap-6">
          {/* Facets sidebar skeleton */}
          <div className="hidden md:block w-56 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <div className="space-y-1 pl-2">
                  {[...Array(4)].map((_, j) => (
                    <Skeleton key={j} className="h-4 w-32" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Results skeleton */}
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-32" />
            </div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4 p-4 border rounded-lg">
                  <Skeleton className="h-32 w-24 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/4" />
                    <div className="flex gap-2 pt-2">
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
