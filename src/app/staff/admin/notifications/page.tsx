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
} from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Mail, MessageSquare, Plus, CheckCircle2, RefreshCw, Eye, Send } from "lucide-react";

const NOTICE_TYPES = [
  "hold_ready",
  "overdue",
  "pre_overdue",
  "card_expiration",
  "fine_bill",
] as const;

type Channel = "email" | "sms";

export default function NotificationsAdminPage() {
  const [activeTab, setActiveTab] = useState<"templates" | "deliveries">("templates");
  const [channel, setChannel] = useState<Channel>("email");
  const [noticeType, setNoticeType] = useState<string>("hold_ready");

  const [templates, setTemplates] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showEditor, setShowEditor] = useState(false);
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [bodyTextTemplate, setBodyTextTemplate] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [sampleContext, setSampleContext] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState<string>("");

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuth(
        `/api/notifications/templates?channel=${channel}&notice_type=${encodeURIComponent(noticeType)}`
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load templates");
      setTemplates(Array.isArray(json.templates) ? json.templates : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDeliveries = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuth(`/api/notifications/deliveries?limit=200`);
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load deliveries");
      setDeliveries(Array.isArray(json.deliveries) ? json.deliveries : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSample = async () => {
    try {
      const res = await fetchWithAuth(
        `/api/notifications/sample?notice_type=${encodeURIComponent(noticeType)}`
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load sample");
      setSampleContext(json.context || null);
      return json.context || null;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load sample");
      return null;
    }
  };

  const preview = async (ctxOverride?: any) => {
    const ctx = ctxOverride ?? sampleContext ?? (await loadSample());
    if (!ctx) return;
    try {
      const res = await fetchWithAuth(`/api/notifications/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTemplate: subjectTemplate || null,
          bodyTemplate,
          bodyTextTemplate: bodyTextTemplate || null,
          context: ctx,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Preview failed");
      setPreviewHtml(String(json.html || ""));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };

  useEffect(() => {
    if (activeTab === "templates") void loadTemplates();
    if (activeTab === "deliveries") void loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, channel, noticeType]);

  const openEditor = async () => {
    setSubjectTemplate("");
    setBodyTemplate(
      channel === "email"
        ? "<p>Hello {{patron.firstName}},</p>\n<p>Your notice: {{library.name}}</p>"
        : "Hello {{patron.firstName}} - notice from {{library.name}}"
    );
    setBodyTextTemplate(
      channel === "email" ? "Hello {{patron.firstName}} - notice from {{library.name}}" : ""
    );
    setPreviewHtml("");
    setTestTo("");
    setShowEditor(true);
    const ctx = await loadSample();
    if (ctx) await preview(ctx);
  };

  const saveTemplate = async (activate: boolean) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/notifications/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          channel,
          noticeType,
          subjectTemplate: subjectTemplate || null,
          bodyTemplate,
          bodyTextTemplate: bodyTextTemplate || null,
          activate,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Save failed");
      toast.success(activate ? "Template saved and activated" : "Template saved");
      setShowEditor(false);
      await loadTemplates();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const activateTemplate = async (templateId: number) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/notifications/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", channel, templateId }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Activate failed");
      toast.success("Template activated");
      await loadTemplates();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Activate failed");
    } finally {
      setSaving(false);
    }
  };

  const processDeliveries = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/notifications/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process", limit: 50 }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Process failed");
      toast.success(`Processed ${json.processed} (sent ${json.sent}, failed ${json.failed})`);
      await loadDeliveries();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Process failed");
    } finally {
      setSaving(false);
    }
  };

  const enqueueRetry = async (eventId: string) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/notifications/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enqueue_retry", eventId }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Retry enqueue failed");
      toast.success("Retry enqueued");
      await loadDeliveries();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Retry enqueue failed");
    } finally {
      setSaving(false);
    }
  };

  const testSendToMe = async () => {
    setSaving(true);
    try {
      const ctx = sampleContext ?? (await loadSample());
      const res = await fetchWithAuth(`/api/notifications/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          noticeType,
          to: testTo || null,
          context: ctx,
          subjectTemplate: subjectTemplate || null,
          bodyTemplate: bodyTemplate || null,
          bodyTextTemplate: bodyTextTemplate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Test send failed");
      toast.success(`Sent test ${channel.toUpperCase()} to ${json.to}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setSaving(false);
    }
  };

  const headerActions =
    activeTab === "templates"
      ? [{ label: "New template", onClick: openEditor, icon: Plus }]
      : [
          {
            label: "Process queue",
            onClick: processDeliveries,
            icon: RefreshCw,
            variant: "outline" as const,
          },
        ];

  return (
    <PageContainer>
      <PageHeader
        title="Notifications Center"
        subtitle="Manage templates, preview safely, and monitor delivery status."
        breadcrumbs={[{ label: "Admin", href: "/staff/admin" }, { label: "Notifications" }]}
        actions={headerActions as any}
      />
      <PageContent className="space-y-6">
        {error && (
          <ErrorMessage
            message={error}
            onRetry={() => (activeTab === "templates" ? loadTemplates() : loadDeliveries())}
          />
        )}

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Scope</CardTitle>
            <CardDescription>
              Select which channel and notice type you want to manage.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="channel">Channel</Label>
              <Select id="channel" value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notice-type">Notice type</Label>
              <Select id="notice-type" value={noticeType} onValueChange={setNoticeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTICE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="templates">
              <Mail className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="deliveries">
              <MessageSquare className="h-4 w-4 mr-2" />
              Delivery log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Template versions
                </CardTitle>
                <CardDescription>
                  Each save creates a version. Activate a version to make it live.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeTab === "templates" && loading ? (
                  <LoadingSpinner message="Loading templates..." />
                ) : templates.length === 0 ? (
                  <EmptyState
                    title="No templates"
                    description="Create a template version to override the built-in defaults."
                    action={{ label: "New template", onClick: openEditor, icon: Plus }}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono">{t.id}</TableCell>
                          <TableCell>
                            {t.status === "active" ? (
                              <span className="inline-flex items-center gap-1 text-green-700">
                                <CheckCircle2 className="h-4 w-4" /> active
                              </span>
                            ) : (
                              <span className="text-muted-foreground">inactive</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {t.created_at ? new Date(t.created_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => activateTemplate(t.id)}
                              disabled={saving || t.status === "active"}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" /> Activate
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deliveries" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Recent deliveries
                </CardTitle>
                <CardDescription>
                  Failures can be retried by enqueueing a new delivery for the same event.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeTab === "deliveries" && loading ? (
                  <LoadingSpinner message="Loading deliveries..." />
                ) : deliveries.length === 0 ? (
                  <EmptyState
                    title="No deliveries"
                    description="Send a patron notice or a test email to populate the log."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono">{d.id}</TableCell>
                          <TableCell className="text-sm">{d.notice_type}</TableCell>
                          <TableCell className="text-sm">{d.recipient || "—"}</TableCell>
                          <TableCell className="text-sm">{d.status}</TableCell>
                          <TableCell className="text-sm">{d.attempts}</TableCell>
                          <TableCell className="flex items-center gap-2">
                            {d.status === "failed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => enqueueRetry(d.event_id)}
                                disabled={saving}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" /> Retry
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showEditor} onOpenChange={setShowEditor}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>
                New {channel.toUpperCase()} template — {noticeType}
              </DialogTitle>
              <DialogDescription>
                Use variables like <span className="font-mono">{"{{patron.firstName}}"}</span>.
                Preview uses live context only.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="subject">Subject (optional)</Label>
                  <Input
                    id="subject"
                    value={subjectTemplate}
                    onChange={(e) => setSubjectTemplate(e.target.value)}
                    placeholder={channel === "email" ? "{{library.name}} notice" : "(not used)"}
                  />
                </div>
                <div>
                  <Label htmlFor="channel-email-html-body-message-body">
                    {channel === "email" ? "HTML body" : "Message body"}
                  </Label>
                  <Textarea
                    id="channel-email-html-body-message-body"
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    className="min-h-[220px] font-mono text-xs"
                  />
                </div>
                {channel === "email" && (
                  <div>
                    <Label htmlFor="text-body">Text body (optional)</Label>
                    <Textarea
                      id="text-body"
                      value={bodyTextTemplate}
                      onChange={(e) => setBodyTextTemplate(e.target.value)}
                      className="min-h-[120px] font-mono text-xs"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => void preview()} disabled={saving}>
                    <Eye className="h-4 w-4 mr-2" /> Preview
                  </Button>
                  <Button variant="outline" onClick={testSendToMe} disabled={saving}>
                    <Send className="h-4 w-4 mr-2" /> Test-send
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="channel-email-test-recipient-email-optional-test-recipient-phone-required-for-sms">
                    {channel === "email"
                      ? "Test recipient email (optional)"
                      : "Test recipient phone (required for SMS)"}
                  </Label>
                  <Input
                    id="channel-email-test-recipient-email-optional-test-recipient-phone-required-for-sms"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder={
                      channel === "email" ? "(defaults to your staff email)" : "+15555551212"
                    }
                  />
                </div>
                <div className="text-sm text-muted-foreground">Preview</div>
                <div className="rounded-lg border bg-white p-3 min-h-[420px] overflow-auto">
                  {previewHtml ? (
                    <iframe
                      title="Template preview"
                      sandbox=""
                      className="w-full h-[420px] border-0"
                      referrerPolicy="no-referrer"
                      srcDoc={previewHtml}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">No preview yet.</div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditor(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={() => void saveTemplate(false)}
                disabled={saving || !bodyTemplate.trim()}
              >
                Save version
              </Button>
              <Button
                onClick={() => void saveTemplate(true)}
                disabled={saving || !bodyTemplate.trim()}
              >
                Save + activate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </PageContainer>
  );
}
