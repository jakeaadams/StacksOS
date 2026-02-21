"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, EmptyState } from "@/components/shared";
import { PatronNoticesTab } from "@/components/patron/patron-notices-tab";
import { AlertTriangle, FileText, Plus, Trash2, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PatronDetails, CheckoutRow, HoldRow, BillRow, PatronNote, PenaltyType } from "./patron-types";
import { toDateLabel } from "./patron-types";

export interface PatronActivityTabsProps {
  patron: PatronDetails;
  patronId: number;
  checkouts: CheckoutRow[];
  holds: HoldRow[];
  bills: BillRow[];
  notes: PatronNote[];
  penaltyTypes: PenaltyType[];
  checkoutColumns: ColumnDef<CheckoutRow>[];
  holdColumns: ColumnDef<HoldRow>[];
  billColumns: ColumnDef<BillRow>[];
  onSetBlockDialogOpen: (open: boolean) => void;
  onSetNoteDialogOpen: (open: boolean) => void;
  onRemoveBlock: (penaltyId: number) => void;
  onDeleteNote: (noteId: number) => void;
}

export function PatronActivityTabs(props: PatronActivityTabsProps) {
  const { patron, patronId, checkouts, holds, bills, notes, penaltyTypes, checkoutColumns, holdColumns, billColumns } = props;
  const router = useRouter();
  const penalties = patron.standing_penalties || [];

  return (
    <Tabs defaultValue="activity" className="w-full">
      <TabsList>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="blocks" className="gap-2">
          Blocks {penalties.length > 0 && <Badge variant="destructive" className="h-5 w-5 p-0 text-xs">{penalties.length}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="notes" className="gap-2">
          Notes {notes.length > 0 && <Badge variant="secondary" className="h-5 w-5 p-0 text-xs">{notes.length}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="notices">Notices</TabsTrigger>
      </TabsList>

      <TabsContent value="activity" className="space-y-6 mt-4">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Checkouts</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={checkoutColumns}
                data={checkouts}
                searchable={false}
                emptyState={
                  <EmptyState
                    title="No checkouts"
                    description="No items currently checked out."
                    action={patron?.barcode ? { label: "Check out an item", onClick: () => router.push(`/staff/circulation/checkout?patron=${encodeURIComponent(patron.barcode)}`) } : undefined}
                  />
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Holds</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={holdColumns}
                data={holds}
                searchable={false}
                emptyState={
                  <EmptyState
                    title="No holds"
                    description="No active holds for this patron."
                    action={patron?.barcode ? { label: "Manage holds", onClick: () => router.push(`/staff/circulation/holds-management?patron=${encodeURIComponent(patron.barcode)}`) } : undefined}
                  />
                }
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Bills & Fees</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={billColumns}
              data={bills}
              searchable={false}
              emptyState={
                <EmptyState
                  title="No bills"
                  description="No outstanding bills."
                  action={patron?.barcode ? { label: "Open Bills & Payments", onClick: () => router.push(`/staff/circulation/bills?patron=${encodeURIComponent(patron.barcode)}`) } : undefined}
                />
              }
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="blocks" className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Standing Penalties (Blocks)</CardTitle>
              <CardDescription>Blocks prevent certain actions like checkout or holds</CardDescription>
            </div>
            <Button size="sm" onClick={() => props.onSetBlockDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Block</Button>
          </CardHeader>
          <CardContent>
            {penalties.length === 0 ? (
              <EmptyState title="No blocks" description="This patron has no standing penalties." />
            ) : (
              <div className="space-y-3">
                {penalties.map((penalty: any, idx: number) => {
                  const penaltyId = penalty.id || penalty.__p?.[0];
                  const penaltyTypeId = penalty.standing_penalty || penalty.__p?.[1];
                  const note = penalty.note || penalty.__p?.[2];
                  const setDate = penalty.set_date || penalty.__p?.[3];
                  const penaltyInfo = penaltyTypes.find(t => t.id === penaltyTypeId);

                  return (
                    <div key={penaltyId || idx} className="flex items-start justify-between p-3 rounded-lg border bg-destructive/5 border-destructive/20">
                      <div className="flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                        <div>
                          <div className="font-medium text-destructive">{penaltyInfo?.label || `Penalty #${penaltyTypeId}`}</div>
                          {note && <p className="text-sm text-muted-foreground mt-1">{note}</p>}
                          <p className="text-xs text-muted-foreground mt-1">Added {toDateLabel(setDate)}</p>
                        </div>
                      </div>
                      <Button variant="destructive" size="sm" onClick={() => props.onRemoveBlock(penaltyId)}><X className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notes" className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Patron Notes</CardTitle>
              <CardDescription>Staff and public notes attached to this patron</CardDescription>
            </div>
            <Button size="sm" onClick={() => props.onSetNoteDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Note</Button>
          </CardHeader>
          <CardContent>
            {notes.length === 0 ? (
              <EmptyState title="No notes" description="No notes have been added for this patron." />
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="flex items-start justify-between p-3 rounded-lg border">
                    <div className="flex gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{note.title}</span>
                          {note.public && <Badge variant="outline" className="text-xs">Public</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{note.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">Created {toDateLabel(note.createDate)}</p>
                      </div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => props.onDeleteNote(note.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notices" className="mt-4">
        <PatronNoticesTab patronId={patronId || 0} patronEmail={patron?.email} />
      </TabsContent>
    </Tabs>
  );
}
