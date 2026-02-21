"use client";
import { useEffect, useMemo, useState } from "react";
import { PageContainer, PageHeader, PageContent, ErrorMessage, EmptyState, ConfirmDialog } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, Calendar, History, Save, RotateCcw, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/client-fetch";

export default function LibraryHoursPage() {
  const [orgTree, setOrgTree] = useState<any>(null);
  const [orgId, setOrgId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hours, setHours] = useState<any | null>(null);
  const [closedDates, setClosedDates] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [note, setNote] = useState("");

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const blankHours = useMemo(
    () =>
      ({
        dow0: { open: null, close: null, note: null },
        dow1: { open: null, close: null, note: null },
        dow2: { open: null, close: null, note: null },
        dow3: { open: null, close: null, note: null },
        dow4: { open: null, close: null, note: null },
        dow5: { open: null, close: null, note: null },
        dow6: { open: null, close: null, note: null },
      }) as any,
    []
  );

  const orgOptions = useMemo(() => {
    const list: Array<{ id: number; label: string }> = [];
    const walk = (node: any, prefix: string) => {
      if (!node) return;
      const label = `${prefix}${node.shortname ? `${node.shortname} — ` : ""}${node.name}`;
      list.push({ id: node.id, label });
      const children = Array.isArray(node.children) ? node.children : [];
      for (const c of children) walk(c, prefix + "  ");
    };
    walk(orgTree, "");
    return list;
  }, [orgTree]);

  useEffect(() => {
    const loadTree = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithAuth("/api/evergreen/org-tree");
        const json = await res.json();
        if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load org tree");
        setOrgTree(json.tree);
        const first = json?.tree?.id ? json.tree.id : null;
        setOrgId((prev) => (prev ? prev : first));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    void loadTree();
  }, []);

  const loadCalendar = async (targetOrgId: number) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuth(`/api/evergreen/calendars?org_id=${targetOrgId}`);
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load calendar");
      setHours(json.snapshot?.hours || blankHours);
      setClosedDates(Array.isArray(json.snapshot?.closed) ? json.snapshot.closed : []);
      setVersions(Array.isArray(json.versions) ? json.versions : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setHours(blankHours);
      setClosedDates([]);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    void loadCalendar(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const updateHour = (dow: number, key: "open" | "close" | "note", value: string) => {
    setHours((prev: any) => {
      const next = { ...(prev || {}) };
      const dayKey = `dow${dow}`;
      next[dayKey] = { ...(next[dayKey] || { open: null, close: null, note: null }) };
      next[dayKey][key] = value === "" ? null : value;
      return next;
    });
  };

  const addClosedDate = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setClosedDates((prev) => [
      ...prev,
      {
        id: undefined,
        closeStart: `${yyyy}-${mm}-${dd}T00:00:00`,
        closeEnd: `${yyyy}-${mm}-${dd}T23:59:59`,
        reason: "Holiday",
        fullDay: true,
        multiDay: false,
      },
    ]);
  };

  const removeClosedDate = (idx: number) => {
    setClosedDates((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          orgId,
          note: note.trim() || undefined,
          hours,
          closedDates,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Save failed");
      toast.success("Calendar saved");
      setNote("");
      await loadCalendar(orgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const rollback = async (versionId: number) => {
    if (!orgId) return;
    setConfirmDialog({
      open: true,
      title: "Confirm Rollback",
      description: `Rollback calendar to version ${versionId}? This will overwrite current hours/closed dates.`,
      onConfirm: () => doRollback(versionId),
    });
  };

  const doRollback = async (versionId: number) => {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rollback",
          orgId,
          versionId,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Rollback failed");
      toast.success("Rollback complete");
      await loadCalendar(orgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Calendar Manager"
        subtitle="View and edit hours and closed dates with versioning and rollback."
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Settings" }, { label: "Hours" }]}
        actions={[
          { label: "Save", onClick: save, icon: Save, disabled: saving || loading || !orgId },
        ]}
      />

      <PageContent className="space-y-6">
        {error && <ErrorMessage message={error} onRetry={() => orgId && loadCalendar(orgId)} />}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5" /> Organization
            </CardTitle>
            <CardDescription>Select the org whose calendar you want to edit.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="org">Org</Label>
              <Select id="org" value={orgId ? String(orgId) : ""} onValueChange={(v) => setOrgId(parseInt(v, 10))}>
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading…" : "Select org"} />
                </SelectTrigger>
                <SelectContent>
                  {orgOptions.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="change-note">Change note (optional)</Label>
              <Textarea id="change-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you changing this calendar?" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5" /> Hours of Operation
            </CardTitle>
            <CardDescription>Times are stored in Evergreen. Use 24-hour format like 09:00 and 17:00.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {dayNames.map((day, idx) => (
                <div key={day} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[160px,1fr,1fr,1fr] md:items-end">
                  <div className="font-medium">{day}</div>
                  <div>
                    <Label htmlFor={`open_${idx}`}>Open</Label>
                    <Input
                      id={`open_${idx}`}
                      value={hours?.[`dow${idx}`]?.open ?? ""}
                      onChange={(e) => updateHour(idx, "open", e.target.value)}
                      placeholder="09:00"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`close_${idx}`}>Close</Label>
                    <Input
                      id={`close_${idx}`}
                      value={hours?.[`dow${idx}`]?.close ?? ""}
                      onChange={(e) => updateHour(idx, "close", e.target.value)}
                      placeholder="17:00"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`note_${idx}`}>Note</Label>
                    <Input
                      id={`note_${idx}`}
                      value={hours?.[`dow${idx}`]?.note ?? ""}
                      onChange={(e) => updateHour(idx, "note", e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Closed Dates
            </CardTitle>
            <CardDescription>Holidays and special closures. Saving overwrites the list for this org (rollback always available).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={addClosedDate}>
                <Plus className="h-4 w-4 mr-2" />
                Add closed date
              </Button>
            </div>

            {closedDates.length === 0 ? (
              <EmptyState title="No closed dates" description="Add closures to keep due date and holds calculations accurate." />
            ) : (
              <div className="grid gap-3">
                {closedDates.map((cd, idx) => (
                  <div key={`${cd.id ?? "new"}_${idx}`} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr,1fr,220px,120px,120px,44px] md:items-end">
                    <div>
                      <Label htmlFor="start">Start</Label>
                      <Input id="start"
                        value={String(cd.closeStart || "").slice(0, 10)}
                        type="date"
                        onChange={(e) => {
                          const v = e.target.value;
                          setClosedDates((prev) => prev.map((x, i) => (i === idx ? { ...x, closeStart: `${v}T00:00:00` } : x)));
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="end">End</Label>
                      <Input id="end"
                        value={String(cd.closeEnd || "").slice(0, 10)}
                        type="date"
                        onChange={(e) => {
                          const v = e.target.value;
                          setClosedDates((prev) => prev.map((x, i) => (i === idx ? { ...x, closeEnd: `${v}T23:59:59`, multiDay: v !== String(cd.closeStart || "").slice(0, 10) } : x)));
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="reason">Reason</Label>
                      <Input id="reason"
                        value={cd.reason ?? ""}
                        onChange={(e) => setClosedDates((prev) => prev.map((x, i) => (i === idx ? { ...x, reason: e.target.value } : x)))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!!cd.fullDay}
                        onCheckedChange={(v) => setClosedDates((prev) => prev.map((x, i) => (i === idx ? { ...x, fullDay: Boolean(v) } : x)))}
                        id={`fullday_${idx}`}
                      />
                      <Label htmlFor={`fullday_${idx}`}>Full day</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={!!cd.multiDay} disabled id={`multiday_${idx}`} />
                      <Label htmlFor={`multiday_${idx}`}>Multi-day</Label>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeClosedDate(idx)} aria-label="Remove closed date">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-5 w-5" /> Versions
            </CardTitle>
            <CardDescription>Rollback is safe and audited. Each save creates a version.</CardDescription>
          </CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <EmptyState
                title="No versions yet"
                description="Save a change to create the first version."
                action={{ label: "Save changes", onClick: save, icon: Save }}
                secondaryAction={{
                  label: "Evergreen setup",
                  onClick: () => window.location.assign("/staff/help#evergreen-setup"),
                }}
              />
            ) : (
              <div className="grid gap-2">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">Version {v.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.created_at ? new Date(v.created_at).toLocaleString() : "—"} {v.note ? `— ${v.note}` : ""}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => rollback(v.id)} disabled={saving}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Rollback
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((s) => ({ ...s, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
      />
    </PageContainer>
  );
}
