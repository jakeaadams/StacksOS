"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PageContainer,
  PageHeader,
  PageContent,
  LoadingSpinner,
  EmptyState,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { fetchWithAuth } from "@/lib/client-fetch";
import { toast } from "sonner";
import {
  DollarSign,
  RefreshCw,
  ArrowLeft,
  Building2,
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  FileText,
  History,
} from "lucide-react";

interface Fund {
  id: number;
  name: string;
  code: string;
  year: number;
  org: number;
  orgName: string | null;
  currency: string;
  active: boolean;
  rollover: boolean;
  propagate: boolean;
  balanceWarningPercent: number | null;
  balanceStopPercent: number | null;
}

interface FundSummary {
  allocation_total: number;
  spent_total: number;
  encumbrance_total: number;
  debit_total: number;
  balance: number;
}

interface Allocation {
  id: number;
  amount: number;
  note: string | null;
  createTime: string;
  fundingSourceId: number;
  fundingSourceName: string;
  allocator: number;
}

interface Transfer {
  id: number;
  sourceFund: number;
  destFund: number;
  amount: number;
  note: string | null;
  transferTime: string;
  transferUser: number;
}

export default function FundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fundId = params.id as string;

  const [fund, setFund] = useState<Fund | null>(null);
  const [summary, setSummary] = useState<FundSummary | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFundDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithAuth(`/api/evergreen/acquisitions/funds?id=${fundId}`);
      const data = await response.json();
      if (data.ok) {
        setFund(data.fund);
        setSummary(data.summary);
        setAllocations(data.allocations || []);
        setTransfers(data.transfers || []);
      } else {
        toast.error(data.error || "Failed to load fund details");
      }
    } catch {
      toast.error("Failed to load fund details");
    } finally {
      setIsLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    loadFundDetails();
  }, [loadFundDetails]);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const getUsagePercent = () => {
    if (!summary || summary.allocation_total <= 0) return 0;
    return Math.min(100, ((summary.spent_total + summary.encumbrance_total) / summary.allocation_total) * 100);
  };

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Fund Details" breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Funds", href: "/staff/acquisitions/funds" }, { label: "Loading..." }]} />
        <PageContent><LoadingSpinner message="Loading fund details..." /></PageContent>
      </PageContainer>
    );
  }

  if (!fund) {
    return (
      <PageContainer>
        <PageHeader title="Fund Not Found" breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Funds", href: "/staff/acquisitions/funds" }, { label: "Not Found" }]} />
        <PageContent><EmptyState title="Fund not found" description="The requested fund could not be found." action={{ label: "Back to Funds", onClick: () => router.push("/staff/acquisitions/funds") }} /></PageContent>
      </PageContainer>
    );
  }

  const usagePercent = getUsagePercent();

  return (
    <PageContainer>
      <PageHeader
        title={fund.name}
        subtitle={`Fund code: ${fund.code}`}
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Funds", href: "/staff/acquisitions/funds" }, { label: fund.name }]}
        actions={[
          { label: "Back", onClick: () => router.push("/staff/acquisitions/funds"), icon: ArrowLeft, variant: "outline" },
          { label: "Refresh", onClick: loadFundDetails, icon: RefreshCw, variant: "outline" },
        ]}
      />

      <PageContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-5 w-5" />Fund Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Year</p>
                  <div className="flex items-center gap-1 mt-1"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{fund.year}</span></div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Organization</p>
                  <div className="flex items-center gap-1 mt-1"><Building2 className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{fund.orgName || `Org ${fund.org}`}</span></div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Currency</p>
                  <p className="font-medium mt-1">{fund.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Status</p>
                  <Badge className={`mt-1 ${fund.active ? "bg-green-100 text-green-800" : "bg-muted/50 text-foreground"}`}>{fund.active ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
              <div className="flex gap-2">
                {fund.rollover && <Badge variant="outline">Rollover Enabled</Badge>}
                {fund.propagate && <Badge variant="outline">Propagates</Badge>}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Budget Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Used</span>
                  <span>{usagePercent.toFixed(1)}%</span>
                </div>
                <Progress value={usagePercent} className={`h-3 ${usagePercent > 90 ? "[&>div]:bg-red-500" : usagePercent > 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`} />
              </div>
              <div className="text-xs text-muted-foreground">
                {formatCurrency((summary?.spent_total || 0) + (summary?.encumbrance_total || 0), fund.currency)} of {formatCurrency(summary?.allocation_total || 0, fund.currency)} used
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Allocated</p>
                  <div className="text-xl font-semibold mt-1">{formatCurrency(summary?.allocation_total || 0, fund.currency)}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-600"><DollarSign className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Spent</p>
                  <div className="text-xl font-semibold mt-1 text-red-600">{formatCurrency(summary?.spent_total || 0, fund.currency)}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-600"><TrendingDown className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Encumbered</p>
                  <div className="text-xl font-semibold mt-1 text-amber-600">{formatCurrency(summary?.encumbrance_total || 0, fund.currency)}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600"><DollarSign className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Balance</p>
                  <div className={`text-xl font-semibold mt-1 ${(summary?.balance || 0) < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(summary?.balance || 0, fund.currency)}</div>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-green-500/10 text-green-600"><TrendingUp className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-0">
            <Tabs defaultValue="allocations" className="w-full">
              <div className="border-b px-4">
                <TabsList className="h-12 bg-transparent">
                  <TabsTrigger value="allocations" className="flex items-center gap-2"><History className="h-4 w-4" />Allocations ({allocations.length})</TabsTrigger>
                  <TabsTrigger value="transfers" className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" />Transfers ({transfers.length})</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="allocations" className="p-4">
                {allocations.length === 0 ? (
                  <EmptyState icon={FileText} title="No allocations" description="No allocations have been made to this fund." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Funding Source</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocations.map((alloc) => (
                        <TableRow key={alloc.id}>
                          <TableCell>{formatDate(alloc.createTime)}</TableCell>
                          <TableCell>{alloc.fundingSourceName || `Source ${alloc.fundingSourceId}`}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">+{formatCurrency(alloc.amount, fund.currency)}</TableCell>
                          <TableCell className="text-muted-foreground">{alloc.note || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="transfers" className="p-4">
                {transfers.length === 0 ? (
                  <EmptyState icon={ArrowRightLeft} title="No transfers" description="No transfers have been made to or from this fund." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((transfer) => {
                        const isOutgoing = transfer.sourceFund === fund.id;
                        return (
                          <TableRow key={transfer.id}>
                            <TableCell>{formatDate(transfer.transferTime)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={isOutgoing ? "border-red-200 text-red-700" : "border-green-200 text-green-700"}>
                                {isOutgoing ? "Outgoing" : "Incoming"}
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-mono ${isOutgoing ? "text-red-600" : "text-green-600"}`}>
                              {isOutgoing ? "-" : "+"}{formatCurrency(transfer.amount, fund.currency)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{transfer.note || "-"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
