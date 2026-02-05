"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";

import { useApi } from "@/hooks";
import { PageContainer, PageHeader, PageContent, DataTable, EmptyState } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

type FineRule = {
  id: number;
  name: string;
  high?: unknown;
  normal?: unknown;
  low?: unknown;
  recurrenceInterval?: unknown;
  gracePeriod?: unknown;
};

type MaxFineRule = {
  id: number;
  name: string;
  amount?: unknown;
  isByPercent?: boolean;
};

export default function FineConfigurationPage() {
  const {
    data: fineData,
    isLoading: fineLoading,
    error: fineError,
    refetch: refetchFineRules,
  } = useApi<any>("/api/evergreen/policies?type=fine_rules", { immediate: true, revalidateOnFocus: false });

  const {
    data: maxFineData,
    isLoading: maxFineLoading,
    error: maxFineError,
    refetch: refetchMaxFineRules,
  } = useApi<any>("/api/evergreen/policies?type=max_fine_rules", { immediate: true, revalidateOnFocus: false });

  const fineRules: FineRule[] = Array.isArray(fineData?.rules) ? fineData.rules : [];
  const maxFineRules: MaxFineRule[] = Array.isArray(maxFineData?.rules) ? maxFineData.rules : [];

  const fineColumns: ColumnDef<FineRule>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Rule",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name || `Rule ${row.original.id}`}</div>
            <div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div>
          </div>
        ),
      },
      {
        accessorKey: "normal",
        header: "Normal",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.normal ?? "—")}</span>,
      },
      {
        accessorKey: "high",
        header: "High",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.high ?? "—")}</span>,
      },
      {
        accessorKey: "low",
        header: "Low",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.low ?? "—")}</span>,
      },
      {
        accessorKey: "recurrenceInterval",
        header: "Interval",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.recurrenceInterval ?? "—")}</span>,
      },
      {
        accessorKey: "gracePeriod",
        header: "Grace",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.gracePeriod ?? "—")}</span>,
      },
    ],
    []
  );

  const maxFineColumns: ColumnDef<MaxFineRule>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Rule",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.name || `Rule ${row.original.id}`}</div>
            <div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.amount ?? "—")}</span>,
      },
      {
        accessorKey: "isByPercent",
        header: "Type",
        cell: ({ row }) =>
          row.original.isByPercent ? (
            <Badge variant="secondary" className="rounded-full">Percent</Badge>
          ) : (
            <Badge variant="outline" className="rounded-full">Fixed</Badge>
          ),
      },
    ],
    []
  );

  const hasError = Boolean(fineError || maxFineError);

  const handleRefresh = async () => {
    await Promise.allSettled([refetchFineRules(), refetchMaxFineRules()]);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Fines & Fees"
        subtitle="Evergreen-backed fine rules (read-only in StacksOS)."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Settings", href: "/staff/admin/settings" },
          { label: "Fines & Fees" },
        ]}
        actions={[{ label: "Refresh", onClick: () => void handleRefresh(), icon: RefreshCw, variant: "outline" }]}
      />

      <PageContent className="space-y-6">
        {hasError ? (
          <EmptyState
            title="Could not load fine rules"
            description={String(fineError || maxFineError)}
            action={{ label: "Try again", onClick: () => void handleRefresh(), icon: RefreshCw }}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recurring fine rules</CardTitle>
              <CardDescription>Overdue charge rules referenced by the circulation matrix.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rules</span>
                <span className="font-medium">{fineRules.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Maximum fine rules</CardTitle>
              <CardDescription>Caps on total fines (fixed amount or percent of item price).</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rules</span>
                <span className="font-medium">{maxFineRules.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rules</CardTitle>
            <CardDescription>These are read from Evergreen and used by circ matchpoints.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="recurring">
              <TabsList>
                <TabsTrigger value="recurring">Recurring</TabsTrigger>
                <TabsTrigger value="max">Maximum</TabsTrigger>
              </TabsList>

              <TabsContent value="recurring" className="mt-4">
                <DataTable
                  columns={fineColumns}
                  data={fineRules}
                  isLoading={fineLoading}
                  searchPlaceholder="Search fine rules..."
                  emptyState={
                    <EmptyState
                      title="No fine rules found"
                      description="Evergreen returned zero recurring fine rules."
                    />
                  }
                />
              </TabsContent>

              <TabsContent value="max" className="mt-4">
                <DataTable
                  columns={maxFineColumns}
                  data={maxFineRules}
                  isLoading={maxFineLoading}
                  searchPlaceholder="Search max fine rules..."
                  emptyState={
                    <EmptyState
                      title="No max fine rules found"
                      description="Evergreen returned zero maximum fine rules."
                    />
                  }
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
