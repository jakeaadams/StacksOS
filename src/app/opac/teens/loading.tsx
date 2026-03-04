import { Skeleton } from "@/components/ui/skeleton";

export default function TeensLoading() {
  return (
    <div className="min-h-screen">
      {/* Hero banner skeleton */}
      <Skeleton className="h-64 w-full rounded-none" />

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Section title */}
        <div className="text-center space-y-2">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-72 mx-auto" />
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="stx-surface rounded-xl overflow-hidden">
              <Skeleton className="h-40 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
