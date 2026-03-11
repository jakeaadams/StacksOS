import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home, Search } from "lucide-react";

export default function StaffNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="text-center space-y-6 p-8 max-w-md">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-6">
            <FileQuestion className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Page Not Found</h1>
          <p className="text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved. Check the URL or
            navigate back to a known section.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link href="/staff">
              <Home className="mr-2 h-4 w-4" />
              Staff Dashboard
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/staff/catalog">
              <Search className="mr-2 h-4 w-4" />
              Catalog Search
            </Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">Error 404</p>
      </div>
    </div>
  );
}
