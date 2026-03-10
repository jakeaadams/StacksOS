"use client";

import type { ColumnDef } from "@tanstack/react-table";

import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  HoldStatusBadge,
  StatusBadge,
} from "@/components/shared";

import type { CheckinItem } from "./types";

interface CheckinActivityTableProps {
  data: CheckinItem[];
  onSelectionChange: (rows: CheckinItem[]) => void;
}

export function CheckinActivityTable({ data, onSelectionChange }: CheckinActivityTableProps) {
  const columns: ColumnDef<CheckinItem>[] = [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        if (status === "hold") {
          return <HoldStatusBadge status="available" />;
        }
        if (status === "transit") {
          return <StatusBadge label="In Transit" status="info" showIcon />;
        }
        if (status === "error") {
          return <StatusBadge label="Error" status="error" showIcon />;
        }
        if (status === "alert") {
          return <StatusBadge label="Alert" status="warning" showIcon />;
        }
        return <StatusBadge label="Checked In" status="success" showIcon />;
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-medium">{row.original.title}</div>
          {row.original.author && (
            <div className="text-xs text-muted-foreground">{row.original.author}</div>
          )}
          {row.original.message && (
            <div
              className={`text-xs ${row.original.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {row.original.message}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "barcode",
      header: "Barcode",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span>,
    },
    {
      accessorKey: "callNumber",
      header: "Call Number",
      cell: ({ row }) => <span className="text-xs">{row.original.callNumber}</span>,
    },
    {
      accessorKey: "timestamp",
      header: "Time",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      searchable
      searchPlaceholder="Search by title, barcode, call number..."
      emptyState={
        <EmptyState
          title="No items checked in yet"
          description="Scan an item barcode to begin processing returns."
        />
      }
      selectable
      onSelectionChange={onSelectionChange}
    />
  );
}
