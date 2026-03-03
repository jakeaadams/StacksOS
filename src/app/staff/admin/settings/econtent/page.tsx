"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { PageContainer, PageContent, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { fetchWithAuth } from "@/lib/client-fetch";
import type {
  EContentConnectionMode,
  EContentProvider,
  EContentProviderId,
} from "@/lib/econtent-providers";
import { ExternalLink, Loader2, Save, Settings2 } from "lucide-react";

type ConnectionApiModel = {
  providerId: EContentProviderId;
  enabled: boolean;
  mode: EContentConnectionMode;
  browseUrl: string | null;
  appUrl: string | null;
  credentialRef: string | null;
  supportsCheckout: boolean;
  supportsHold: boolean;
  notes: string | null;
};

type DraftConnection = {
  enabled: boolean;
  mode: EContentConnectionMode;
  browseUrl: string;
  appUrl: string;
  credentialRef: string;
  supportsCheckout: boolean;
  supportsHold: boolean;
  notes: string;
};

function providerTypesLabel(provider: EContentProvider): string {
  return provider.types
    .map((type) => {
      if (type === "eaudiobook") return "eAudiobook";
      if (type === "emagazine") return "eMagazine";
      if (type === "ebook") return "eBook";
      return "Streaming";
    })
    .join(" • ");
}

export default function EcontentSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProvider, setIsSavingProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<EContentProvider[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftConnection>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetchWithAuth("/api/admin/econtent-connections");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(String(data?.error || "Unable to load eContent connections"));
        }

        const catalog = Array.isArray(data?.catalog) ? (data.catalog as EContentProvider[]) : [];
        const connections = Array.isArray(data?.connections)
          ? (data.connections as ConnectionApiModel[])
          : [];
        const connectionMap = new Map(connections.map((row) => [row.providerId, row]));

        const nextDrafts: Record<string, DraftConnection> = {};
        for (const provider of catalog) {
          const existing = connectionMap.get(provider.id);
          nextDrafts[provider.id] = {
            enabled: existing?.enabled ?? provider.featured,
            mode: existing?.mode ?? "linkout",
            browseUrl: existing?.browseUrl || provider.browseUrl || "",
            appUrl: existing?.appUrl || provider.appUrl || "",
            credentialRef: existing?.credentialRef || "",
            supportsCheckout:
              existing?.supportsCheckout ?? provider.supportsPatronTransactions.checkout,
            supportsHold: existing?.supportsHold ?? provider.supportsPatronTransactions.hold,
            notes: existing?.notes || "",
          };
        }

        if (!cancelled) {
          setProviders(catalog);
          setDrafts(nextDrafts);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load provider settings");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerIds = useMemo(() => providers.map((provider) => provider.id), [providers]);

  const updateDraft = (providerId: string, patch: Partial<DraftConnection>) => {
    setDrafts((prev) => {
      const current: DraftConnection = prev[providerId] || {
        enabled: false,
        mode: "linkout",
        browseUrl: "",
        appUrl: "",
        credentialRef: "",
        supportsCheckout: false,
        supportsHold: false,
        notes: "",
      };
      return {
        ...prev,
        [providerId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const saveProvider = async (providerId: string) => {
    const draft = drafts[providerId];
    if (!draft) return;

    setIsSavingProvider(providerId);
    try {
      const response = await fetchWithAuth("/api/admin/econtent-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          enabled: draft.enabled,
          mode: draft.mode,
          browseUrl: draft.browseUrl || undefined,
          appUrl: draft.appUrl || undefined,
          credentialRef: draft.credentialRef || undefined,
          supportsCheckout: draft.supportsCheckout,
          supportsHold: draft.supportsHold,
          notes: draft.notes || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(String(data?.error || "Unable to save provider"));
      }
      toast.success("Provider settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save provider settings");
    } finally {
      setIsSavingProvider(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Digital App Library"
        subtitle="Configure eBook/eAudiobook provider connections without changing Evergreen core."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Settings", href: "/staff/admin/settings" },
          { label: "Digital App Library" },
        ]}
      />

      <PageContent className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Evergreen Boundary
            </CardTitle>
            <CardDescription>
              StacksOS configures provider UX and connector behavior in <code>library.*</code>{" "}
              tables. Evergreen remains system-of-record for patron authentication and card/PIN.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Use <strong>Link-out</strong> mode for safe production defaults, then move specific
              providers to <strong>OAuth passthrough</strong> or <strong>API</strong> when your
              contracts and credentials are ready.
            </p>
            <p>
              Need onboarding help?{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/staff/admin/onboarding"
              >
                Run the onboarding wizard
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {providerIds.map((providerId) => {
              const provider = providers.find((row) => row.id === providerId);
              const draft = drafts[providerId];
              if (!provider || !draft) return null;

              return (
                <Card key={provider.id} className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-lg">{provider.name}</CardTitle>
                    <CardDescription>{provider.description}</CardDescription>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="secondary">{providerTypesLabel(provider)}</Badge>
                      {provider.supportsPatronTransactions.checkout ? (
                        <Badge variant="outline">Checkout-capable</Badge>
                      ) : null}
                      {provider.supportsPatronTransactions.hold ? (
                        <Badge variant="outline">Hold-capable</Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2">
                      <Label htmlFor={`enabled-${provider.id}`} className="font-medium">
                        Enabled for patrons
                      </Label>
                      <Switch
                        id={`enabled-${provider.id}`}
                        checked={draft.enabled}
                        onCheckedChange={(checked) =>
                          updateDraft(provider.id, { enabled: checked })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`mode-${provider.id}`}>Connection mode</Label>
                      <Select
                        value={draft.mode}
                        onValueChange={(value) =>
                          updateDraft(provider.id, { mode: value as EContentConnectionMode })
                        }
                      >
                        <SelectTrigger id={`mode-${provider.id}`}>
                          <SelectValue placeholder="Select a mode" />
                        </SelectTrigger>
                        <SelectContent>
                          {provider.supportedModes.map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              {mode === "linkout"
                                ? "Link-out"
                                : mode === "oauth_passthrough"
                                  ? "OAuth passthrough"
                                  : "API integration"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`browse-url-${provider.id}`}>Browse URL</Label>
                        <Input
                          id={`browse-url-${provider.id}`}
                          value={draft.browseUrl}
                          onChange={(event) =>
                            updateDraft(provider.id, { browseUrl: event.target.value })
                          }
                          placeholder="https://yourlibrary.provider.com"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`app-url-${provider.id}`}>App URL (optional)</Label>
                        <Input
                          id={`app-url-${provider.id}`}
                          value={draft.appUrl}
                          onChange={(event) =>
                            updateDraft(provider.id, { appUrl: event.target.value })
                          }
                          placeholder="https://provider.app/link"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`credential-ref-${provider.id}`}>Credential reference</Label>
                      <Input
                        id={`credential-ref-${provider.id}`}
                        value={draft.credentialRef}
                        onChange={(event) =>
                          updateDraft(provider.id, { credentialRef: event.target.value })
                        }
                        placeholder="vault://library/econtent/provider-key"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <Label htmlFor={`supports-checkout-${provider.id}`}>Checkout action</Label>
                        <Switch
                          id={`supports-checkout-${provider.id}`}
                          checked={draft.supportsCheckout}
                          onCheckedChange={(checked) =>
                            updateDraft(provider.id, { supportsCheckout: checked })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <Label htmlFor={`supports-hold-${provider.id}`}>Hold action</Label>
                        <Switch
                          id={`supports-hold-${provider.id}`}
                          checked={draft.supportsHold}
                          onCheckedChange={(checked) =>
                            updateDraft(provider.id, { supportsHold: checked })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`notes-${provider.id}`}>Internal notes</Label>
                      <Textarea
                        id={`notes-${provider.id}`}
                        value={draft.notes}
                        onChange={(event) =>
                          updateDraft(provider.id, { notes: event.target.value })
                        }
                        placeholder="Contract status, rollout notes, staff training instructions..."
                        rows={3}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <Button type="button" variant="outline" asChild className="gap-2">
                        <a
                          href={draft.browseUrl || provider.browseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Preview
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        type="button"
                        onClick={() => saveProvider(provider.id)}
                        disabled={isSavingProvider === provider.id}
                        className="gap-2"
                      >
                        {isSavingProvider === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}
