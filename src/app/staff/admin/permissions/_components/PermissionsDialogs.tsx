"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ConfirmDialog } from "@/components/shared";
import type { PermGroup, GroupPerm, EvergreenPermission } from "./permissions-types";

interface GroupDraft {
  id: number | null;
  name: string;
  parent: number | null;
  description: string;
  applicationPerm: string;
}

interface MappingDraft {
  id: number | null;
  permId: number | null;
  depth: number;
  grantable: boolean;
}

export interface PermissionsDialogsProps {
  // Group dialog
  groupDialogOpen: boolean;
  setGroupDialogOpen: (open: boolean) => void;
  groupDialogMode: "create" | "edit";
  groupDraft: GroupDraft;
  setGroupDraft: React.Dispatch<React.SetStateAction<GroupDraft>>;
  groups: PermGroup[];
  onSaveGroup: () => void;
  canEdit: boolean;
  isMutating: boolean;
  // Mapping dialog
  mappingDialogOpen: boolean;
  setMappingDialogOpen: (open: boolean) => void;
  mappingDialogMode: "add" | "edit";
  mappingDraft: MappingDraft;
  setMappingDraft: React.Dispatch<React.SetStateAction<MappingDraft>>;
  selectedGroup: PermGroup | null;
  selectedGroupId: number | null;
  selectedPerm: EvergreenPermission | null;
  availablePermissions: EvergreenPermission[];
  permPickerOpen: boolean;
  setPermPickerOpen: (open: boolean) => void;
  permissionsLoading: boolean;
  permissionsError: any;
  onSaveMapping: () => void;
  // Remove dialog
  removeDialogOpen: boolean;
  setRemoveDialogOpen: (open: boolean) => void;
  removeTarget: GroupPerm | null;
  onRemoveMapping: () => void;
}

export function PermissionsDialogs(props: PermissionsDialogsProps) {
  const { groupDraft, setGroupDraft, mappingDraft, setMappingDraft, isMutating, canEdit } = props;

  return (
    <>
      <Dialog open={props.groupDialogOpen} onOpenChange={props.setGroupDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{props.groupDialogMode === "create" ? "Create permission group" : "Edit permission group"}</DialogTitle>
            <DialogDescription>Changes apply immediately in Evergreen. Use a test group first if you are unsure.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="pgt-name">Name</Label>
              <Input id="pgt-name" value={groupDraft.name} onChange={(e) => setGroupDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g., Circulation Supervisor" disabled={isMutating} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="parent-group">Parent group</Label>
              <Select id="parent-group" value={groupDraft.parent ? String(groupDraft.parent) : "none"} onValueChange={(v) => setGroupDraft((d) => ({ ...d, parent: v === "none" ? null : parseInt(v, 10) }))} disabled={isMutating}>
                <SelectTrigger><SelectValue placeholder="No parent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent</SelectItem>
                  {props.groups.filter((g) => g.id !== groupDraft.id).map((g) => (<SelectItem key={g.id} value={String(g.id)}>{g.name || `Group ${g.id}`} (#{g.id})</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pgt-app">Application perm (optional)</Label>
              <Input id="pgt-app" value={groupDraft.applicationPerm} onChange={(e) => setGroupDraft((d) => ({ ...d, applicationPerm: e.target.value }))} placeholder="e.g., GROUP_APPLICATION_PERM" disabled={isMutating} />
              <div className="text-xs text-muted-foreground">Controls who can administer this group in Evergreen.</div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pgt-desc">Description</Label>
              <Textarea id="pgt-desc" value={groupDraft.description} onChange={(e) => setGroupDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Optional notes about when to use this group." disabled={isMutating} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setGroupDialogOpen(false)} disabled={isMutating}>Cancel</Button>
            <Button onClick={props.onSaveGroup} disabled={isMutating || !canEdit || !groupDraft.name.trim()}>{props.groupDialogMode === "create" ? "Create" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.mappingDialogOpen} onOpenChange={(open) => { props.setMappingDialogOpen(open); if (!open) props.setPermPickerOpen(false); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{props.mappingDialogMode === "add" ? "Add permission to group" : "Edit permission mapping"}</DialogTitle>
            <DialogDescription>Depth and grantable behavior follow Evergreen semantics.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="group">Group</Label>
              <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                {props.selectedGroup?.name ? (
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{props.selectedGroup.name}</span><span className="font-mono text-xs text-muted-foreground">#{props.selectedGroup.id}</span></div>
                ) : props.selectedGroupId ? (
                  <span className="font-mono text-xs text-muted-foreground">#{props.selectedGroupId}</span>
                ) : (
                  <span className="text-muted-foreground">Select a group first</span>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="permission">Permission</Label>
              {props.mappingDialogMode === "edit" ? (
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                  <div className="font-mono text-xs">{props.selectedPerm?.code || `perm #${mappingDraft.permId ?? "\u2014"}`}</div>
                  {props.selectedPerm?.description ? <div className="mt-1 text-[11px] text-muted-foreground">{props.selectedPerm.description}</div> : null}
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {props.selectedPerm ? (
                      <><div className="font-mono text-xs truncate">{props.selectedPerm.code}</div>{props.selectedPerm.description ? <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{props.selectedPerm.description}</div> : null}</>
                    ) : (
                      <div className="text-sm text-muted-foreground">No permission selected</div>
                    )}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => props.setPermPickerOpen(!props.permPickerOpen)} disabled={isMutating || props.permissionsLoading || !!props.permissionsError || props.availablePermissions.length === 0}>
                    {props.permPickerOpen ? "Hide" : "Select"}
                  </Button>
                </div>
              )}
            </div>
            {props.mappingDialogMode === "add" && props.permPickerOpen ? (
              <div className="rounded-xl border border-border/70 overflow-hidden">
                <Command>
                  <CommandInput placeholder="Search permissions..." />
                  <CommandList className="max-h-64">
                    <CommandEmpty>No permissions found.</CommandEmpty>
                    <CommandGroup heading={`Available (${props.availablePermissions.length})`}>
                      {props.availablePermissions.map((p) => (
                        <CommandItem key={p.id} value={`${p.code} ${p.description || ""}`} onSelect={() => { setMappingDraft((d) => ({ ...d, permId: p.id })); props.setPermPickerOpen(false); }}>
                          <div className="min-w-0"><div className="font-mono text-xs">{p.code}</div>{p.description ? <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{p.description}</div> : null}</div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="pgpm-depth">Depth</Label>
              <Input id="pgpm-depth" type="number" value={String(mappingDraft.depth)} onChange={(e) => setMappingDraft((d) => ({ ...d, depth: Number.isFinite(parseInt(e.target.value, 10)) ? parseInt(e.target.value, 10) : 0 }))} disabled={isMutating} />
              <div className="text-xs text-muted-foreground">Use <span className="font-mono text-xs">0</span> for default depth. Evergreen uses this for scoping.</div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
              <div className="min-w-0"><div className="text-sm font-medium">Grantable</div><div className="text-xs text-muted-foreground">Allow this group to grant the permission to other groups.</div></div>
              <Switch checked={mappingDraft.grantable} onCheckedChange={(v) => setMappingDraft((d) => ({ ...d, grantable: v }))} disabled={isMutating} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setMappingDialogOpen(false)} disabled={isMutating}>Cancel</Button>
            <Button onClick={props.onSaveMapping} disabled={isMutating || !canEdit || (props.mappingDialogMode === "add" && !mappingDraft.permId)}>{props.mappingDialogMode === "add" ? "Add" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={props.removeDialogOpen}
        onOpenChange={props.setRemoveDialogOpen}
        title="Remove permission from group?"
        description="This removes the mapping from the selected Evergreen permission group."
        variant="danger"
        confirmText="Remove"
        isLoading={isMutating}
        onConfirm={props.onRemoveMapping}
      >
        <div className="text-sm">
          <div className="font-mono text-xs">{props.removeTarget?.permCode || `perm #${props.removeTarget?.perm ?? "\u2014"}`}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Group: {props.selectedGroup?.name ? `${props.selectedGroup.name} (#${props.selectedGroup.id})` : props.selectedGroupId ? `#${props.selectedGroupId}` : "\u2014"}
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
