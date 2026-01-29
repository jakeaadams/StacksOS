"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {

  PageContainer,
  PageHeader,
  PageContent,
  EmptyState,
  ErrorMessage,
} from "@/components/shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  ShoppingCart,
  Search,
  Plus,
  DollarSign,
  Package,
  Truck,
  CheckCircle,
  Clock,
  Building2,
  FileText,
  Loader2,
  Globe,
} from "lucide-react";

interface PurchaseOrder {
  id: string | number;
  name: string;
  provider: string | number;
  state: string;
  order_date: string;
  create_time: string;
  lineitem_count: number;
}

interface Fund {
  id: string | number;
  name: string;
  code: string;
  year: number;
  currency: string;
}

interface Vendor {
  id: string | number;
  name: string;
  code: string;
  email: string;
  active: boolean;
}

export default function AcquisitionsPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [ordersMessage, setOrdersMessage] = useState<string>("");
  const [fundsMessage, setFundsMessage] = useState<string>("");
  const [vendorsMessage, setVendorsMessage] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [ordersRes, fundsRes, vendorsRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/acquisitions?action=orders"),
        fetchWithAuth("/api/evergreen/acquisitions?action=funds"),
        fetchWithAuth("/api/evergreen/acquisitions?action=vendors"),
      ]);

      const ordersJson = await ordersRes.json();
      const fundsJson = await fundsRes.json();
      const vendorsJson = await vendorsRes.json();

      if (ordersJson.ok) {
        setOrders(ordersJson.orders || []);
        setOrdersMessage(typeof ordersJson.message === "string" ? ordersJson.message : "");
      } else {
        setOrders([]);
        setOrdersMessage(ordersJson.error || "Failed to load purchase orders");
      }

      if (fundsJson.ok) {
        setFunds(fundsJson.funds || []);
        setFundsMessage(typeof fundsJson.message === "string" ? fundsJson.message : "");
      } else {
        setFunds([]);
        setFundsMessage(fundsJson.error || "Failed to load funds");
      }

      if (vendorsJson.ok) {
        setVendors(vendorsJson.vendors || []);
        setVendorsMessage(typeof vendorsJson.message === "string" ? vendorsJson.message : "");
      } else {
        setVendors([]);
        setVendorsMessage(vendorsJson.error || "Failed to load vendors");
      }
    } catch {
      setError("Failed to load acquisitions data");
    } finally {
      setLoading(false);
    }
  };

  const vendorMap = useMemo(() => {
    const map = new Map<string | number, Vendor>();
    for (const vendor of vendors) {
      map.set(vendor.id, vendor);
    }
    return map;
  }, [vendors]);

  const getVendorName = (providerId: string | number) => {
    const vendor = vendorMap.get(providerId);
    return vendor?.name || `Provider ${providerId}`;
  };

  const getStatusBadge = (state: string) => {
    const variants: Record<string, { color: string; icon: ReactNode }> = {
      pending: { color: "bg-muted/50 text-foreground", icon: <Clock className="h-3 w-3" /> },
      "on-order": { color: "bg-blue-100 text-blue-800", icon: <Truck className="h-3 w-3" /> },
      received: { color: "bg-green-100 text-green-800", icon: <CheckCircle className="h-3 w-3" /> },
    };

    const config = variants[state] || { color: "bg-muted/50 text-foreground", icon: null };

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {state}
      </Badge>
    );
  };

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((order) => {
      const vendorName = (vendorMap.get(order.provider)?.name || `Provider ${order.provider}`).toLowerCase();
      return (
        String(order.id).toLowerCase().includes(q) ||
        String(order.name || "").toLowerCase().includes(q) ||
        vendorName.includes(q) ||
        String(order.state || "").toLowerCase().includes(q)
      );
    });
  }, [orders, searchQuery, vendorMap]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Acquisitions"
        subtitle="Track funds, orders, and receiving across vendors."
        breadcrumbs={[{ label: "Acquisitions" }]}
        actions={[
          {
            label: "Setup Guide",
            onClick: () => router.push("/staff/help#evergreen-setup"),
            icon: Globe,
            variant: "outline",
          },
        ]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
          <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/staff/acquisitions/orders">
                <Plus className="h-4 w-4 mr-1" />New Order
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/staff/acquisitions/receiving">
                <Package className="h-4 w-4 mr-1" />Receive Items
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/staff/reports">
                <FileText className="h-4 w-4 mr-1" />Reports
              </Link>
            </Button>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-64 h-8"
              />
            </div>
          </div>

          {error && (
            <div className="p-4">
              <ErrorMessage message={error} onRetry={() => void loadData()} />
            </div>
          )}

          <div className="flex-1 p-4 overflow-auto">
            <Tabs defaultValue="orders" className="h-full flex flex-col">
              <TabsList>
                <TabsTrigger value="orders" className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />Purchase Orders ({orders.length})
                </TabsTrigger>
                <TabsTrigger value="funds" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />Funds ({funds.length})
                </TabsTrigger>
                <TabsTrigger value="vendors" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />Vendors ({vendors.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="orders" className="flex-1 mt-4">
                <Card className="h-full">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />Purchase Orders
                      </span>
                      <Badge variant="outline">
                        {filteredOrders.length} shown
                        {searchQuery.trim() ? ` (filtered)` : ""}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {filteredOrders.length === 0 ? (
                      <div className="p-8">
                        <EmptyState
                          icon={ShoppingCart}
                          title={searchQuery.trim() ? "No matching orders" : "No purchase orders"}
                          description={
                            searchQuery.trim()
                              ? "No purchase orders match your search."
                              : ordersMessage || "No purchase orders found."
                          }
                          action={{
                            label: "New Order",
                            onClick: () => router.push("/staff/acquisitions/orders"),
                            icon: Plus,
                          }}
                          secondaryAction={{
                            label: "Setup Guide",
                            onClick: () => router.push("/staff/help#evergreen-setup"),
                          }}
                        />
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-32">Order ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="w-28">Date</TableHead>
                            <TableHead className="w-28">Status</TableHead>
                            <TableHead className="w-20 text-center">Items</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredOrders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell className="font-mono">{order.id}</TableCell>
                              <TableCell className="font-medium">{order.name}</TableCell>
                              <TableCell>{getVendorName(order.provider)}</TableCell>
                              <TableCell>
                                {order.order_date || order.create_time?.split("T")[0] || "-"}
                              </TableCell>
                              <TableCell>{getStatusBadge(order.state)}</TableCell>
                              <TableCell className="text-center">{order.lineitem_count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="funds" className="flex-1 mt-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">Fund Accounts</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {funds.length === 0 ? (
                      <div className="p-8">
                        <EmptyState
                          icon={DollarSign}
                          title="No funds"
                          description={
                            fundsMessage || "No funds configured or permission denied."
                          }
                          action={{
                            label: "Setup Guide",
                            onClick: () => router.push("/staff/help#evergreen-setup"),
                            icon: Globe,
                          }}
                        />
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fund Name</TableHead>
                            <TableHead className="w-20">Code</TableHead>
                            <TableHead className="w-20">Year</TableHead>
                            <TableHead className="w-24">Currency</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {funds.map((fund) => (
                            <TableRow key={fund.id}>
                              <TableCell className="font-medium">{fund.name}</TableCell>
                              <TableCell className="font-mono">{fund.code}</TableCell>
                              <TableCell>{fund.year}</TableCell>
                              <TableCell>{fund.currency}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="vendors" className="flex-1 mt-4">
                <Card className="h-full">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4" />Vendor Directory
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {vendors.length === 0 ? (
                      <div className="p-8">
                        <EmptyState
                          icon={Building2}
                          title="No vendors"
                          description={
                            vendorsMessage || "No vendors configured or permission denied."
                          }
                          action={{
                            label: "Add Vendor",
                            onClick: () => router.push("/staff/acquisitions/vendors"),
                            icon: Plus,
                          }}
                          secondaryAction={{
                            label: "Setup Guide",
                            onClick: () => router.push("/staff/help#evergreen-setup"),
                          }}
                        />
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vendor Name</TableHead>
                            <TableHead className="w-20">Code</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="w-24">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendors.map((vendor) => (
                            <TableRow key={vendor.id}>
                              <TableCell className="font-medium">{vendor.name}</TableCell>
                              <TableCell className="font-mono">{vendor.code}</TableCell>
                              <TableCell>{vendor.email || "-"}</TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    vendor.active
                                      ? "bg-green-100 text-green-800"
                                      : "bg-muted/50 text-foreground"
                                  }
                                >
                                  {vendor.active ? "Active" : "Inactive"}
                                </Badge>
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
          </div>

          <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
            <span>Orders: {orders.length}</span>
            <span>Funds: {funds.length}</span>
            <span>Vendors: {vendors.length}</span>
            <div className="flex-1" />
            <span>Acquisitions</span>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
