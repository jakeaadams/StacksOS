import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-[50vh] p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full max-w-2xl" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-4 w-full max-w-lg" />
    </div>
  );
}
