"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { fetchWithAuth } from "@/lib/client-fetch";
import { useApi } from "@/hooks";
import { PageContainer, PageContent, PageHeader } from "@/components/shared";
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
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

type OpacChip = {
  label: string;
  href: string;
};

type OpacSections = {
  showQuickChips: boolean;
  showBrowseByFormat: boolean;
  showEvents: boolean;
  showRecommended: boolean;
  showNewArrivals: boolean;
  showPopular: boolean;
  showStaffPicks: boolean;
  showLibraryInfo: boolean;
};

type OpacConfig = {
  heroTitle?: string;
  heroSubtitle?: string;
  searchPlaceholder?: string;
  styleVariant?: "classic" | "vibrant" | "clean";
  quickChips?: OpacChip[];
  sections?: Partial<OpacSections>;
};

type OpacSettingsResponse = {
  ok: boolean;
  tenantId: string;
  displayName: string;
  profile: string;
  branding: {
    primaryColor?: string;
    logoUrl?: string;
  };
  opac: OpacConfig;
};

const DEFAULT_SECTIONS: OpacSections = {
  showQuickChips: true,
  showBrowseByFormat: true,
  showEvents: true,
  showRecommended: true,
  showNewArrivals: true,
  showPopular: true,
  showStaffPicks: true,
  showLibraryInfo: true,
};

const SECTION_LABELS: Array<{ key: keyof OpacSections; label: string; detail: string }> = [
  { key: "showQuickChips", label: "Quick chips", detail: "Hero quick links under search." },
  {
    key: "showBrowseByFormat",
    label: "Browse by format",
    detail: "Books, eBooks, audio, video cards.",
  },
  { key: "showEvents", label: "Events", detail: "Upcoming events module on homepage." },
  { key: "showRecommended", label: "Recommended", detail: "Patron recommendation rail." },
  { key: "showNewArrivals", label: "New arrivals", detail: "Recently added titles." },
  { key: "showPopular", label: "Popular", detail: "Most-circulated title rail." },
  { key: "showStaffPicks", label: "Staff picks", detail: "Staff-curated picks section." },
  {
    key: "showLibraryInfo",
    label: "Library info footer",
    detail: "Hours/location/links card area.",
  },
];

function normalizeConfig(data: OpacSettingsResponse | null) {
  const opac = data?.opac || {};
  return {
    heroTitle: opac.heroTitle || "",
    heroSubtitle: opac.heroSubtitle || "",
    searchPlaceholder: opac.searchPlaceholder || "",
    styleVariant: opac.styleVariant || "classic",
    primaryColor: data?.branding?.primaryColor || "",
    quickChips:
      Array.isArray(opac.quickChips) && opac.quickChips.length > 0
        ? opac.quickChips.map((chip) => ({ label: chip.label || "", href: chip.href || "" }))
        : [
            { label: "New Arrivals", href: "/opac/new-titles" },
            { label: "Popular Now", href: "/opac/search?sort=popularity" },
            { label: "Staff Picks", href: "/opac/lists" },
            { label: "Browse Subjects", href: "/opac/browse" },
          ],
    sections: {
      ...DEFAULT_SECTIONS,
      ...(opac.sections || {}),
    },
  };
}

export default function OpacSettingsPage() {
  const [form, setForm] = useState(() => normalizeConfig(null));
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const { data, isLoading, refetch } = useApi<OpacSettingsResponse>("/api/admin/opac-settings", {
    immediate: true,
  });

  useEffect(() => {
    if (!data || isInitialized) return;
    setForm(normalizeConfig(data));
    setIsInitialized(true);
  }, [data, isInitialized]);

  const chipCount = useMemo(
    () => form.quickChips.filter((chip) => chip.label.trim() && chip.href.trim()).length,
    [form.quickChips]
  );

  const setSection = (key: keyof OpacSections, value: boolean) => {
    setForm((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [key]: value,
      },
    }));
  };

  const setChip = (index: number, patch: Partial<OpacChip>) => {
    setForm((prev) => ({
      ...prev,
      quickChips: prev.quickChips.map((chip, idx) =>
        idx === index ? { ...chip, ...patch } : chip
      ),
    }));
  };

  const addChip = () => {
    setForm((prev) => ({
      ...prev,
      quickChips: [...prev.quickChips, { label: "", href: "" }],
    }));
  };

  const removeChip = (index: number) => {
    setForm((prev) => ({
      ...prev,
      quickChips: prev.quickChips.filter((_, idx) => idx !== index),
    }));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const quickChips = form.quickChips
        .map((chip) => ({ label: chip.label.trim(), href: chip.href.trim() }))
        .filter((chip) => chip.label && chip.href);

      const response = await fetchWithAuth("/api/admin/opac-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branding: {
            primaryColor: form.primaryColor.trim() || undefined,
          },
          opac: {
            heroTitle: form.heroTitle.trim() || undefined,
            heroSubtitle: form.heroSubtitle.trim() || undefined,
            searchPlaceholder: form.searchPlaceholder.trim() || undefined,
            styleVariant: form.styleVariant,
            quickChips,
            sections: form.sections,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(String(payload?.error || "Failed to save OPAC settings."));
      }
      toast.success("OPAC settings saved.");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save OPAC settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="OPAC Experience"
        subtitle="Customize homepage hierarchy, discovery chips, and visual tone for your library."
        breadcrumbs={[
          { label: "Administration", href: "/staff/admin" },
          { label: "Settings", href: "/staff/admin/settings" },
          { label: "OPAC Experience" },
        ]}
      />

      <PageContent className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Live behavior</CardTitle>
            <CardDescription>
              These settings drive the OPAC homepage immediately for the active tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This stays in StacksOS tenant config and does not modify Evergreen core code.
            <div className="mt-2">
              <Link href="/opac" className="text-primary underline underline-offset-4">
                Open OPAC home preview
              </Link>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Hero + Search</CardTitle>
                <CardDescription>
                  Control the first-impression copy and search tone.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="hero-title">Hero title</Label>
                  <Input
                    id="hero-title"
                    value={form.heroTitle}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, heroTitle: event.target.value }))
                    }
                    placeholder="Discover Your Next Favorite"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="hero-subtitle">Hero subtitle</Label>
                  <Input
                    id="hero-subtitle"
                    value={form.heroSubtitle}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, heroSubtitle: event.target.value }))
                    }
                    placeholder="Search books, movies, audiobooks, and digital resources in one place."
                    maxLength={320}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-placeholder">Search placeholder</Label>
                  <Input
                    id="search-placeholder"
                    value={form.searchPlaceholder}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, searchPlaceholder: event.target.value }))
                    }
                    placeholder="Search books, movies, music..."
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="style-variant">Style variant</Label>
                  <Select
                    value={form.styleVariant}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        styleVariant: value as "classic" | "vibrant" | "clean",
                      }))
                    }
                  >
                    <SelectTrigger id="style-variant">
                      <SelectValue placeholder="Choose style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic</SelectItem>
                      <SelectItem value="vibrant">Vibrant</SelectItem>
                      <SelectItem value="clean">Clean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Quick Chips ({chipCount})</CardTitle>
                <CardDescription>Curate the hero quick-link chip row.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {form.quickChips.map((chip, index) => (
                  <div
                    key={`${index}-${chip.label}`}
                    className="grid gap-2 md:grid-cols-[1fr_2fr_auto]"
                  >
                    <Input
                      aria-label={`chip-label-${index}`}
                      value={chip.label}
                      onChange={(event) => setChip(index, { label: event.target.value })}
                      placeholder="Label"
                      maxLength={40}
                    />
                    <Input
                      aria-label={`chip-href-${index}`}
                      value={chip.href}
                      onChange={(event) => setChip(index, { href: event.target.value })}
                      placeholder="/opac/new-titles"
                      maxLength={512}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Remove chip ${index + 1}`}
                      onClick={() => removeChip(index)}
                      disabled={form.quickChips.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" className="gap-2" onClick={addChip}>
                  <Plus className="h-4 w-4" />
                  Add chip
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Section Visibility</CardTitle>
                <CardDescription>Show or hide OPAC homepage sections.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {SECTION_LABELS.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <Switch
                      checked={form.sections[item.key]}
                      onCheckedChange={(checked) => setSection(item.key, checked)}
                      aria-label={`Toggle ${item.label}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Brand Accent</CardTitle>
                <CardDescription>Optional tenant primary color override.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="primary-color">Primary color (#RRGGBB)</Label>
                <Input
                  id="primary-color"
                  value={form.primaryColor}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, primaryColor: event.target.value }))
                  }
                  placeholder="#0f766e"
                  maxLength={7}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="button" className="gap-2" onClick={saveSettings} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save OPAC settings
              </Button>
            </div>
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
