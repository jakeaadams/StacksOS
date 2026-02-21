"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader, StatusBadge } from "@/components/shared";
import type { CheckoutRow, HoldRow, BillRow } from "./patron-types";
import { toDateLabel } from "./patron-types";

export function useCheckoutColumns() {
  return useMemo<ColumnDef<CheckoutRow>[]>(() => [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Item" />,
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="font-medium">{row.original.title}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.original.barcode}</div>
        </div>
      ),
    },
    { accessorKey: "dueDate", header: "Due", cell: ({ row }) => <span className="text-xs">{toDateLabel(row.original.dueDate)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} status={row.original.status === "Overdue" ? "error" : "info"} /> },
  ], []);
}

export function useHoldColumns() {
  return useMemo<ColumnDef<HoldRow>[]>(() => [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="font-medium">{row.original.title}</div>
          <div className="text-xs text-muted-foreground">{row.original.author || "\u2014"}</div>
        </div>
      ),
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} status={row.original.status === "Ready" ? "success" : "pending"} /> },
    { accessorKey: "pickupLib", header: "Pickup", cell: ({ row }) => <span className="text-xs">{row.original.pickupLib || "\u2014"}</span> },
    { accessorKey: "requestTime", header: "Requested", cell: ({ row }) => <span className="text-xs">{toDateLabel(row.original.requestTime)}</span> },
  ], []);
}

export function useBillColumns() {
  return useMemo<ColumnDef<BillRow>[]>(() => [
    { accessorKey: "title", header: ({ column }) => <DataTableColumnHeader column={column} title="Bill" />, cell: ({ row }) => <span className="text-sm">{row.original.title}</span> },
    { accessorKey: "amount", header: "Billed", cell: ({ row }) => <span className="text-xs">${row.original.amount.toFixed(2)}</span> },
    { accessorKey: "balance", header: "Balance", cell: ({ row }) => <span className={row.original.balance > 0 ? "text-xs text-destructive" : "text-xs"}>${row.original.balance.toFixed(2)}</span> },
    { accessorKey: "billedDate", header: "Billed", cell: ({ row }) => <span className="text-xs">{toDateLabel(row.original.billedDate)}</span> },
  ], []);
}
