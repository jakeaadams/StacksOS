import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="border rounded-lg">
        <div className="p-3 border-b">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="divide-y">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-3 flex items-center gap-4">
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
