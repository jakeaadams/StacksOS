"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
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

import { useApi } from "@/hooks";
import { Newspaper } from "lucide-react";

interface SubscriptionRow {
  id: number;
  owning_lib?: number;
  start_date?: string;
  end_date?: string;
  record_entry?: number;
}

export default function SubscriptionsPage() {
  const router = useRouter();

  const { data, error, isLoading } = useApi<any>(
    "/api/evergreen/serials?action=subscriptions",
    { immediate: true }
  );

  const subscriptions: SubscriptionRow[] = data?.subscriptions || [];
  const message = typeof data?.message === "string" ? data.message : "";

  const columns = useMemo<ColumnDef<SubscriptionRow>[]>(
    () => [
      { accessorKey: "id", header: "ID" },
      { accessorKey: "record_entry", header: "Record" },
      { accessorKey: "owning_lib", header: "Owning Lib" },
      {
        accessorKey: "start_date",
        header: "Start",
        cell: ({ row }) =>
          row.original.start_date
            ? new Date(row.original.start_date).toLocaleDateString()
            : "—",
      },
      {
        accessorKey: "end_date",
        header: "End",
        cell: ({ row }) =>
          row.original.end_date
            ? new Date(row.original.end_date).toLocaleDateString()
            : "—",
      },
    ],
    []
  );

  // Show SetupRequired if no subscriptions and not loading
  if (!isLoading && subscriptions.length === 0 && !error) {
    return (
      <PageContainer>
        <PageHeader
          title="Subscriptions"
          subtitle="Serial subscriptions managed by Evergreen."
          breadcrumbs={[
            { label: "Serials", href: "/staff/serials" },
            { label: "Subscriptions" },
          ]}
        />
        <PageContent>
          <SetupRequired
            {...SETUP_CONFIGS.serials}
            docsUrl="/staff/help#serials"
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Subscriptions"
        subtitle="Serial subscriptions managed by Evergreen."
        breadcrumbs={[
          { label: "Serials", href: "/staff/serials" },
          { label: "Subscriptions" },
        ]}
      />
      <PageContent>
        {error && (
          <div className="mb-4">
            <ErrorMessage
              message={error.message}
              onRetry={() => void router.refresh()}
            />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              Subscriptions
            </CardTitle>
            <CardDescription>Evergreen serial subscriptions.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={subscriptions}
              isLoading={isLoading}
              searchable
              searchPlaceholder="Search subscriptions..."
              paginated={true}
              emptyState={
                <EmptyState
                  title="No subscriptions"
                  description={
                    message ||
                    "Subscriptions listing is not configured or no data is available."
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
