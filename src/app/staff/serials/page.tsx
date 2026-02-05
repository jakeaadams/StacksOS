"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { PageContainer, PageHeader, PageContent, SetupRequired, SETUP_CONFIGS } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Newspaper,
  Search,
  Plus,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Truck,
  Loader2,
  RefreshCw,
  Info,
  Package,
} from "lucide-react";

interface Subscription {
  id: string | number;
  owning_lib: number;
  start_date: string;
  end_date: string;
  record_entry: number;
}

interface SerialItem {
  id: string | number;
  issuance: number;
  stream: number;
  date_expected: string;
  date_received: string;
  status: string;
}

function statusBadge(status?: string) {
  const value = (status || "").toLowerCase();
  if (value.includes("received")) {
    return { label: "Received", className: "bg-green-100 text-green-800" };
  }
  if (value.includes("claim")) {
    return { label: "Claimed", className: "bg-orange-100 text-orange-800" };
  }
  if (value.includes("expected")) {
    return { label: "Expected", className: "bg-blue-100 text-blue-800" };
  }
  return { label: status || "Unknown", className: "bg-muted/50 text-foreground" };
}

type TabKey = "subscriptions" | "check-in" | "claims";

export default function SerialsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("subscriptions");

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [activeSubscriptionId, setActiveSubscriptionId] = useState<string | number | null>(null);

  const [items, setItems] = useState<SerialItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [receiving, setReceiving] = useState<string | number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimNote, setClaimNote] = useState("");
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string | number>>(new Set());

  const activeSubscription = useMemo(() => {
    if (activeSubscriptionId == null) return null;
    return subscriptions.find((s) => String(s.id) === String(activeSubscriptionId)) || null;
  }, [subscriptions, activeSubscriptionId]);

  const expectedItems = useMemo(
    () => items.filter((i) => (i.status || "").toLowerCase().includes("expected")),
    [items]
  );

  const claimedItems = useMemo(
    () => items.filter((i) => (i.status || "").toLowerCase().includes("claim")),
    [items]
  );

  const filteredSubscriptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return subscriptions;
    return subscriptions.filter((s) => {
      return (
        String(s.id).toLowerCase().includes(q) ||
        String(s.record_entry).toLowerCase().includes(q) ||
        String(s.owning_lib).toLowerCase().includes(q)
      );
    });
  }, [subscriptions, searchQuery]);

  const filteredExpectedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return expectedItems;
    return expectedItems.filter((i) => {
      return (
        String(i.id).toLowerCase().includes(q) ||
        String(i.issuance).toLowerCase().includes(q) ||
        (i.status || "").toLowerCase().includes(q)
      );
    });
  }, [expectedItems, searchQuery]);

  const filteredClaimedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return claimedItems;
    return claimedItems.filter((i) => {
      return (
        String(i.id).toLowerCase().includes(q) ||
        String(i.issuance).toLowerCase().includes(q) ||
        (i.status || "").toLowerCase().includes(q)
      );
    });
  }, [claimedItems, searchQuery]);

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSetupMessage(null);

    try {
      const subsRes = await fetchWithAuth("/api/evergreen/serials?action=subscriptions");
      const subsData = await subsRes.json();

      const subs: Subscription[] = subsData.ok ? subsData.subscriptions || [] : [];
      setSubscriptions(subs);
      if (subsData.ok) setSetupMessage(subsData.message || null);

      // Default selection: first subscription.
      setActiveSubscriptionId((prev) => (prev == null && subs.length > 0 ? subs[0].id : prev));
    } catch (err) {
      setError("Failed to load subscriptions");
      clientLogger.error("Load subscriptions error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = async (subscriptionId: string | number) => {
    setItemsLoading(true);
    setError(null);

    try {
      const url = `/api/evergreen/serials?action=items&subscription_id=${encodeURIComponent(
        String(subscriptionId)
      )}`;
      const itemsRes = await fetchWithAuth(url);
      const itemsData = await itemsRes.json();
      setItems(itemsData.ok ? itemsData.items || [] : []);
    } catch (err) {
      setItems([]);
      setError("Failed to load subscription items");
      clientLogger.error("Load items error:", err);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    if (activeSubscriptionId == null) {
      setItems([]);
      return;
    }
    void loadItems(activeSubscriptionId);
  }, [activeSubscriptionId]);

  const refresh = async () => {
    await loadSubscriptions();
    if (activeSubscriptionId != null) {
      await loadItems(activeSubscriptionId);
    }
  };

  const handleSelectSubscription = (sub: Subscription) => {
    setActiveSubscriptionId(sub.id);
    setActiveTab("check-in");
  };

  const handleReceive = async (itemId: string | number) => {
    setReceiving(itemId);

    try {
      const response = await fetchWithAuth("/api/evergreen/serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "receive", item_id: itemId }),
      });

      const data = await response.json();
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Failed to receive item");
      }

      toast.success("Issue received");
      if (activeSubscriptionId != null) {
        await loadItems(activeSubscriptionId);
      }
    } catch (err) {
      toast.error("Receive failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setReceiving(null);
    }
  };

  const handleClaimSelected = async () => {
    if (selectedClaimIds.size === 0) {
      toast.error("Select at least one expected issue to claim");
      return;
    }
    setClaiming(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim",
          item_ids: Array.from(selectedClaimIds),
          claim_type: 1,
          note: claimNote.trim() || "",
        }),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Failed to create claims");
      }
      toast.success(`Created ${data.successCount || 0} claim(s)`);
      setSelectedClaimIds(new Set());
      setClaimNote("");
      if (activeSubscriptionId != null) {
        await loadItems(activeSubscriptionId);
      }
    } catch (err) {
      toast.error("Claim failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show SetupRequired if no subscriptions
  if (subscriptions.length === 0 && !loading) {
    return (
      <PageContainer>
        <PageHeader
          title="Serials"
          subtitle="Track subscriptions, check-ins, and claims."
          breadcrumbs={[{ label: "Serials" }]}
        />
        <PageContent>
          <SetupRequired
            {...SETUP_CONFIGS.serials}
            docsUrl="/staff/help#serials"
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Serials"
        subtitle="Track subscriptions, check-ins, and claims."
        breadcrumbs={[{ label: "Serials" }]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
          <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/staff/serials/subscriptions">
                <Plus className="h-4 w-4 mr-1" />New Subscription
              </Link>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveTab("check-in")}
              disabled={subscriptions.length === 0}
            >
              <CheckCircle className="h-4 w-4 mr-1" />Quick Check-In
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveTab("claims")}
              disabled={subscriptions.length === 0}
            >
              <Truck className="h-4 w-4 mr-1" />Claims
            </Button>

            <div className="border-l h-6 mx-2" />

            <Button size="sm" variant="ghost" onClick={refresh} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>

            <div className="flex-1" />

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search subscriptions/issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-64 h-8"
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="m-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {setupMessage && !error && (
            <Alert className="m-4">
              <Info className="h-4 w-4" />
              <AlertDescription>{setupMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex-1 p-4 overflow-auto">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="h-full flex flex-col">
              <TabsList>
                <TabsTrigger value="subscriptions" className="flex items-center gap-2">
                  <Newspaper className="h-4 w-4" />Subscriptions ({subscriptions.length})
                </TabsTrigger>
                <TabsTrigger value="check-in" className="flex items-center gap-2" disabled={subscriptions.length === 0}>
                  <Package className="h-4 w-4" />Check-In ({expectedItems.length})
                </TabsTrigger>
                <TabsTrigger value="claims" className="flex items-center gap-2" disabled={subscriptions.length === 0}>
                  <AlertTriangle className="h-4 w-4" />Claims ({claimedItems.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="subscriptions" className="flex-1 mt-4">
                <Card className="h-full">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Record Entry</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Owning Library</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSubscriptions.map((sub) => (
                          <TableRow
                            key={sub.id}
                            className={
                              String(sub.id) === String(activeSubscriptionId)
                                ? "bg-muted/40"
                                : "hover:bg-muted/20 cursor-pointer"
                            }
                            onClick={() => handleSelectSubscription(sub)}
                          >
                            <TableCell className="font-mono">{sub.id}</TableCell>
                            <TableCell className="font-mono">{sub.record_entry}</TableCell>
                            <TableCell>{sub.start_date?.split("T")[0] || "-"}</TableCell>
                            <TableCell>{sub.end_date?.split("T")[0] || "-"}</TableCell>
                            <TableCell className="font-mono">{sub.owning_lib}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="check-in" className="flex-1 mt-4">
                <Card className="h-full">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Package className="h-4 w-4" />Expected Issues
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activeSubscription ? `Subscription #${activeSubscription.id}` : "Select a subscription"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {itemsLoading ? (
                      <div className="p-10 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredExpectedItems.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No expected issues</p>
                        <p className="text-sm mt-2">Select a subscription, or adjust serial patterns in Evergreen.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item ID</TableHead>
                            <TableHead>Issuance</TableHead>
                            <TableHead>Expected Date</TableHead>
                            <TableHead>Received Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredExpectedItems.map((item) => {
                            const badge = statusBadge(item.status);
                            const lowerStatus = (item.status || "").toLowerCase();
                            const received = lowerStatus.includes("received");

                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono">{item.id}</TableCell>
                                <TableCell className="font-mono">{item.issuance}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-sm">
                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                    {item.date_expected?.split("T")[0] || "-"}
                                  </div>
                                </TableCell>
                                <TableCell>{item.date_received?.split("T")[0] || "-"}</TableCell>
                                <TableCell>
                                  <Badge className={`${badge.className} flex items-center gap-1`}>{badge.label}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReceive(item.id)}
                                    disabled={receiving === item.id || received}
                                  >
                                    {receiving === item.id ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                    )}
                                    Check In
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="claims" className="flex-1 mt-4">
                <Card className="h-full">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />Claimed Issues
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activeSubscription ? `Subscription #${activeSubscription.id}` : "Select a subscription"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Create claims for missing/late issues (Evergreen-backed). When issues arrive, use Check-In to receive them.
                      </AlertDescription>
                    </Alert>

                    {itemsLoading ? (
                      <div className="p-10 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Card>
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">Create claims (from expected issues)</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div>
                              <Label>Claim note (optional)</Label>
                              <Textarea value={claimNote} onChange={(e) => setClaimNote(e.target.value)} placeholder="Optional note to include with claims" />
                            </div>
                            <div className="flex justify-end">
                              <Button onClick={handleClaimSelected} disabled={claiming || selectedClaimIds.size === 0}>
                                {claiming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                                Create claim(s)
                              </Button>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">Expected issues</CardTitle>
                          </CardHeader>
                          <CardContent className="p-0">
                            {filteredExpectedItems.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground">
                                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No expected issues</p>
                              </div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead></TableHead>
                                    <TableHead>Item ID</TableHead>
                                    <TableHead>Issuance</TableHead>
                                    <TableHead>Expected Date</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {filteredExpectedItems.map((item) => {
                                    const selected = selectedClaimIds.has(item.id);
                                    const badge = statusBadge(item.status);
                                    return (
                                      <TableRow key={item.id}>
                                        <TableCell>
                                          <Checkbox
                                            checked={selected}
                                            onCheckedChange={(v) => {
                                              setSelectedClaimIds((prev) => {
                                                const next = new Set(prev);
                                                if (Boolean(v)) next.add(item.id);
                                                else next.delete(item.id);
                                                return next;
                                              });
                                            }}
                                          />
                                        </TableCell>
                                        <TableCell className="font-mono">{item.id}</TableCell>
                                        <TableCell className="font-mono">{item.issuance}</TableCell>
                                        <TableCell>{item.date_expected?.split("T")[0] || "-"}</TableCell>
                                        <TableCell>
                                          <Badge className={`${badge.className} flex items-center gap-1`}>{badge.label}</Badge>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">Claimed issues</CardTitle>
                          </CardHeader>
                          <CardContent className="p-0">
                            {filteredClaimedItems.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground">
                                <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No claimed issues</p>
                                <p className="text-sm mt-2">Claimed issues will appear here for tracking</p>
                              </div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Item ID</TableHead>
                                    <TableHead>Issuance</TableHead>
                                    <TableHead>Expected Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {filteredClaimedItems.map((item) => {
                                    const badge = statusBadge(item.status);
                                    return (
                                      <TableRow key={item.id}>
                                        <TableCell className="font-mono">{item.id}</TableCell>
                                        <TableCell className="font-mono">{item.issuance}</TableCell>
                                        <TableCell>{item.date_expected?.split("T")[0] || "-"}</TableCell>
                                        <TableCell>
                                          <Badge className={`${badge.className} flex items-center gap-1`}>{badge.label}</Badge>
                                        </TableCell>
                                        <TableCell>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleReceive(item.id)}
                                            disabled={receiving === item.id}
                                          >
                                            {receiving === item.id ? (
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                              <CheckCircle className="h-3 w-3 mr-1" />
                                            )}
                                            Mark Received
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
            <span>Subscriptions: {subscriptions.length}</span>
            <span>Expected: {expectedItems.length}</span>
            <span>Claimed: {claimedItems.length}</span>
            <div className="flex-1" />
            <span>Serials Control</span>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
