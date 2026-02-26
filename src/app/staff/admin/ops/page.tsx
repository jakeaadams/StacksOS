"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/client-fetch";
import {
  PageContainer,
  PageHeader,
  PageContent,
  ErrorMessage,
  EmptyState,
  LoadingSpinner,
  ConfirmDialog,
} from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldAlert, ScrollText, Plus, CheckCircle2, RefreshCw } from "lucide-react";

export default function OpsAdminPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [incidentMessage, setIncidentMessage] = useState("");
  const [incidentSeverity, setIncidentSeverity] = useState<"info" | "warning" | "error">("info");
  const [incidentEndsAt, setIncidentEndsAt] = useState<string>("");

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const [noteVersion, setNoteVersion] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [iRes, nRes] = await Promise.all([
        fetchWithAuth("/api/admin/incidents"),
        fetchWithAuth("/api/release-notes"),
      ]);
      const iJson = await iRes.json();
      const nJson = await nRes.json();
      if (!iRes.ok || iJson.ok === false)
        throw new Error(iJson.error || "Failed to load incidents");
      if (!nRes.ok || nJson.ok === false)
        throw new Error(nJson.error || "Failed to load release notes");
      setIncidents(Array.isArray(iJson.incidents) ? iJson.incidents : []);
      setNotes(Array.isArray(nJson.notes) ? nJson.notes : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setIncidents([]);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createIncident = async () => {
    if (!incidentMessage.trim()) {
      toast.error("Incident message required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          message: incidentMessage.trim(),
          severity: incidentSeverity,
          endsAt: incidentEndsAt ? new Date(incidentEndsAt).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Create failed");
      toast.success("Incident banner published");
      setIncidentMessage("");
      setIncidentEndsAt("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const resolveIncident = async (id: number) => {
    setConfirmDialog({
      open: true,
      title: "Resolve Incident",
      description: "Resolve this incident banner?",
      onConfirm: () => doResolveIncident(id),
    });
  };

  const doResolveIncident = async (id: number) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", id }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Resolve failed");
      toast.success("Incident resolved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setSaving(false);
    }
  };

  const addRelease = async () => {
    if (!noteTitle.trim() || !noteBody.trim()) {
      toast.error("Title and body required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/release-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: noteVersion.trim() || undefined,
          title: noteTitle.trim(),
          body: noteBody.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Add failed");
      toast.success("Release note published");
      setNoteVersion("");
      setNoteTitle("");
      setNoteBody("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Ops Center"
        subtitle="Incident banners, release notes, and operational comms"
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Ops" }]}
        actions={[
          { label: "Refresh", onClick: load, icon: RefreshCw, variant: "outline" as const },
        ]}
      />
      <PageContent className="space-y-6">
        {error ? <ErrorMessage message={error} onRetry={load} /> : null}

        {loading ? (
          <LoadingSpinner message="Loading ops data..." />
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Incident banners
                </CardTitle>
                <CardDescription>
                  These appear on `/status` and are intended for time-bounded incidents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="severity">Severity</Label>
                    <Select
                      id="severity"
                      value={incidentSeverity}
                      onValueChange={(v) => setIncidentSeverity(v as "info" | "warning" | "error")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="ends-at">Ends at (optional)</Label>
                    <Input
                      id="ends-at"
                      type="datetime-local"
                      value={incidentEndsAt}
                      onChange={(e) => setIncidentEndsAt(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    value={incidentMessage}
                    onChange={(e) => setIncidentMessage(e.target.value)}
                    className="min-h-[100px]"
                    placeholder="What is happening? What should staff/patrons do?"
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={createIncident} disabled={saving}>
                    <Plus className="h-4 w-4 mr-2" /> Publish
                  </Button>
                </div>

                <div className="border-t pt-4">
                  {incidents.length === 0 ? (
                    <EmptyState
                      title="No incidents"
                      description="No incident banners have been created yet."
                    />
                  ) : (
                    <div className="space-y-2">
                      {incidents.map((i) => (
                        <div key={i.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium truncate">
                              #{i.id} — {i.severity}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {i.active ? "active" : "resolved"}
                            </div>
                          </div>
                          <div className="text-sm mt-2 whitespace-pre-wrap">{i.message}</div>
                          <div className="text-xs text-muted-foreground mt-2">
                            {i.created_at ? new Date(i.created_at).toLocaleString() : "—"}
                            {i.ends_at ? ` • ends ${new Date(i.ends_at).toLocaleString()}` : ""}
                          </div>
                          {i.active ? (
                            <div className="mt-3 flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resolveIncident(i.id)}
                                disabled={saving}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Resolve
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4" /> Release notes
                </CardTitle>
                <CardDescription>Publish a change log entry for staff and patrons.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="version">Version (optional)</Label>
                    <Input
                      id="version"
                      value={noteVersion}
                      onChange={(e) => setNoteVersion(e.target.value)}
                      placeholder="0.1.0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="Improved circulation performance"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="body">Body</Label>
                  <Textarea
                    id="body"
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    className="min-h-[140px]"
                    placeholder="- What changed\n- What to watch\n- Any migration steps"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={addRelease} disabled={saving}>
                    <Plus className="h-4 w-4 mr-2" /> Publish
                  </Button>
                </div>

                <div className="border-t pt-4">
                  {notes.length === 0 ? (
                    <EmptyState
                      title="No release notes"
                      description="Publish the first release note above."
                    />
                  ) : (
                    <div className="space-y-2">
                      {notes.map((n) => (
                        <div key={n.id} className="rounded-lg border p-3">
                          <div className="font-medium">
                            {n.version ? `${n.version} — ` : ""}
                            {n.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {n.created_at ? new Date(n.created_at).toLocaleString() : "—"}
                          </div>
                          <pre className="whitespace-pre-wrap text-sm mt-3">{n.body}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
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
