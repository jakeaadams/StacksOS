"use client";

import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  PageContainer,
  PageHeader,
  PageContent,
  LoadingSpinner,
  EmptyState,
  DataTable,
  ErrorBoundary,
} from "@/components/shared";
import { CoverArtPicker } from "@/components/shared/cover-art-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  Package,
  MapPin,
  Building,
  BookOpen,
  Edit,
  Save,
  X,
  AlertTriangle,
  History,
  ImageOff,
} from "lucide-react";

interface ItemDetail {
  id: number;
  barcode: string;
  statusId: number;
  statusName: string;
  callNumber: string;
  callNumberId?: number;
  recordId?: number;
  location: string;
  locationId?: number;
  circLib: string;
  circLibId?: number;
  owningLib: string;
  owningLibId?: number;
  copyNumber: number;
  price?: number;
  depositAmount?: number;
  holdable: boolean;
  circulate: boolean;
  refItem: boolean;
  opacVisible: boolean;
  title: string;
  author: string;
  isbn?: string;
  createDate?: string;
  editDate?: string;
  activeDate?: string;
  alertMessage?: string;
  notes?: string;
  historyError?: string;
  circModifier?: string;
  circModifierName?: string;
  loanDuration?: number;
  fineLevel?: number;
  floatingGroupId?: number;
  floatingGroupName?: string;
  statCatEntries?: Array<{
    mapId: number;
    statCatId: number;
    statCatName: string;
    entryId: number;
    entryValue: string;
  }>;
}

interface CircHistory {
  id: number;
  patronId?: number;
  patronBarcode?: string;
  patronName?: string;
  checkoutDate?: string;
  dueDate?: string;
  checkinDate?: string | null;
  renewCount?: number;
}

interface CircModifierOption {
  code: string;
  name: string;
  description?: string;
}

interface FloatingGroupOption {
  id: number;
  name: string;
}

interface StatEntryOption {
  id: number;
  value: string;
}

interface CopyStatCategoryOption {
  id: number;
  name: string;
  entries: StatEntryOption[];
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { 
    year: "numeric", 
    month: "short", 
    day: "numeric" 
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusColor(statusId: number) {
  switch (statusId) {
    case 0: return "text-green-600 bg-green-50 border-green-200";
    case 1: return "text-blue-600 bg-blue-50 border-blue-200";
    case 6: return "text-amber-600 bg-amber-50 border-amber-200";
    case 8: return "text-purple-600 bg-purple-50 border-purple-200";
    case 3: return "text-red-600 bg-red-50 border-red-200"; // Lost
    case 4: return "text-orange-600 bg-orange-50 border-orange-200"; // Missing
    default: return "text-muted-foreground bg-muted border-border";
  }
}

function loanDurationLabel(value?: number | null) {
  switch (value) {
    case 1:
      return "Short";
    case 2:
      return "Normal";
    case 3:
      return "Extended";
    default:
      return "—";
  }
}

function fineLevelLabel(value?: number | null) {
  switch (value) {
    case 1:
      return "Low";
    case 2:
      return "Normal";
    case 3:
      return "High";
    default:
      return "—";
  }
}

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [history, setHistory] = useState<CircHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState<string | undefined>(undefined);
  const [coverPreviewError, setCoverPreviewError] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);

  const [circModifiers, setCircModifiers] = useState<CircModifierOption[]>([]);
  const [floatingGroups, setFloatingGroups] = useState<FloatingGroupOption[]>([]);
  const [copyStatCategories, setCopyStatCategories] = useState<CopyStatCategoryOption[]>([]);

  // Editable fields
  const [editBarcode, setEditBarcode] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editHoldable, setEditHoldable] = useState(true);
  const [editCirculate, setEditCirculate] = useState(true);
  const [editOpacVisible, setEditOpacVisible] = useState(true);
  const [editAlertMessage, setEditAlertMessage] = useState("");
  const [editCircModifier, setEditCircModifier] = useState<string>("");
  const [editLoanDuration, setEditLoanDuration] = useState<string>("2");
  const [editFineLevel, setEditFineLevel] = useState<string>("2");
  const [editFloatingGroupId, setEditFloatingGroupId] = useState<string>("none");
  const [editStatEntries, setEditStatEntries] = useState<Record<number, number>>({});

  const loadItem = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/evergreen/items?id=${itemId}&include=bib,history`);
      const data = await res.json();
      
      if (data.ok && data.item) {
        setItem(data.item);
        setHistory(data.item.history || []);
        // Initialize edit fields
        setEditBarcode(data.item.barcode);
        setEditPrice(data.item.price?.toString() || "");
        setEditHoldable(data.item.holdable);
        setEditCirculate(data.item.circulate);
        setEditOpacVisible(data.item.opacVisible !== false);
        setEditAlertMessage(data.item.alertMessage || "");
        setEditCircModifier(data.item.circModifier || "");
        setEditLoanDuration(String(data.item.loanDuration || 2));
        setEditFineLevel(String(data.item.fineLevel || 2));
        setEditFloatingGroupId(
          data.item.floatingGroupId && Number.isFinite(data.item.floatingGroupId)
            ? String(data.item.floatingGroupId)
            : "none"
        );
        const initialStatMap: Record<number, number> = {};
        if (Array.isArray(data.item.statCatEntries)) {
          for (const row of data.item.statCatEntries) {
            if (typeof row?.statCatId === "number" && typeof row?.entryId === "number") {
              initialStatMap[row.statCatId] = row.entryId;
            }
          }
        }
        setEditStatEntries(initialStatMap);

        if (data.item.recordId) {
          try {
            const coverRes = await fetch(`/api/save-cover?recordId=${data.item.recordId}`);
            if (coverRes.ok) {
              const coverData = await coverRes.json();
              if (coverData?.success && coverData.coverUrl) {
                setCustomCoverUrl(coverData.coverUrl);
              } else {
                setCustomCoverUrl(undefined);
              }
            }
          } catch (err) {
            clientLogger.warn("Failed to load custom cover:", err);
          }
        } else {
          setCustomCoverUrl(undefined);
        }
      } else {
        setError(data.error || "Item not found");
      }
    } catch {
      setError("Failed to load item");
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const loadMetadata = useCallback(async () => {
    setMetadataLoading(true);
    try {
      const [modsRes, groupsRes, catsRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/circ-modifiers"),
        fetchWithAuth("/api/evergreen/floating-groups"),
        fetchWithAuth("/api/evergreen/stat-categories"),
      ]);

      const [modsJson, groupsJson, catsJson] = await Promise.all([
        modsRes.json().catch(() => ({})),
        groupsRes.json().catch(() => ({})),
        catsRes.json().catch(() => ({})),
      ]);

      const modifiers = Array.isArray(modsJson?.modifiers)
        ? (modsJson.modifiers as any[])
            .map((row) => ({
              code: String(row?.code || "").trim(),
              name: String(row?.name || row?.code || "").trim(),
              description:
                String(row?.description || "").trim() || undefined,
            }))
            .filter((row) => row.code.length > 0)
        : [];

      const groups = Array.isArray(groupsJson?.groups)
        ? (groupsJson.groups as any[])
            .map((row) => ({
              id: Number.parseInt(String(row?.id ?? ""), 10),
              name: String(row?.name || "").trim(),
            }))
            .filter((row) => Number.isFinite(row.id) && row.id > 0 && row.name.length > 0)
        : [];

      const copyCatsRaw = Array.isArray(catsJson?.copyCategories)
        ? (catsJson.copyCategories as any[])
        : [];

      const entryRequests = copyCatsRaw
        .map((cat: any) => {
          const id = Number.parseInt(String(cat?.id ?? ""), 10);
          if (!Number.isFinite(id) || id <= 0) return null;
          return fetchWithAuth(
            `/api/evergreen/stat-categories/entries?kind=copy&statCatId=${id}`
          )
            .then((r) => r.json())
            .then((json) => ({ id, json }))
            .catch(() => ({ id, json: null }));
        })
        .filter(Boolean) as Promise<{ id: number; json: any }>[];

      const entryResponses = await Promise.all(entryRequests);
      const entryMap = new Map<number, StatEntryOption[]>();

      for (const result of entryResponses) {
        const entries = Array.isArray(result?.json?.entries)
          ? (result.json.entries as any[])
              .map((entry) => ({
                id: Number.parseInt(String(entry?.id ?? ""), 10),
                value: String(entry?.value || "").trim(),
              }))
              .filter((entry) => Number.isFinite(entry.id) && entry.id > 0 && entry.value.length > 0)
          : [];
        entryMap.set(result.id, entries);
      }

      const categories: CopyStatCategoryOption[] = copyCatsRaw
        .map((cat: any) => {
          const id = Number.parseInt(String(cat?.id ?? ""), 10);
          const name = String(cat?.name || "").trim();
          if (!Number.isFinite(id) || id <= 0 || !name) return null;
          return {
            id,
            name,
            entries: entryMap.get(id) || [],
          };
        })
        .filter((cat): cat is CopyStatCategoryOption => Boolean(cat));

      setCircModifiers(modifiers);
      setFloatingGroups(groups);
      setCopyStatCategories(categories);
    } catch (err) {
      clientLogger.warn("Failed loading item metadata options", err);
      toast.error("Could not load all item metadata options");
    } finally {
      setMetadataLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    setCoverPreviewError(false);
  }, [customCoverUrl, item?.isbn, item?.recordId]);

  const handleCoverSelected = async (url: string, source: string) => {
    if (!item?.recordId) return;
    setCustomCoverUrl(url);

    try {
      const response = await fetchWithAuth("/api/save-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: item.recordId, coverUrl: url, source }),
      });

      if (!response.ok) {
        throw new Error("Failed to save cover");
      }
    } catch (err) {
      clientLogger.error("Error saving cover:", err);
      toast.error("Cover updated locally, but failed to save to server");
    }
  };

  const handleSave = async () => {
    if (!item) return;
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`/api/evergreen/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: editBarcode,
          price: editPrice ? parseFloat(editPrice) : null,
          holdable: editHoldable,
          circulate: editCirculate,
          opac_visible: editOpacVisible,
          alert_message: editAlertMessage || null,
          circ_modifier: editCircModifier || null,
          loan_duration: Number.parseInt(editLoanDuration, 10) || 2,
          fine_level: Number.parseInt(editFineLevel, 10) || 2,
          floating: editFloatingGroupId === "none" ? null : Number.parseInt(editFloatingGroupId, 10),
          stat_cat_entry_ids: Object.values(editStatEntries).filter((value) =>
            Number.isFinite(value)
          ),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Item updated");
        setIsEditing(false);
        loadItem();
      } else {
        toast.error(data.error || "Update failed");
      }
    } catch {
      toast.error("Failed to update item");
    } finally {
      setIsSaving(false);
    }
  };

  const historyColumns: ColumnDef<CircHistory>[] = [
    {
      accessorKey: "id",
      header: "Circ",
      cell: ({ row }) => <span className="text-xs font-mono">{row.original.id}</span>,
    },
    {
      id: "patron",
      header: "Patron",
      cell: ({ row }) => {
        const name = row.original.patronName;
        const barcode = row.original.patronBarcode;
        const id = row.original.patronId;
        if (!name && !barcode && !id) return "—";
        return (
          <div className="space-y-0.5">
            {name ? <div className="text-sm">{name}</div> : null}
            <div className="font-mono text-xs text-muted-foreground">
              {barcode ? barcode : id ? `ID ${id}` : "—"}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "checkoutDate",
      header: "Checked Out",
      cell: ({ row }) => formatDateTime(row.original.checkoutDate),
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => formatDate(row.original.dueDate),
    },
    {
      accessorKey: "checkinDate",
      header: "Returned",
      cell: ({ row }) => row.original.checkinDate ? formatDateTime(row.original.checkinDate) : (
        <Badge variant="outline" className="text-blue-600">Active</Badge>
      ),
    },
    {
      accessorKey: "renewCount",
      header: "Renewals",
      cell: ({ row }) => row.original.renewCount || 0,
    },
  ];

  if (isLoading) {
    return <LoadingSpinner message="Loading item..." />;
  }

  if (error || !item) {
    return (
      <PageContainer>
        <PageContent>
          <EmptyState
            title="Item not found"
            description={error || "The requested item could not be found."}
            action={{
              label: "Back to Catalog",
              onClick: () => router.push("/staff/catalog"),
              icon: ArrowLeft,
            }}
          />
        </PageContent>
      </PageContainer>
    );
  }

  const currentStatEntriesByCategory = new Map<number, string>();
  for (const row of item.statCatEntries || []) {
    if (
      typeof row?.statCatId === "number" &&
      row.statCatId > 0 &&
      typeof row?.entryValue === "string" &&
      row.entryValue.trim()
    ) {
      currentStatEntriesByCategory.set(row.statCatId, row.entryValue.trim());
    }
  }

  return (
    <ErrorBoundary onReset={() => router.refresh()}>
      <PageContainer>
        {(() => {
          const breadcrumbLabel =
            item.title && item.title.length > 42 ? `${item.title.slice(0, 42)}…` : item.title || item.barcode;
          const subtitleParts = [`Barcode ${item.barcode}`];
          if (item.callNumber) subtitleParts.push(item.callNumber);
          if (item.circLib) subtitleParts.push(item.circLib);
          const subtitle = subtitleParts.join(" • ");

          return (
        <PageHeader
          title={item.title || `Item ${item.barcode}`}
          subtitle={subtitle}
          breadcrumbs={[
            { label: "Catalog", href: "/staff/catalog" },
            { label: breadcrumbLabel },
          ]}
          actions={[
            {
              label: isEditing ? "Cancel" : "Edit Item",
              onClick: () => setIsEditing(!isEditing),
              icon: isEditing ? X : Edit,
              variant: isEditing ? "outline" : "default",
            },
            ...(isEditing
              ? [
                  {
                    label: "Save Changes",
                    onClick: handleSave,
                    icon: Save,
                    disabled: isSaving,
                  },
                ]
              : []),
            {
              label: "View Record",
              onClick: () => item.recordId && router.push(`/staff/catalog/record/${item.recordId}`),
              icon: BookOpen,
              variant: "outline" as const,
              disabled: !item.recordId,
            },
          ]}
        />
          );
        })()}

      <PageContent className="space-y-6">
        {/* Status Banner */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`h-16 w-16 rounded-xl flex items-center justify-center ${getStatusColor(item.statusId)}`}>
                  <Package className="h-8 w-8" />
                </div>
                <div>
                  <Badge variant="outline" className={`text-sm ${getStatusColor(item.statusId)}`}>
                    {item.statusName}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    Copy #{item.copyNumber} • {item.circLib}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold font-mono">{item.barcode}</p>
                <p className="text-sm text-muted-foreground">{item.callNumber}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Item Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Item Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="barcode">Barcode</Label>
                    <Input id="barcode" 
                      value={editBarcode} 
                      onChange={(e) => setEditBarcode(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Price</Label>
                    <Input id="price" 
                      type="number"
                      step="0.01"
                      value={editPrice} 
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alert-message">Alert Message</Label>
                    <Input id="alert-message" 
                      value={editAlertMessage} 
                      onChange={(e) => setEditAlertMessage(e.target.value)}
                      placeholder="Optional alert for staff"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="circ-modifier">Circ Modifier</Label>
                    <Select id="circ-modifier" value={editCircModifier || "none"} onValueChange={(value) => setEditCircModifier(value === "none" ? "" : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select circ modifier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {circModifiers.map((modifier) => (
                          <SelectItem key={modifier.code} value={modifier.code}>
                            {modifier.name} ({modifier.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="loan-duration">Loan Duration</Label>
                      <Select id="loan-duration" value={editLoanDuration} onValueChange={setEditLoanDuration}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Short</SelectItem>
                          <SelectItem value="2">Normal</SelectItem>
                          <SelectItem value="3">Extended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fine-level">Fine Level</Label>
                      <Select id="fine-level" value={editFineLevel} onValueChange={setEditFineLevel}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Low</SelectItem>
                          <SelectItem value="2">Normal</SelectItem>
                          <SelectItem value="3">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="floating-group">Floating Group</Label>
                    <Select id="floating-group" value={editFloatingGroupId} onValueChange={setEditFloatingGroupId}>
                      <SelectTrigger>
                        <SelectValue placeholder="No floating group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {floatingGroups.map((group) => (
                          <SelectItem key={group.id} value={String(group.id)}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {copyStatCategories.length > 0 && (
                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="text-sm font-medium">Copy Stat Categories</div>
                      {copyStatCategories.map((cat) => (
                        <div key={cat.id} className="space-y-2">
                          <Label htmlFor="cat-name">{cat.name}</Label>
                          <Select id="cat-name"
                            value={editStatEntries[cat.id] ? String(editStatEntries[cat.id]) : "none"}
                            onValueChange={(value) => {
                              setEditStatEntries((prev) => {
                                const next = { ...prev };
                                if (value === "none") {
                                  delete next[cat.id];
                                } else {
                                  const parsed = Number.parseInt(value, 10);
                                  if (Number.isFinite(parsed) && parsed > 0) {
                                    next[cat.id] = parsed;
                                  }
                                }
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="No assignment" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {cat.entries.map((entry) => (
                                <SelectItem key={entry.id} value={String(entry.id)}>
                                  {entry.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                  {metadataLoading && (
                    <p className="text-xs text-muted-foreground">Loading metadata options…</p>
                  )}
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label htmlFor="holdable">Holdable</Label>
                    <Switch id="holdable" checked={editHoldable} onCheckedChange={setEditHoldable} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="circulates">Circulates</Label>
                    <Switch id="circulates" checked={editCirculate} onCheckedChange={setEditCirculate} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="opac-visible">OPAC Visible</Label>
                    <Switch id="opac-visible" checked={editOpacVisible} onCheckedChange={setEditOpacVisible} />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Barcode</p>
                      <p className="font-mono font-medium">{item.barcode}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Call Number</p>
                      <p className="font-medium">{item.callNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Price</p>
                      <p className="font-medium">{item.price ? `$${item.price.toFixed(2)}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Copy Number</p>
                      <p className="font-medium">{item.copyNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Circ Modifier</p>
                      <p className="font-medium">
                        {item.circModifierName || item.circModifier || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Loan Duration</p>
                      <p className="font-medium">{loanDurationLabel(item.loanDuration)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Fine Level</p>
                      <p className="font-medium">{fineLevelLabel(item.fineLevel)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Floating Group</p>
                      <p className="font-medium">{item.floatingGroupName || "—"}</p>
                    </div>
                  </div>
                  {copyStatCategories.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Copy Stat Categories</p>
                        {copyStatCategories.map((cat) => (
                          <div key={cat.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{cat.name}</span>
                            <span className="font-medium">
                              {currentStatEntriesByCategory.get(cat.id) || "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={item.holdable ? "default" : "secondary"}>
                      {item.holdable ? "Holdable" : "Not Holdable"}
                    </Badge>
                    <Badge variant={item.circulate ? "default" : "secondary"}>
                      {item.circulate ? "Circulates" : "Non-Circ"}
                    </Badge>
                    <Badge variant={item.opacVisible ? "default" : "secondary"}>
                      {item.opacVisible ? "OPAC Visible" : "Hidden from OPAC"}
                    </Badge>
                    {item.refItem && <Badge variant="outline">Reference</Badge>}
                  </div>
                  {item.alertMessage && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5" />
                      <p className="text-sm">{item.alertMessage}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Location Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Circulating Library</p>
                  <p className="font-medium flex items-center gap-1">
                    <Building className="h-3.5 w-3.5" />
                    {item.circLib}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Owning Library</p>
                  <p className="font-medium flex items-center gap-1">
                    <Building className="h-3.5 w-3.5" />
                    {item.owningLib}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Shelving Location</p>
                  <p className="font-medium">{item.location}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDate(item.createDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Edited</p>
                  <p className="font-medium">{formatDate(item.editDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Active Since</p>
                  <p className="font-medium">{formatDate(item.activeDate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bibliographic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Bibliographic Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-start gap-6">
              {(() => {
                const cleanIsbn = item.isbn ? item.isbn.replace(/[^0-9X]/gi, "") : "";
                const coverUrl =
                  !coverPreviewError &&
                  (customCoverUrl ||
                    (cleanIsbn ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg` : ""));

                return (
              <button
                type="button"
                className="group relative w-32 h-48 rounded-lg overflow-hidden border bg-muted flex items-center justify-center"
                onClick={() => item.recordId && setCoverPickerOpen(true)}
                disabled={!item.recordId}
                title={item.recordId ? "Click to change cover art" : "No bib record attached"}
              >
                {!coverUrl ? (
                  <div className="text-center text-muted-foreground">
                    <ImageOff className="h-10 w-10 mx-auto mb-2" />
                    <span className="text-xs">No cover</span>
                  </div>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverUrl}
                      alt={`Cover of ${item.title}`}
                      className="w-full h-full object-contain bg-muted"
                      onError={() => setCoverPreviewError(true)}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-sm font-medium">
                      Change cover
                    </div>
                  </>
                )}
              </button>
                );
              })()}

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold">{item.title}</h3>
                {item.author && <p className="text-muted-foreground">{item.author}</p>}
                {item.isbn && (
                  <p className="text-sm text-muted-foreground mt-2">
                    ISBN: <span className="font-mono">{item.isbn}</span>
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mt-4">
                  {item.recordId && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/staff/catalog/record/${item.recordId}`}>
                        <BookOpen className="h-4 w-4 mr-1" />
                        Full Record
                      </Link>
                    </Button>
                  )}
                  {item.recordId && (
                    <Button variant="outline" size="sm" onClick={() => setCoverPickerOpen(true)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Change Cover
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Circulation History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Circulation History
            </CardTitle>
            <CardDescription>From Evergreen (circulation history)</CardDescription>
          </CardHeader>
          <CardContent>
            {item.historyError && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {item.historyError}
              </div>
            )}
            {history.length > 0 ? (
              <DataTable columns={historyColumns} data={history} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No circulation history available
              </p>
            )}
          </CardContent>
        </Card>
      </PageContent>
      </PageContainer>

      {item.recordId && (
        <CoverArtPicker
          open={coverPickerOpen}
          onOpenChange={setCoverPickerOpen}
          isbn={item.isbn}
          title={item.title}
          author={item.author}
          recordId={item.recordId}
          currentCoverUrl={customCoverUrl}
          onCoverSelected={handleCoverSelected}
        />
      )}
    </ErrorBoundary>
  );
}
