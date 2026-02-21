"use client";

import Link from "next/link";
import { Edit } from "lucide-react";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParsedMarcRecord, FixedFieldRow } from "./record-types";
import { formatMarcSubfields } from "./record-utils";

interface MarcViewTabProps {
  parsedMarc: ParsedMarcRecord | null;
  leaderRows: FixedFieldRow[];
  field008Rows: FixedFieldRow[];
  recordId: number;
}

function FixedFieldTable({ title, rows }: { title: string; rows: FixedFieldRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <div className="rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Pos</th>
                <th scope="col" className="px-3 py-2 text-left">Label</th>
                <th scope="col" className="px-3 py-2 text-left">Value</th>
                <th scope="col" className="px-3 py-2 text-left">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.position} className="border-t align-top">
                  <td className="px-3 py-2 font-mono text-xs">{row.position}</td>
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.value || "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function MarcViewTab({ parsedMarc, leaderRows, field008Rows, recordId }: MarcViewTabProps) {
  if (!parsedMarc) {
    return (
      <EmptyState
        title="MARC data unavailable"
        description="This record did not return MARCXML in the current response."
        action={{ label: "Open MARC Editor", onClick: () => window.location.assign(`/staff/cataloging/marc-editor?id=${recordId}`), icon: Edit }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {parsedMarc.controlFields.length + parsedMarc.dataFields.length + 1} fields loaded from MARC record
        </p>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/staff/cataloging/marc-editor?id=${recordId}`}>
            <Edit className="h-4 w-4 mr-2" /> Open Full MARC Editor
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <FixedFieldTable title="Leader Fixed Fields" rows={leaderRows} />
        <FixedFieldTable title="008 Fixed Fields" rows={field008Rows} />
      </div>
      <div className="rounded border">
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Tag</th>
                <th scope="col" className="px-3 py-2 text-left">Ind</th>
                <th scope="col" className="px-3 py-2 text-left">Subfields</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t align-top">
                <td className="px-3 py-2 font-mono">LDR</td>
                <td className="px-3 py-2 font-mono">--</td>
                <td className="px-3 py-2 font-mono text-xs">{parsedMarc.leader || "-"}</td>
              </tr>
              {parsedMarc.controlFields.map((field, idx) => (
                <tr key={`cf-${field.tag}-${idx}`} className="border-t align-top">
                  <td className="px-3 py-2 font-mono">{field.tag}</td>
                  <td className="px-3 py-2 font-mono">--</td>
                  <td className="px-3 py-2 font-mono text-xs break-all">{field.value || "-"}</td>
                </tr>
              ))}
              {parsedMarc.dataFields.map((field, idx) => (
                <tr key={`df-${field.tag}-${idx}`} className="border-t align-top">
                  <td className="px-3 py-2 font-mono">{field.tag}</td>
                  <td className="px-3 py-2 font-mono">{`${field.ind1}${field.ind2}`}</td>
                  <td className="px-3 py-2 font-mono text-xs break-words">{formatMarcSubfields(field.subfields)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
