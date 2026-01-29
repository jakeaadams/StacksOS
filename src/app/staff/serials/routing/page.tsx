"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";

import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  ErrorMessage,
  SetupRequired,
  SETUP_CONFIGS,
} from "@/components/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApi } from "@/hooks";
import { MapPin, RefreshCw } from "lucide-react";

interface RoutingRow {
  id: number;
  user?: number;
  subscription?: number;
  position?: number;
}

export default function RoutingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialStream = searchParams.get("stream_id") || "";
  const [streamIdInput, setStreamIdInput] = useState(initialStream);
  const [streamId, setStreamId] = useState(initialStream);

  const url = streamId
    ? `/api/evergreen/serials?action=routing&stream_id=${encodeURIComponent(streamId)}`
    : "/api/evergreen/serials?action=routing";

  const { data, error, isLoading, refetch } = useApi<any>(url, { immediate: true });

  const routing: RoutingRow[] = data?.routing || [];
  const message = typeof data?.message === "string" ? data.message : "";

  const columns = useMemo<ColumnDef<RoutingRow>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "subscription", header: "Subscription" },
      { accessorKey: "user", header: "User" },
      { accessorKey: "position", header: "Position" },
    ],
    []
  );

  // Show SetupRequired when first loading without a stream_id
  const showSetup = !streamId && !isLoading && routing.length === 0 && !error;

  if (showSetup) {
    return (
      <PageContainer>
        <PageHeader
          title="Routing Lists"
          subtitle="Serial routing lists from Evergreen."
          breadcrumbs={[{ label: "Serials", href: "/staff/serials" }, { label: "Routing" }]}
        />
        <PageContent>
          <SetupRequired
            module="Serial Routing"
            description="Serial routing lists allow you to route serial issues to specific users in a defined sequence. Configure routing lists in Evergreen by stream."
            setupSteps={[
              "Create a serial subscription in Evergreen",
              "Set up distribution streams for the subscription",
              "Configure routing lists for each stream with user assignments",
              "Enter a stream_id below to view routing users",
            ]}
            docsUrl="/staff/help#serials"
          />

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Load a Routing List</CardTitle>
              <CardDescription>
                Routing lists are keyed by a serial stream. Enter a stream_id to load.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="stream_id">Stream ID</Label>
                <Input
                  id="stream_id"
                  value={streamIdInput}
                  onChange={(e) => setStreamIdInput(e.target.value)}
                  placeholder="e.g. 123"
                />
              </div>
              <Button
                onClick={() => setStreamId(streamIdInput.trim())}
                disabled={isLoading || !streamIdInput.trim()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Load
              </Button>
            </CardContent>
          </Card>
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Routing Lists"
        subtitle="Serial routing lists from Evergreen."
        breadcrumbs={[{ label: "Serials", href: "/staff/serials" }, { label: "Routing" }]}
      />
      <PageContent className="space-y-6">
        {error && (
          <ErrorMessage
            message={error.message}
            onRetry={() => void refetch()}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Load a Routing List</CardTitle>
            <CardDescription>
              Routing lists are keyed by a serial stream. Enter a stream_id to load.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="stream_id">Stream ID</Label>
              <Input
                id="stream_id"
                value={streamIdInput}
                onChange={(e) => setStreamIdInput(e.target.value)}
                placeholder="e.g. 123"
              />
            </div>
            <Button
              onClick={() => setStreamId(streamIdInput.trim())}
              disabled={isLoading || !streamIdInput.trim()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Load
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Routing List Users
            </CardTitle>
            <CardDescription>
              {streamId 
                ? `Routing list for stream #${streamId}` 
                : "Evergreen routing list entries."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={routing}
              isLoading={isLoading}
              searchable
              searchPlaceholder="Search routing..."
              paginated={false}
              emptyState={
                <EmptyState
                  title={streamId ? "No routing entries" : "Routing list requires stream_id"}
                  description={
                    message ||
                    (streamId
                      ? "No routing list users were returned for this stream_id."
                      : "Provide a stream_id to load a routing list.")
                  }
                />
              }
            />
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
