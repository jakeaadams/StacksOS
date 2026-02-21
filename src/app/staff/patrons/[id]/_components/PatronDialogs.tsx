"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PenaltyType } from "./patron-types";

interface EditForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  active: boolean;
  barred: boolean;
}

interface BlockForm {
  penaltyType: string;
  note: string;
}

interface NoteForm {
  title: string;
  value: string;
  public: boolean;
}

export interface PatronDialogsProps {
  // Edit
  editDialogOpen: boolean;
  setEditDialogOpen: (open: boolean) => void;
  editForm: EditForm;
  setEditForm: (form: EditForm) => void;
  onSaveEdit: () => void;
  // Block
  blockDialogOpen: boolean;
  setBlockDialogOpen: (open: boolean) => void;
  blockForm: BlockForm;
  setBlockForm: (form: BlockForm) => void;
  penaltyTypes: PenaltyType[];
  onAddBlock: () => void;
  // Note
  noteDialogOpen: boolean;
  setNoteDialogOpen: (open: boolean) => void;
  noteForm: NoteForm;
  setNoteForm: (form: NoteForm) => void;
  onAddNote: () => void;
}

export function PatronDialogs(props: PatronDialogsProps) {
  return (
    <>
      <Dialog open={props.editDialogOpen} onOpenChange={props.setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Patron</DialogTitle><DialogDescription>Update patron information</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="firstName">First Name</Label><Input id="firstName" value={props.editForm.firstName} onChange={(e) => props.setEditForm({ ...props.editForm, firstName: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="lastName">Last Name</Label><Input id="lastName" value={props.editForm.lastName} onChange={(e) => props.setEditForm({ ...props.editForm, lastName: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={props.editForm.email} onChange={(e) => props.setEditForm({ ...props.editForm, email: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" value={props.editForm.phone} onChange={(e) => props.setEditForm({ ...props.editForm, phone: e.target.value })} /></div>
            <div className="flex items-center justify-between"><div className="space-y-0.5"><Label htmlFor="active">Active</Label><p className="text-xs text-muted-foreground">Allow patron to use library services</p></div><Switch id="active" checked={props.editForm.active} onCheckedChange={(checked) => props.setEditForm({ ...props.editForm, active: checked })} /></div>
            <div className="flex items-center justify-between"><div className="space-y-0.5"><Label htmlFor="barred">Barred</Label><p className="text-xs text-muted-foreground">Block all library services</p></div><Switch id="barred" checked={props.editForm.barred} onCheckedChange={(checked) => props.setEditForm({ ...props.editForm, barred: checked })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => props.setEditDialogOpen(false)}>Cancel</Button><Button onClick={props.onSaveEdit}>Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.blockDialogOpen} onOpenChange={props.setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Block</DialogTitle><DialogDescription>Apply a standing penalty to this patron</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="penaltyType">Penalty Type</Label>
              <Select value={props.blockForm.penaltyType} onValueChange={(value) => props.setBlockForm({ ...props.blockForm, penaltyType: value })}>
                <SelectTrigger><SelectValue placeholder="Select penalty type" /></SelectTrigger>
                <SelectContent>{props.penaltyTypes.map((type) => (<SelectItem key={type.id} value={String(type.id)}>{type.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label htmlFor="blockNote">Note (optional)</Label><Textarea id="blockNote" value={props.blockForm.note} onChange={(e) => props.setBlockForm({ ...props.blockForm, note: e.target.value })} placeholder="Reason for this block..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => props.setBlockDialogOpen(false)}>Cancel</Button><Button onClick={props.onAddBlock} disabled={!props.blockForm.penaltyType}>Add Block</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.noteDialogOpen} onOpenChange={props.setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Note</DialogTitle><DialogDescription>Add a note to this patron record</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label htmlFor="noteTitle">Title</Label><Input id="noteTitle" value={props.noteForm.title} onChange={(e) => props.setNoteForm({ ...props.noteForm, title: e.target.value })} placeholder="Note title..." /></div>
            <div className="space-y-2"><Label htmlFor="noteValue">Note</Label><Textarea id="noteValue" value={props.noteForm.value} onChange={(e) => props.setNoteForm({ ...props.noteForm, value: e.target.value })} placeholder="Note content..." rows={4} /></div>
            <div className="flex items-center justify-between"><div className="space-y-0.5"><Label htmlFor="public">Public</Label><p className="text-xs text-muted-foreground">Visible to patron in their account</p></div><Switch id="public" checked={props.noteForm.public} onCheckedChange={(checked) => props.setNoteForm({ ...props.noteForm, public: checked })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => props.setNoteDialogOpen(false)}>Cancel</Button><Button onClick={props.onAddNote} disabled={!props.noteForm.value}>Add Note</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
