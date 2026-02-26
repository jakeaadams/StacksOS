"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageContent, PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fetchWithAuth } from "@/lib/client-fetch";
import {
  Activity,
  Cable,
  CheckCircle2,
  FlaskConical,
  Link2,
  Loader2,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";

type WebhookSubscription = {
  id: number;
  tenantId: string;
  name: string;
  endpointUrl: string;
  events: string[];
  active: boolean;
  lastTestedAt: string | null;
  secretPreview: string;
};

type WebhookDelivery = {
  id: number;
  subscriptionId: number;
  eventType: string;
  status: "delivered" | "failed";
  statusCode: number | null;
  latencyMs: number | null;
  createdAt: string;
};

type ApiPayload = {
  eventsCatalog: string[];
  subscriptions: WebhookSubscription[];
  deliveries: WebhookDelivery[];
};

const EMPTY_PAYLOAD: ApiPayload = {
  eventsCatalog: [],
  subscriptions: [],
  deliveries: [],
};

export default function DeveloperPlatformPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<ApiPayload>(EMPTY_PAYLOAD);
  const [form, setForm] = useState({
    name: "",
    endpointUrl: "",
    events: [] as string[],
  });

  const stats = useMemo(() => {
    const totalSubscriptions = payload.subscriptions.length;
    const activeSubscriptions = payload.subscriptions.filter((sub) => sub.active).length;
    const totalDeliveries = payload.deliveries.length;
    const delivered = payload.deliveries.filter(
      (delivery) => delivery.status === "delivered"
    ).length;
    const failed = totalDeliveries - delivered;

    const subscribedEvents = new Set<string>();
    payload.subscriptions.forEach((sub) => {
      sub.events.forEach((eventType) => subscribedEvents.add(eventType));
    });

    const eventCoverage = payload.eventsCatalog.length
      ? Math.round((subscribedEvents.size / payload.eventsCatalog.length) * 100)
      : 0;

    const deliverySuccessRate = totalDeliveries
      ? Math.round((delivered / totalDeliveries) * 100)
      : 0;

    return {
      totalSubscriptions,
      activeSubscriptions,
      totalDeliveries,
      failed,
      eventCoverage,
      deliverySuccessRate,
    };
  }, [payload]);

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/admin/developer/webhooks", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      setPayload({
        eventsCatalog: Array.isArray(json.eventsCatalog) ? (json.eventsCatalog as string[]) : [],
        subscriptions: Array.isArray(json.subscriptions)
          ? (json.subscriptions as WebhookSubscription[])
          : [],
        deliveries: Array.isArray(json.deliveries) ? (json.deliveries as WebhookDelivery[]) : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load developer platform data: ${message}`);
      setPayload(EMPTY_PAYLOAD);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function runMutation(
    method: "POST" | "PUT" | "DELETE",
    body: Record<string, any>,
    successMessage: string
  ) {
    setSaving(true);
    try {
      const response = await fetchWithAuth("/api/admin/developer/webhooks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      toast.success(successMessage);
      await loadData();
      return json;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      throw error;
    } finally {
      setSaving(false);
    }
  }

  function toggleEvent(eventType: string) {
    setForm((prev) => {
      const exists = prev.events.includes(eventType);
      return {
        ...prev,
        events: exists
          ? prev.events.filter((event) => event !== eventType)
          : [...prev.events, eventType],
      };
    });
  }

  async function onCreateWebhook() {
    if (!form.name.trim() || !form.endpointUrl.trim() || form.events.length === 0) {
      toast.error("Name, endpoint URL, and at least one event are required.");
      return;
    }

    try {
      const url = new URL(form.endpointUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Endpoint URL must use http or https.");
      }
    } catch (_error) {
      toast.error("Endpoint URL must be a valid URL.");
      return;
    }

    await runMutation(
      "POST",
      {
        action: "create",
        name: form.name.trim(),
        endpointUrl: form.endpointUrl.trim(),
        events: form.events,
      },
      "Webhook subscription created"
    );
    setForm({ name: "", endpointUrl: "", events: [] });
  }

  async function onTestWebhook(id: number) {
    await runMutation("POST", { action: "test", id }, "Webhook test dispatched");
  }

  async function onToggleActive(item: WebhookSubscription) {
    await runMutation(
      "PUT",
      {
        id: item.id,
        name: item.name,
        endpointUrl: item.endpointUrl,
        events: item.events,
        active: !item.active,
      },
      item.active ? "Webhook disabled" : "Webhook enabled"
    );
  }

  async function onDeleteWebhook(id: number) {
    if (!confirm(`Delete webhook subscription #${id}?`)) return;
    await runMutation("DELETE", { id }, "Webhook deleted");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Developer Platform"
        subtitle="Operate reliable webhook contracts and extension integrations with delivery telemetry."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Developer Platform" },
        ]}
        actions={[
          {
            label: loading ? "Refreshing..." : "Refresh",
            onClick: () => void loadData(),
            icon: loading ? Loader2 : RefreshCw,
            variant: "outline",
          },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-2xl border-emerald-200/70 bg-emerald-50/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-emerald-800">Active Webhooks</CardDescription>
              <CardTitle className="text-2xl text-emerald-900">
                {stats.activeSubscriptions}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-emerald-800">
              {stats.totalSubscriptions} total subscriptions configured.
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-cyan-200/70 bg-cyan-50/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-cyan-800">Event Coverage</CardDescription>
              <CardTitle className="text-2xl text-cyan-900">{stats.eventCoverage}%</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-cyan-800">
              Covered event contracts across your catalog.
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-blue-200/70 bg-blue-50/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-blue-800">Delivery Success</CardDescription>
              <CardTitle className="text-2xl text-blue-900">{stats.deliverySuccessRate}%</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-blue-800">
              {stats.totalDeliveries} recent deliveries evaluated.
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-rose-200/70 bg-rose-50/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-rose-800">Failed Deliveries</CardDescription>
              <CardTitle className="text-2xl text-rose-900">{stats.failed}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-rose-800">
              Use retries/test hooks before go-live windows.
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-indigo-200/70 bg-indigo-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Integration Quality Standard
            </CardTitle>
            <CardDescription>
              Keep integrations world-class: signed payloads, idempotent handlers, and observable
              failures.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-3">
            <div className="rounded-xl border border-indigo-200 bg-white/70 px-3 py-2">
              <div className="font-medium">Security</div>
              <div className="text-xs text-muted-foreground">
                Validate HMAC signature and timestamp before processing.
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white/70 px-3 py-2">
              <div className="font-medium">Reliability</div>
              <div className="text-xs text-muted-foreground">
                Treat webhook payloads as at-least-once delivery and dedupe safely.
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white/70 px-3 py-2">
              <div className="font-medium">Observability</div>
              <div className="text-xs text-muted-foreground">
                Track status code, latency, and replay failures quickly.
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Webhook Subscription
              </CardTitle>
              <CardDescription>
                Subscribe external systems to stable workflow hooks with signed payloads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="webhook-name">Name</Label>
                  <Input
                    id="webhook-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Ops SIEM Webhook"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="webhook-url">Endpoint URL</Label>
                  <Input
                    id="webhook-url"
                    value={form.endpointUrl}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, endpointUrl: event.target.value }))
                    }
                    placeholder="https://example.org/stacksos/webhooks"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Event Contracts</Label>
                  <Badge variant="outline">{form.events.length} selected</Badge>
                </div>
                {payload.eventsCatalog.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events available.</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {payload.eventsCatalog.map((eventType) => {
                      const selected = form.events.includes(eventType);
                      return (
                        <label
                          key={eventType}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                            selected ? "border-primary/40 bg-primary/5" : "border-border"
                          }`}
                        >
                          <input
                            type="checkbox"
                            aria-label={eventType}
                            checked={selected}
                            onChange={() => toggleEvent(eventType)}
                          />
                          <span className="font-mono text-[11px]">{eventType}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button onClick={() => void onCreateWebhook()} disabled={saving || loading}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="mr-2 h-4 w-4" />
                )}
                Create Webhook
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cable className="h-4 w-4" />
                Subscriptions
              </CardTitle>
              <CardDescription>
                Configured endpoints receiving StacksOS operational hooks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {payload.subscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No webhook subscriptions configured.
                </p>
              ) : (
                payload.subscriptions.map((item) => (
                  <div key={item.id} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground font-mono break-all">
                          {item.endpointUrl}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={item.active ? "secondary" : "outline"}>
                          {item.active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">Secret: {item.secretPreview || "generated"}</Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {item.events.map((eventType) => (
                        <Badge
                          key={`${item.id}-${eventType}`}
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {eventType}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void onTestWebhook(item.id)}
                        disabled={saving}
                      >
                        <FlaskConical className="mr-2 h-3.5 w-3.5" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void onToggleActive(item)}
                        disabled={saving}
                      >
                        {item.active ? (
                          <Unplug className="mr-2 h-3.5 w-3.5" />
                        ) : (
                          <Link2 className="mr-2 h-3.5 w-3.5" />
                        )}
                        {item.active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void onDeleteWebhook(item.id)}
                        disabled={saving}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Delivery Log
            </CardTitle>
            <CardDescription>
              Latest webhook outcomes by event type and endpoint health.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {payload.deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deliveries yet.</p>
            ) : (
              payload.deliveries.map((delivery) => (
                <div key={delivery.id} className="rounded-xl border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs truncate">{delivery.eventType}</span>
                    <Badge variant={delivery.status === "delivered" ? "secondary" : "destructive"}>
                      {delivery.status === "delivered" ? (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      ) : null}
                      {delivery.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Subscription #{delivery.subscriptionId} • status={delivery.statusCode || "n/a"}{" "}
                    • latency={delivery.latencyMs || "n/a"}ms •{" "}
                    {new Date(delivery.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
