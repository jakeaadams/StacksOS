"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Edit3, Trash2 } from "lucide-react";
import { TableRowActions } from "@/components/shared";
import type { CircMatchpoint, DurationRule, FineRule, MaxFineRule, CircModifier } from "./policy-types";

interface MatchpointColumnsOpts {
  onEdit: (mp: CircMatchpoint) => void;
  onDelete: (mp: CircMatchpoint) => void;
}

export function useMatchpointColumns(opts: MatchpointColumnsOpts) {
  return useMemo<ColumnDef<CircMatchpoint>[]>(() => [
    { accessorKey: "id", header: "ID", cell: ({ row }) => <span className="font-mono text-xs">#{row.original.id}</span> },
    { accessorKey: "active", header: "Status", cell: ({ row }) => row.original.active ? <Badge className="rounded-full">Active</Badge> : <Badge variant="secondary" className="rounded-full">Inactive</Badge> },
    { accessorKey: "orgUnitName", header: "Org", cell: ({ row }) => <span className="truncate">{row.original.orgUnitName || "\u2014"}</span> },
    { accessorKey: "grpName", header: "Patron Group", cell: ({ row }) => <span className="truncate">{row.original.grpName || "Any"}</span> },
    { accessorKey: "circModifier", header: "Circ Modifier", cell: ({ row }) => row.original.circModifier ? <Badge variant="outline" className="rounded-full">{row.original.circModifier}</Badge> : <span className="text-muted-foreground text-xs">Any</span> },
    { accessorKey: "copyLocationName", header: "Copy Location", cell: ({ row }) => <span className="truncate">{row.original.copyLocationName || "Any"}</span> },
    { accessorKey: "durationRuleName", header: "Duration", cell: ({ row }) => <span className="truncate">{row.original.durationRuleName || "\u2014"}</span> },
    { accessorKey: "recurringFineRuleName", header: "Fine", cell: ({ row }) => <span className="truncate">{row.original.recurringFineRuleName || "\u2014"}</span> },
    { accessorKey: "maxFineRuleName", header: "Max Fine", cell: ({ row }) => <span className="truncate">{row.original.maxFineRuleName || "\u2014"}</span> },
    {
      id: "actions", header: "", enableSorting: false, enableHiding: false, size: 80,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <TableRowActions quickActions={["edit"]} actions={[
            { id: "edit", label: "Edit matchpoint", icon: Edit3, onClick: () => opts.onEdit(row.original) },
            { id: "delete", label: "Delete matchpoint", icon: Trash2, variant: "destructive", onClick: () => opts.onDelete(row.original) },
          ]} />
        </div>
      ),
    },
  ], [opts]);
}

export function useDurationColumns() {
  return useMemo<ColumnDef<DurationRule>[]>(() => [
    { accessorKey: "name", header: "Rule", cell: ({ row }) => (<div className="min-w-0"><div className="font-medium truncate">{row.original.name || `Rule ${row.original.id}`}</div><div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div></div>) },
    { accessorKey: "normal", header: "Normal", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.normal ?? "\u2014")}</span> },
    { accessorKey: "shrt", header: "Short", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.shrt ?? "\u2014")}</span> },
    { accessorKey: "extended", header: "Extended", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.extended ?? "\u2014")}</span> },
    { accessorKey: "maxRenewals", header: "Renewals", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.maxRenewals ?? "\u2014")}</span> },
    { accessorKey: "maxAutoRenewals", header: "Auto-renew", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.maxAutoRenewals ?? "\u2014")}</span> },
  ], []);
}

export function useFineColumns() {
  return useMemo<ColumnDef<FineRule>[]>(() => [
    { accessorKey: "name", header: "Rule", cell: ({ row }) => (<div className="min-w-0"><div className="font-medium truncate">{row.original.name || `Rule ${row.original.id}`}</div><div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div></div>) },
    { accessorKey: "normal", header: "Normal", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.normal ?? "\u2014")}</span> },
    { accessorKey: "high", header: "High", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.high ?? "\u2014")}</span> },
    { accessorKey: "low", header: "Low", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.low ?? "\u2014")}</span> },
    { accessorKey: "recurrenceInterval", header: "Interval", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.recurrenceInterval ?? "\u2014")}</span> },
    { accessorKey: "gracePeriod", header: "Grace", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.gracePeriod ?? "\u2014")}</span> },
  ], []);
}

export function useMaxFineColumns() {
  return useMemo<ColumnDef<MaxFineRule>[]>(() => [
    { accessorKey: "name", header: "Rule", cell: ({ row }) => (<div className="min-w-0"><div className="font-medium truncate">{row.original.name || `Rule ${row.original.id}`}</div><div className="text-[11px] text-muted-foreground font-mono">#{row.original.id}</div></div>) },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="font-mono text-xs">{String(row.original.amount ?? "\u2014")}</span> },
    { accessorKey: "isByPercent", header: "Type", cell: ({ row }) => row.original.isByPercent ? <Badge variant="secondary" className="rounded-full">Percent</Badge> : <Badge variant="outline" className="rounded-full">Fixed</Badge> },
  ], []);
}

export function useModifierColumns() {
  return useMemo<ColumnDef<CircModifier>[]>(() => [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    { accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "sip2MediaType", header: "SIP2", cell: ({ row }) => <span className="font-mono text-xs">{row.original.sip2MediaType || "\u2014"}</span> },
    { accessorKey: "magneticMedia", header: "Magnetic", cell: ({ row }) => row.original.magneticMedia ? <Badge variant="secondary" className="rounded-full">Yes</Badge> : <span className="text-muted-foreground text-xs">No</span> },
    { accessorKey: "description", header: "Description", cell: ({ row }) => <span className="text-muted-foreground text-xs line-clamp-2">{row.original.description || "\u2014"}</span> },
  ], []);
}
