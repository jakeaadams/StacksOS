/**
 * Item Statuses (Read-only)
 * Evergreen is the source of truth for config.copy_status
 */

"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
} from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CircleDot,
  Check,
  X,
  Lock,
  Eye,
  EyeOff,
  Calendar,
  AlertTriangle,
  RefreshCcw,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

interface ItemStatus {
  id: number;
  name: string;
  holdable: boolean;
  opacVisible: boolean;
  copyActive: boolean;
  isAvailable: boolean;
  restrictCopyDelete: boolean;
  hopelessProne: boolean;
}

const dotPalette = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-violet-500",
  "bg-slate-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-sky-500",
  "bg-stone-500",
  "bg-rose-500",
  "bg-lime-500",
];

function dotColorForId(id: number): string {
  const index = Math.abs(id || 0) % dotPalette.length;
  return dotPalette[index]!;
}

export default function ItemStatusPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ItemStatus[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/evergreen/copy-statuses", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const rows = Array.isArray(json.statuses) ? json.statuses : [];
      setStatuses(
        rows.map((s: any) => ({
          id: Number(s?.id) || 0,
          name: String(s?.name || ""),
          holdable: Boolean(s?.holdable),
          opacVisible: Boolean(s?.opacVisible),
          copyActive: Boolean(s?.copyActive),
          isAvailable: Boolean(s?.isAvailable),
          restrictCopyDelete: Boolean(s?.restrictCopyDelete),
          hopelessProne: Boolean(s?.hopelessProne),
        }))
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredStatuses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return statuses;
    return statuses.filter((s) => s.name.toLowerCase().includes(q));
  }, [searchQuery, statuses]);

  const stats = useMemo(() => {
    const availableCount = statuses.filter((s) => s.isAvailable).length;
    const holdableCount = statuses.filter((s) => s.holdable).length;
    const opacVisibleCount = statuses.filter((s) => s.opacVisible).length;
    return { availableCount, holdableCount, opacVisibleCount, total: statuses.length };
  }, [statuses]);

  const BoolIcon = ({ value }: { value: boolean }) =>
    value ? (
      <Check className="h-4 w-4 text-emerald-600" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground/50" />
    );

  const columns: ColumnDef<ItemStatus>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.id}</span>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${dotColorForId(row.original.id)}`} />
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "holdable",
      header: "Holdable",
      cell: ({ row }) => <BoolIcon value={row.original.holdable} />,
    },
    {
      accessorKey: "opacVisible",
      header: "OPAC",
      cell: ({ row }) =>
        row.original.opacVisible ? (
          <Eye className="h-4 w-4 text-emerald-600" />
        ) : (
          <EyeOff className="h-4 w-4 text-muted-foreground/50" />
        ),
    },
    {
      accessorKey: "copyActive",
      header: "Active",
      cell: ({ row }) => <BoolIcon value={row.original.copyActive} />,
    },
    {
      accessorKey: "isAvailable",
      header: "Available",
      cell: ({ row }) => (
        <Badge
          variant={row.original.isAvailable ? "default" : "secondary"}
          className={row.original.isAvailable ? "bg-emerald-100 text-emerald-700" : ""}
        >
          {row.original.isAvailable ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      accessorKey: "restrictCopyDelete",
      header: "Protect",
      cell: ({ row }) =>
        row.original.restrictCopyDelete ? (
          <Lock className="h-4 w-4 text-amber-600" />
        ) : (
          <span className="text-muted-foreground/50">-</span>
        ),
    },
    {
      accessorKey: "hopelessProne",
      header: "Hopeless",
      cell: ({ row }) =>
        row.original.hopelessProne ? (
          <AlertTriangle className="h-4 w-4 text-red-600" />
        ) : (
          <span className="text-muted-foreground/50">-</span>
        ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Item Statuses"
        subtitle="Read-only view of Evergreen copy status definitions"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Item Statuses" }]}
        actions={[
          {
            label: loading ? "Refreshing…" : "Refresh",
            onClick: () => void load(),
            icon: RefreshCcw,
          },
        ]}
      />
      <PageContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/20 border-emerald-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-600">Available</p>
                  <p className="text-3xl font-bold text-emerald-700">{stats.availableCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Check className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/20 border-blue-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Holdable</p>
                  <p className="text-3xl font-bold text-blue-700">{stats.holdableCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/20 border-purple-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">OPAC Visible</p>
                  <p className="text-3xl font-bold text-purple-700">{stats.opacVisibleCount}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Eye className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/20 border-amber-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-600">Total Statuses</p>
                  <p className="text-3xl font-bold text-amber-700">{stats.total}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <CircleDot className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>All Statuses</CardTitle>
                <CardDescription>Source of truth is Evergreen (Config → Item Statuses)</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search statuses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-[250px]"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <EmptyState
                title="Couldn’t load item statuses"
                description={error}
                action={{ label: "Retry", onClick: () => void load() }}
              />
            ) : loading ? (
              <EmptyState title="Loading…" description="Fetching copy statuses from Evergreen." />
            ) : filteredStatuses.length === 0 ? (
              <EmptyState title="No statuses found" description="Try adjusting your search." />
            ) : (
              <DataTable columns={columns} data={filteredStatuses} />
            )}
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

