"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader, StatusBadge } from "@/components/shared";
import { FileText, MapPin, Printer, RefreshCw, Snowflake, Sun, XCircle } from "lucide-react";
import type { Hold, PullListItem } from "./holds-types";

export function holdStatusBadge(hold: Hold) {
  if (hold.fulfillmentTime) return <StatusBadge label="Fulfilled" status="success" showIcon />;
  if (hold.captureTime) return <StatusBadge label="Ready" status="info" showIcon />;
  if (hold.frozen) return <StatusBadge label="Frozen" status="warning" showIcon />;
  if (hold.queuePosition === 1) return <StatusBadge label="Next" status="pending" showIcon />;
  return <StatusBadge label="Waiting" status="neutral" />;
}

interface HoldsColumnsOpts {
  onFreeze: (hold: Hold) => void;
  onThaw: (hold: Hold) => void;
  onChangePickup: (hold: Hold) => void;
  onReset: (hold: Hold) => void;
  onAddNote: (hold: Hold) => void;
  onCancel: (hold: Hold) => void;
}

export function useHoldsColumns(opts: HoldsColumnsOpts) {
  return useMemo<ColumnDef<Hold>[]>(() => [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.title}</div>
          {row.original.author && <div className="text-xs text-muted-foreground">{row.original.author}</div>}
        </div>
      ),
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => holdStatusBadge(row.original) },
    {
      accessorKey: "queuePosition", header: "Queue",
      cell: ({ row }) => row.original.queuePosition
        ? <span className="text-xs">#{row.original.queuePosition} of {row.original.potentialCopies || "?"}</span>
        : <span className="text-xs text-muted-foreground">-</span>,
    },
    {
      accessorKey: "requestTime", header: "Requested",
      cell: ({ row }) => <span className="text-xs">{format(new Date(row.original.requestTime), "MMM d, yyyy")}</span>,
    },
    {
      accessorKey: "pickupLib", header: "Pickup",
      cell: ({ row }) => <span className="text-xs">Lib #{row.original.pickupLib}</span>,
    },
    {
      id: "actions", header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.frozen ? (
            <Button variant="ghost" size="sm" onClick={() => opts.onThaw(row.original)}><Sun className="h-4 w-4" /></Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => opts.onFreeze(row.original)}><Snowflake className="h-4 w-4" /></Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => opts.onChangePickup(row.original)}><MapPin className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => opts.onReset(row.original)}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => opts.onAddNote(row.original)}><FileText className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => opts.onCancel(row.original)}><XCircle className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ], [opts]);
}

export function usePullColumns() {
  return useMemo<ColumnDef<PullListItem>[]>(() => [
    { accessorKey: "barcode", header: "Barcode", cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span> },
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.title}</div>
          {row.original.author && <div className="text-xs text-muted-foreground">{row.original.author}</div>}
        </div>
      ),
    },
    { accessorKey: "call_number", header: "Call Number", cell: ({ row }) => <span className="text-xs">{row.original.call_number}</span> },
    { accessorKey: "shelving_location", header: "Location", cell: ({ row }) => <span className="text-xs">{row.original.shelving_location}</span> },
    { accessorKey: "patron_barcode", header: "Patron", cell: ({ row }) => <span className="font-mono text-xs">{row.original.patron_barcode}</span> },
  ], []);
}

interface ShelfColumnsOpts {
  onPrintSlip: (hold: Hold) => void;
}

export function useShelfColumns(opts: ShelfColumnsOpts) {
  return useMemo<ColumnDef<Hold>[]>(() => [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hold" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.title}</div>
          <div className="text-xs text-muted-foreground">{row.original.author || "\u2014"} \u2022 <span className="font-mono">#{row.original.id}</span></div>
        </div>
      ),
    },
    {
      accessorKey: "patronBarcode", header: "Patron",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="text-xs">{row.original.patronName || "\u2014"}</div>
          <div className="text-xs font-mono text-muted-foreground">{row.original.patronBarcode || "\u2014"}</div>
        </div>
      ),
    },
    { accessorKey: "itemBarcode", header: "Item", cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{row.original.itemBarcode || "\u2014"}</span> },
    { accessorKey: "callNumber", header: "Call Number", cell: ({ row }) => <span className="text-xs">{row.original.callNumber || "\u2014"}</span> },
    {
      accessorKey: "captureTime", header: "Captured",
      cell: ({ row }) => <span className="text-xs">{row.original.captureTime ? formatDistanceToNow(new Date(row.original.captureTime), { addSuffix: true }) : "-"}</span>,
    },
    {
      accessorKey: "shelfExpireTime", header: "Shelf Expires",
      cell: ({ row }) => <span className="text-xs">{row.original.shelfExpireTime ? formatDistanceToNow(new Date(row.original.shelfExpireTime), { addSuffix: true }) : "-"}</span>,
    },
    {
      id: "actions", header: "", enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => opts.onPrintSlip(row.original)}><Printer className="h-4 w-4 mr-1" />Print Slip</Button>
        </div>
      ),
    },
  ], [opts]);
}

export function useExpiredColumns(opts: ShelfColumnsOpts) {
  return useMemo<ColumnDef<Hold>[]>(() => [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Hold" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.title}</div>
          <div className="text-xs text-muted-foreground">{row.original.author || "\u2014"} \u2022 <span className="font-mono">#{row.original.id}</span></div>
        </div>
      ),
    },
    {
      accessorKey: "patronBarcode", header: "Patron",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="text-xs">{row.original.patronName || "\u2014"}</div>
          <div className="text-xs font-mono text-muted-foreground">{row.original.patronBarcode || "\u2014"}</div>
        </div>
      ),
    },
    { accessorKey: "itemBarcode", header: "Item", cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{row.original.itemBarcode || "\u2014"}</span> },
    {
      accessorKey: "shelfExpireTime", header: "Expired",
      cell: ({ row }) => <span className="text-xs">{row.original.shelfExpireTime ? formatDistanceToNow(new Date(row.original.shelfExpireTime), { addSuffix: true }) : "-"}</span>,
    },
    {
      id: "actions", header: "", enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => opts.onPrintSlip(row.original)}><Printer className="h-4 w-4 mr-1" />Print Slip</Button>
        </div>
      ),
    },
  ], [opts]);
}
