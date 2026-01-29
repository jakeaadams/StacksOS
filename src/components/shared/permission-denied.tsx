/**
 * PermissionDeniedState
 *
 * Staff-friendly 403 UI. Keep it explicit: what permission is missing and what to do next.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldAlert, Home, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PermissionDeniedStateProps {
  title?: string;
  message?: string;
  missing?: string[];
  requestId?: string;
  className?: string;
}

export function PermissionDeniedState({
  title = "Permission required",
  message = "You do not have permission to perform this action.",
  missing = [],
  requestId,
  className,
}: PermissionDeniedStateProps) {
  const uniqueMissing = Array.from(new Set((missing || []).filter(Boolean))).sort();

  return (
    <Card className={cn("border-amber-200 bg-amber-50/40", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{message}</p>

        {uniqueMissing.length > 0 && (
          <div className="rounded-lg border bg-background p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Missing Permission(s)
            </div>
            <ul className="mt-2 space-y-1">
              {uniqueMissing.map((perm) => (
                <li key={perm} className="text-sm font-mono">
                  {perm}
                </li>
              ))}
            </ul>
          </div>
        )}

        {requestId && (
          <div className="text-xs text-muted-foreground">
            Request ID: <span className="font-mono">{requestId}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button variant="outline" asChild>
            <Link href="/staff">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Ask your Evergreen administrator to grant the permission(s) above for your staff account.
        </p>
      </CardContent>
    </Card>
  );
}

export default PermissionDeniedState;
