"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/client-fetch";
import { PageContainer, PageHeader, PageContent, ErrorMessage, EmptyState, LoadingSpinner } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Send, RefreshCw } from "lucide-react";

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuth("/api/support/tickets");
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load tickets");
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, priority, subject: subject.trim(), body: body.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Submit failed");
      toast.success(`Ticket created (#${json.id})`);
      setSubject("");
      setBody("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Support"
        subtitle="Capture issues with an auditable ticket trail (no email chains)"
        breadcrumbs={[{ label: "Support" }]}
        actions={[{ label: "Refresh", onClick: load, icon: RefreshCw, variant: "outline" as const }]}
      />
      <PageContent className="space-y-6">
        {error ? <ErrorMessage message={error} onRetry={load} /> : null}

        <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
              <LifeBuoy className="h-4 w-4" />
              Create a ticket
            </CardTitle>
            <CardDescription>
              Escalation policy: urgent issues → create an “urgent” ticket and notify your on-call channel. Security issues → “security” category.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select id="category" value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="data">Data</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select id="priority" value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[140px]" placeholder="What happened? What did you expect? Include steps to reproduce and any requestId from error screens." />
            </div>

            <div className="flex justify-end">
              <Button onClick={submit} disabled={submitting}>
                <Send className="h-4 w-4 mr-2" />
                {submitting ? "Submitting..." : "Submit ticket"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Recent tickets</CardTitle>
            <CardDescription>Most recent support tickets for this tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <LoadingSpinner message="Loading tickets..." />
            ) : tickets.length === 0 ? (
              <EmptyState title="No tickets" description="Create a ticket above to start tracking issues." />
            ) : (
              <div className="space-y-2">
                {tickets.map((t) => (
                  <div key={t.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium truncate">#{t.id} — {t.subject}</div>
                      <div className="text-xs text-muted-foreground">{t.status}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t.created_at ? new Date(t.created_at).toLocaleString() : "—"} • {t.category} • {t.priority}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
