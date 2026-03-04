"use client";
import { Button } from "@/components/ui/button";

export default function TeensError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-xl font-semibold">Oops! Something went wrong</h2>
        <p className="text-muted-foreground">
          We hit a snag loading this page. Let&apos;s try again!
        </p>
        <Button onClick={reset} className="inline-flex items-center justify-center">
          Try Again
        </Button>
      </div>
    </div>
  );
}
