"use client";

import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TitleHold } from "./record-types";
import { formatDateTime, getHoldStatusLabel, getHoldStatusClass } from "./record-utils";

interface HoldQueueCardProps {
  holdQueueCount: number;
  titleHolds: TitleHold[];
  holdQueueHref: string;
}

export function HoldQueueCard({ holdQueueCount, titleHolds, holdQueueHref }: HoldQueueCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListOrdered className="h-5 w-5" /> Hold Queue ({holdQueueCount})
        </CardTitle>
        <CardDescription>Title-level hold queue for this bibliographic record</CardDescription>
      </CardHeader>
      <CardContent>
        {holdQueueCount === 0 ? (
          <p className="text-sm text-muted-foreground">No active holds on this title.</p>
        ) : titleHolds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Holds exist for this title, but queue details are not available in this response.</p>
        ) : (
          <div className="space-y-2">
            {titleHolds.map((hold) => (
              <div key={`title-hold-${hold.id}`} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <Badge variant="outline" className="font-mono w-fit">#{hold.queuePosition ?? "?"}</Badge>
                <div>
                  <p className="text-sm font-medium">Requested {formatDateTime(hold.requestTime)}</p>
                  <p className="text-xs text-muted-foreground">
                    {hold.patronBarcode ? `Patron ${hold.patronBarcode}` : "Patron details unavailable"}
                    {hold.pickupLib ? ` \u2022 Pickup Library ${hold.pickupLib}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={getHoldStatusClass(hold.status)}>{getHoldStatusLabel(hold.status)}</Badge>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href={holdQueueHref}>Open Hold Queue Management</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
