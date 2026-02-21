"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RotateCcw } from "lucide-react";
import { DataTableColumnHeader } from "@/components/shared";
import type { TransactionRow, PatronMini } from "./bills-utils";
import { formatCurrency } from "./bills-utils";

interface OutstandingColumnsOpts {
  outstanding: TransactionRow[];
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (xactId: number, checked: boolean) => void;
}

export function useOutstandingColumns(opts: OutstandingColumnsOpts) {
  return useMemo<ColumnDef<TransactionRow>[]>(() => [
    {
      id: "select",
      header: () => (
        <Checkbox checked={opts.outstanding.length > 0 && opts.outstanding.every((r) => r.selected)} onCheckedChange={(checked) => opts.onSelectAll(!!checked)} />
      ),
      cell: ({ row }) => (
        <Checkbox checked={row.original.selected} onCheckedChange={(checked) => opts.onSelectOne(row.original.xactId, !!checked)} disabled={row.original.balance <= 0} />
      ),
    },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge variant="outline" className="text-[10px] uppercase">{row.original.type}</Badge> },
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Item / Description" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{row.original.title}</div>
          {row.original.barcode !== "-" && <div className="text-[11px] text-muted-foreground font-mono">{row.original.barcode}</div>}
        </div>
      ),
    },
    { accessorKey: "billedDate", header: "Billed", cell: ({ row }) => <span className="text-xs">{row.original.billedDate || "\u2014"}</span> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="text-xs mono">{formatCurrency(row.original.amount)}</span> },
    { accessorKey: "paid", header: "Paid", cell: ({ row }) => <span className="text-xs text-emerald-600 mono">{formatCurrency(row.original.paid)}</span> },
    { accessorKey: "balance", header: "Balance", cell: ({ row }) => <span className="text-xs font-semibold text-rose-600 mono">{formatCurrency(row.original.balance)}</span> },
  ], [opts]);
}

interface AllColumnsOpts {
  onRefund: (row: TransactionRow) => void;
  patron: PatronMini | null;
}

export function useAllColumns(opts: AllColumnsOpts) {
  return useMemo<ColumnDef<TransactionRow>[]>(() => [
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge variant="outline" className="text-[10px] uppercase">{row.original.type}</Badge> },
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Item / Description" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{row.original.title}</div>
          {row.original.barcode !== "-" && <div className="text-[11px] text-muted-foreground font-mono">{row.original.barcode}</div>}
        </div>
      ),
    },
    { accessorKey: "billedDate", header: "Billed", cell: ({ row }) => <span className="text-xs">{row.original.billedDate || "\u2014"}</span> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="text-xs mono">{formatCurrency(row.original.amount)}</span> },
    { accessorKey: "paid", header: "Paid", cell: ({ row }) => <span className="text-xs text-emerald-600 mono">{formatCurrency(row.original.paid)}</span> },
    { accessorKey: "balance", header: "Balance", cell: ({ row }) => <span className="text-xs font-semibold mono">{formatCurrency(row.original.balance)}</span> },
    {
      id: "actions", header: "Actions",
      cell: ({ row }) => (
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => opts.onRefund(row.original)} disabled={row.original.paid <= 0 || !opts.patron}>
          <RotateCcw className="h-3.5 w-3.5" />Refund
        </Button>
      ),
    },
  ], [opts]);
}
