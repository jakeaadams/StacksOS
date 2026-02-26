"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  CircMatchpointDraft,
  DurationRule,
  FineRule,
  MaxFineRule,
  CircModifier,
  OrgOption,
  PermGroup,
  CopyLocation,
} from "./policy-types";

function depthPaddingClass(depth: number): string {
  if (depth <= 0) return "pl-0";
  if (depth === 1) return "pl-3";
  if (depth === 2) return "pl-6";
  if (depth === 3) return "pl-9";
  if (depth === 4) return "pl-12";
  return "pl-14";
}

export interface MatchpointEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  editingId: number | null;
  draft: CircMatchpointDraft;
  setDraft: React.Dispatch<React.SetStateAction<CircMatchpointDraft>>;
  onSave: () => void;
  isMutating: boolean;
  previewRows: Array<{ label: string; from: string; to: string; changed: boolean }>;
  // Select options
  orgOptions: OrgOption[];
  orgTreeLoading: boolean;
  groups: PermGroup[];
  groupsLoading: boolean;
  circModifiers: CircModifier[];
  modifiersLoading: boolean;
  copyLocations: CopyLocation[];
  copyLocationsLoading: boolean;
  durationRules: DurationRule[];
  durationLoading: boolean;
  fineRules: FineRule[];
  fineLoading: boolean;
  maxFineRules: MaxFineRule[];
  maxFineLoading: boolean;
}

export function MatchpointEditorDialog(props: MatchpointEditorDialogProps) {
  const { draft, setDraft, mode, editingId, previewRows, isMutating } = props;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? "New circulation matchpoint"
              : `Edit matchpoint #${editingId ?? "\u2014"}`}
          </DialogTitle>
          <DialogDescription>
            Writes apply immediately in Evergreen and are recorded in the StacksOS audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4">
              <div className="min-w-0">
                <Label htmlFor="active" className="text-sm">
                  Active
                </Label>
                <p className="text-xs text-muted-foreground">
                  Inactive matchpoints are ignored by Evergreen.
                </p>
              </div>
              <Switch
                id="active"
                checked={draft.active}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, active: checked }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Org unit {mode === "create" ? "*" : ""}</Label>
                <Select
                  value={draft.orgUnit ? String(draft.orgUnit) : "__unset__"}
                  onValueChange={(v) =>
                    setDraft((prev) => ({
                      ...prev,
                      orgUnit: v === "__unset__" ? null : parseInt(v, 10),
                    }))
                  }
                  disabled={props.orgTreeLoading || props.orgOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={props.orgTreeLoading ? "Loading\u2026" : "Select org unit"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__" disabled>
                      Select org unit
                    </SelectItem>
                    {props.orgOptions.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        <span className={`block truncate ${depthPaddingClass(o.depth)}`}>
                          {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Patron group</Label>
                <Select
                  value={draft.grp ? String(draft.grp) : "__any__"}
                  onValueChange={(v) =>
                    setDraft((prev) => ({ ...prev, grp: v === "__any__" ? null : parseInt(v, 10) }))
                  }
                  disabled={props.groupsLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={props.groupsLoading ? "Loading\u2026" : "Any"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    {props.groups
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Circ modifier</Label>
                <Select
                  value={draft.circModifier ?? "__any__"}
                  onValueChange={(v) =>
                    setDraft((prev) => ({ ...prev, circModifier: v === "__any__" ? null : v }))
                  }
                  disabled={props.modifiersLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={props.modifiersLoading ? "Loading\u2026" : "Any"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    {props.circModifiers
                      .slice()
                      .sort((a, b) => a.code.localeCompare(b.code))
                      .map((m) => (
                        <SelectItem key={m.code} value={m.code}>
                          <span className="font-mono text-xs mr-2">{m.code}</span>
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Copy location</Label>
                <Select
                  value={draft.copyLocation ? String(draft.copyLocation) : "__any__"}
                  onValueChange={(v) =>
                    setDraft((prev) => ({
                      ...prev,
                      copyLocation: v === "__any__" ? null : parseInt(v, 10),
                    }))
                  }
                  disabled={props.copyLocationsLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={props.copyLocationsLoading ? "Loading\u2026" : "Any"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    {props.copyLocations
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((loc) => (
                        <SelectItem key={loc.id} value={String(loc.id)}>
                          {loc.name}
                          {loc.owningLibShortname ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({loc.owningLibShortname})
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4">
                <div className="min-w-0">
                  <Label className="text-sm">Circulate</Label>
                  <p className="text-xs text-muted-foreground">
                    If disabled, Evergreen blocks checkout.
                  </p>
                </div>
                <Switch
                  checked={draft.circulate}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({ ...prev, circulate: checked }))
                  }
                />
              </div>
              <div className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Is renewal</Label>
                  <Select
                    value={draft.isRenewal === null ? "any" : draft.isRenewal ? "yes" : "no"}
                    onValueChange={(v) =>
                      setDraft((prev) => ({ ...prev, isRenewal: v === "any" ? null : v === "yes" }))
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Reference</Label>
                  <Select
                    value={draft.refFlag === null ? "any" : draft.refFlag ? "yes" : "no"}
                    onValueChange={(v) =>
                      setDraft((prev) => ({ ...prev, refFlag: v === "any" ? null : v === "yes" }))
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Duration rule</Label>
                <Select
                  value={draft.durationRule ? String(draft.durationRule) : "__any__"}
                  onValueChange={(v) =>
                    setDraft((prev) => ({
                      ...prev,
                      durationRule: v === "__any__" ? null : parseInt(v, 10),
                    }))
                  }
                  disabled={props.durationLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={props.durationLoading ? "Loading\u2026" : "Any"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    {props.durationRules.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fine rule</Label>
                <Select
                  value={draft.recurringFineRule ? String(draft.recurringFineRule) : "__any__"}
                  onValueChange={(v) =>
                    setDraft((prev) => ({
                      ...prev,
                      recurringFineRule: v === "__any__" ? null : parseInt(v, 10),
                    }))
                  }
                  disabled={props.fineLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={props.fineLoading ? "Loading\u2026" : "Any"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    {props.fineRules.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max fine rule</Label>
                <Select
                  value={draft.maxFineRule ? String(draft.maxFineRule) : "__any__"}
                  onValueChange={(v) =>
                    setDraft((prev) => ({
                      ...prev,
                      maxFineRule: v === "__any__" ? null : parseInt(v, 10),
                    }))
                  }
                  disabled={props.maxFineLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={props.maxFineLoading ? "Loading\u2026" : "Any"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any</SelectItem>
                    {props.maxFineRules.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional notes (who/what this matchpoint is for)"
                className="min-h-[90px]"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">Preview changes</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Review before saving. Permission required:{" "}
              <span className="font-mono">ADMIN_CIRC_MATRIX_MATCHPOINT</span>.
            </p>
            <div className="mt-4 space-y-2">
              {previewRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {previewRows.map((r) => (
                    <li key={r.label} className="rounded-xl border border-border/70 bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium">{r.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {mode === "create" ? "new" : "changed"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {mode === "create" ? (
                          <span>{r.to}</span>
                        ) : (
                          <span>
                            <span className="line-through">{r.from}</span> &rarr;{" "}
                            <span className="text-foreground">{r.to}</span>
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={isMutating}>
            Cancel
          </Button>
          <Button
            onClick={props.onSave}
            disabled={isMutating || (mode === "edit" && previewRows.length === 0)}
          >
            Review &amp; Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
