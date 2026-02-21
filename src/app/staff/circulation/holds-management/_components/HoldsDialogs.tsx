"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileText, MapPin, Snowflake } from "lucide-react";
import type { Hold } from "./holds-types";

export interface HoldsDialogsProps {
  selectedHold: Hold | null;
  loading: boolean;
  // Clear shelf
  clearShelfDialogOpen: boolean;
  setClearShelfDialogOpen: (open: boolean) => void;
  onClearShelf: () => void;
  orgName: string;
  orgId: number;
  // Cancel
  cancelDialogOpen: boolean;
  setCancelDialogOpen: (open: boolean) => void;
  cancelReason: string;
  setCancelReason: (v: string) => void;
  cancelNote: string;
  setCancelNote: (v: string) => void;
  onCancelHold: () => void;
  // Freeze
  freezeDialogOpen: boolean;
  setFreezeDialogOpen: (open: boolean) => void;
  thawDate: string;
  setThawDate: (v: string) => void;
  onFreezeHold: () => void;
  // Change pickup
  changePickupDialogOpen: boolean;
  setChangePickupDialogOpen: (open: boolean) => void;
  newPickupLib: string;
  setNewPickupLib: (v: string) => void;
  onChangePickupLib: () => void;
  // Add note
  addNoteDialogOpen: boolean;
  setAddNoteDialogOpen: (open: boolean) => void;
  noteTitle: string;
  setNoteTitle: (v: string) => void;
  noteBody: string;
  setNoteBody: (v: string) => void;
  noteStaffOnly: boolean;
  setNoteStaffOnly: (v: boolean) => void;
  onAddNote: () => void;
}

export function HoldsDialogs(props: HoldsDialogsProps) {
  const { selectedHold, loading } = props;

  return (
    <>
      <Dialog open={props.clearShelfDialogOpen} onOpenChange={props.setClearShelfDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Holds Shelf</DialogTitle>
            <DialogDescription>
              Run Evergreen&apos;s clear-shelf process for <span className="font-medium">{props.orgName}</span> (Org #{props.orgId}).
              Use this for expired or wrong-shelf holds.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            This is a bulk action. Depending on shelf size, it may take a moment.
            Results will appear in the <span className="font-medium">Expired</span> tab when complete.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setClearShelfDialogOpen(false)} disabled={loading}>Cancel</Button>
            <Button variant="destructive" onClick={props.onClearShelf} disabled={loading}>Clear Shelf</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.cancelDialogOpen} onOpenChange={props.setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Hold</DialogTitle>
            <DialogDescription>Cancel the hold for <span className="font-medium">{selectedHold?.title || "this title"}</span>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Cancel Reason</Label>
              <Select id="cancel-reason" value={props.cancelReason} onValueChange={props.setCancelReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Patron Request</SelectItem>
                  <SelectItem value="4">Staff Cancel</SelectItem>
                  <SelectItem value="5">Item Not Found</SelectItem>
                  <SelectItem value="6">Target Deleted</SelectItem>
                  <SelectItem value="7">Item Too Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" value={props.cancelNote} onChange={(e) => props.setCancelNote(e.target.value)} placeholder="Add a note..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setCancelDialogOpen(false)}>Keep Hold</Button>
            <Button variant="destructive" onClick={props.onCancelHold} disabled={loading}>Cancel Hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.freezeDialogOpen} onOpenChange={props.setFreezeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Freeze Hold</DialogTitle>
            <DialogDescription>Temporarily suspend the hold for <span className="font-medium">{selectedHold?.title || "this title"}</span>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="thaw-date">Thaw Date (optional)</Label>
              <Input id="thaw-date" type="date" value={props.thawDate} onChange={(e) => props.setThawDate(e.target.value)} />
              <p className="text-sm text-muted-foreground">Leave empty to freeze indefinitely</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setFreezeDialogOpen(false)}>Cancel</Button>
            <Button onClick={props.onFreezeHold} disabled={loading}><Snowflake className="h-4 w-4 mr-2" />Freeze Hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.changePickupDialogOpen} onOpenChange={props.setChangePickupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Pickup Library</DialogTitle>
            <DialogDescription>Change where <span className="font-medium">{selectedHold?.title || "this title"}</span> will be picked up.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pickup-library">New Pickup Library</Label>
              <Input id="new-pickup-library" type="number" value={props.newPickupLib} onChange={(e) => props.setNewPickupLib(e.target.value)} placeholder="Library ID" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setChangePickupDialogOpen(false)}>Cancel</Button>
            <Button onClick={props.onChangePickupLib} disabled={loading || !props.newPickupLib}><MapPin className="h-4 w-4 mr-2" />Change Library</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.addNoteDialogOpen} onOpenChange={props.setAddNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Hold Note</DialogTitle>
            <DialogDescription>Add a note to the hold for <span className="font-medium">{selectedHold?.title || "this title"}</span>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={props.noteTitle} onChange={(e) => props.setNoteTitle(e.target.value)} placeholder="Note title..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-2">Note</Label>
              <Textarea id="note-2" value={props.noteBody} onChange={(e) => props.setNoteBody(e.target.value)} placeholder="Enter note..." />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="staffOnly" checked={props.noteStaffOnly} onCheckedChange={(checked) => props.setNoteStaffOnly(checked as boolean)} />
              <Label htmlFor="staffOnly">Staff only (not visible to patron)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setAddNoteDialogOpen(false)}>Cancel</Button>
            <Button onClick={props.onAddNote} disabled={loading || !props.noteBody}><FileText className="h-4 w-4 mr-2" />Add Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
