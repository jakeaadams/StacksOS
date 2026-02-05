"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/client-fetch";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PatronPhotoUpload } from "./patron-photo-upload";

import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Camera,
  CreditCard,
  ExternalLink,
  Mail,
  Package,
  Phone,
  User,
} from "lucide-react";

interface PatronCockpitProps {
  patronId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckout?: (patronId: number) => void;
}

interface PatronData {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  homeLibrary?: string;
  patronType?: string;
  isActive: boolean;
  barred: boolean;
  expireDate?: string;
  penalties: number;
}

interface CheckoutItem {
  id: number;
  title: string;
  barcode: string;
  dueDate?: string;
  overdue: boolean;
}

interface HoldItem {
  id: number;
  title: string;
  status: string;
  position?: number;
}

interface Bill {
  id: number;
  title: string;
  balance: number;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount);
}

export function PatronCockpit({ patronId, open, onOpenChange, onCheckout }: PatronCockpitProps) {
  const [patron, setPatron] = useState<PatronData | null>(null);
  const [checkouts, setCheckouts] = useState<CheckoutItem[]>([]);
  const [holds, setHolds] = useState<HoldItem[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [patronPhotoUrl, setPatronPhotoUrl] = useState<string | undefined>(undefined);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);

  const loadPatronData = useCallback(async () => {
    if (!patronId) return;
    setIsLoading(true);
    setPatronPhotoUrl(undefined);

    try {
      const [patronRes, circRes, holdsRes, billsRes, photoRes] = await Promise.all([
        fetchWithAuth(`/api/evergreen/patrons?id=${patronId}`),
        fetchWithAuth(`/api/evergreen/circulation?patron_id=${patronId}`),
        fetchWithAuth(`/api/evergreen/circulation?action=holds&patron_id=${patronId}`),
        fetchWithAuth(`/api/evergreen/circulation?action=bills&patron_id=${patronId}`),
        fetchWithAuth(`/api/patron-photos?patronId=${patronId}`),
      ]);

      const patronData = await patronRes.json();
      if (patronData.ok && patronData.patron) {
        const p = patronData.patron;
        setPatron({
          id: p.id,
          barcode: p.barcode || p.card?.barcode || "—",
          firstName: p.first_given_name || "",
          lastName: p.family_name || "",
          email: p.email || "",
          phone: p.day_phone || p.evening_phone || "",
          homeLibrary: typeof p.home_ou === "number" ? `Library ${p.home_ou}` : p.home_ou,
          patronType: p.profile?.name || p.patronType || "Patron",
          isActive: p.active === "t" || p.active === true,
          barred: p.barred === "t" || p.barred === true,
          expireDate: p.expire_date,
          penalties: Array.isArray(p.standing_penalties) ? p.standing_penalties.length : 0,
        });
      }

      const photoData = await photoRes.json().catch(() => null);
      if (photoData?.success && photoData?.url) {
        setPatronPhotoUrl(photoData.url);
      }

      const circData = await circRes.json();
      if (circData.ok && circData.checkouts) {
        const allCheckouts = [
          ...(circData.checkouts.out || []),
          ...(circData.checkouts.overdue || []),
        ];
        setCheckouts(
          allCheckouts.slice(0, 5).map((c: any) => ({
            id: c.circId || c.id,
            title: c.title || "Unknown",
            barcode: c.barcode || "—",
            dueDate: c.dueDate,
            overdue: !!c.dueDate && new Date(c.dueDate) < new Date(),
          }))
        );
      }

      const holdsData = await holdsRes.json();
      if (holdsData.ok && holdsData.holds) {
        setHolds(
          (holdsData.holds || []).slice(0, 5).map((h: any) => ({
            id: h.id,
            title: h.title || "Unknown",
            status: h.status || "Pending",
            position: h.queue_position,
          }))
        );
      }

      const billsData = await billsRes.json();
      if (billsData.ok && billsData.bills) {
        setBills(
          (billsData.bills || []).filter((b: any) => b.balance > 0).slice(0, 5).map((b: any) => ({
            id: b.id,
            title: b.title || b.billing_type || "Fee",
            balance: b.balance || 0,
          }))
        );
      }
    } catch (_error) {
      toast.error("Failed to load patron data");
    } finally {
      setIsLoading(false);
    }
  }, [patronId]);

  useEffect(() => {
    if (open && patronId) {
      loadPatronData();
    }
  }, [open, patronId, loadPatronData]);

  const totalOwed = bills.reduce((sum, b) => sum + b.balance, 0);
  const overdueCount = checkouts.filter((c) => c.overdue).length;
  const expired = patron?.expireDate ? new Date(patron.expireDate) < new Date() : false;
  const initials =
    patron?.firstName || patron?.lastName
      ? `${patron?.firstName?.[0] || ""}${patron?.lastName?.[0] || ""}`.toUpperCase()
      : "?";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[450px] sm:w-[540px] sm:max-w-lg p-0">
        <ScrollArea className="h-full">
          <div className="p-6">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patron Quick View
              </SheetTitle>
              <SheetDescription>
                View key patron info and take quick actions
              </SheetDescription>
            </SheetHeader>

            {isLoading ? (
              <div className="mt-6 space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : patron ? (
              <div className="mt-6 space-y-6">
                {/* Patron Header */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="relative group cursor-pointer"
                      onClick={() => setPhotoUploadOpen(true)}
                      role="button"
                      aria-label="Upload patron photo"
                      tabIndex={0}
                      title="Click to upload photo"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPhotoUploadOpen(true);
                        }
                      }}
                    >
                      <Avatar className="h-12 w-12 transition-opacity group-hover:opacity-70">
                        {patronPhotoUrl ? (
                          <AvatarImage
                            src={patronPhotoUrl}
                            alt={`${patron.firstName} ${patron.lastName}`.trim() || "Patron photo"}
                            data-testid="patron-cockpit-photo-image"
                            onError={() => setPatronPhotoUrl(undefined)}
                          />
                        ) : null}
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full pointer-events-none">
                        <Camera className="h-4 w-4 text-white" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold truncate">
                            {patron.lastName}, {patron.firstName}
                          </h3>
                          <p className="text-sm text-muted-foreground font-mono truncate">{patron.barcode}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {patron.barred && (
                            <Badge variant="destructive">Barred</Badge>
                          )}
                          {!patron.isActive && !patron.barred && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          {expired && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300">
                              Expired
                            </Badge>
                          )}
                          {patron.penalties > 0 && (
                            <Badge variant="outline" className="text-red-600 border-red-300">
                              {patron.penalties} block{patron.penalties > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      </div>

                  <Separator className="my-3" />

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate">{patron.email || "—"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{patron.phone || "—"}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            onOpenChange(false);
                            onCheckout?.(patron.id);
                          }}
                        >
                          <BookOpen className="h-4 w-4 mr-1" />
                          Check Out
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/staff/patrons/${patron.id}`}>
                            Full Record
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <PatronPhotoUpload
                  open={photoUploadOpen}
                  onOpenChange={setPhotoUploadOpen}
                  patronId={patron.id}
                  patronName={`${patron.firstName} ${patron.lastName}`.trim() || patron.barcode}
                  currentPhotoUrl={patronPhotoUrl}
                  onPhotoUploaded={(url) => setPatronPhotoUrl(url)}
                />

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className={`h-4 w-4 ${overdueCount > 0 ? "text-red-500" : "text-blue-500"}`} />
                      <div>
                        <div className="text-lg font-semibold">{checkouts.length}</div>
                        <div className="text-xs text-muted-foreground">Checkouts</div>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2">
                      <Bookmark className="h-4 w-4 text-amber-500" />
                      <div>
                        <div className="text-lg font-semibold">{holds.length}</div>
                        <div className="text-xs text-muted-foreground">Holds</div>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className={`h-4 w-4 ${totalOwed > 0 ? "text-red-500" : "text-green-500"}`} />
                      <div>
                        <div className="text-lg font-semibold">{formatCurrency(totalOwed)}</div>
                        <div className="text-xs text-muted-foreground">Owed</div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Checkouts Preview */}
                {checkouts.length > 0 && (
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Recent Checkouts</span>
                        <Link href={`/staff/patrons/${patron.id}?tab=activity`} className="text-xs text-primary hover:underline">
                          View all <ArrowRight className="h-3 w-3 inline" />
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-0 px-4 pb-3">
                      <div className="space-y-2">
                        {checkouts.map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-sm">
                            <span className="truncate flex-1">{c.title}</span>
                            <span className={`text-xs ${c.overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                              {c.overdue ? "OVERDUE" : formatDate(c.dueDate)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Holds Preview */}
                {holds.length > 0 && (
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Active Holds</span>
                        <Link href={`/staff/patrons/${patron.id}?tab=activity`} className="text-xs text-primary hover:underline">
                          View all <ArrowRight className="h-3 w-3 inline" />
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-0 px-4 pb-3">
                      <div className="space-y-2">
                        {holds.map((h) => (
                          <div key={h.id} className="flex items-center justify-between text-sm">
                            <span className="truncate flex-1">{h.title}</span>
                            <Badge variant="outline" className="text-xs">{h.status}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Bills Preview */}
                {bills.length > 0 && (
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Outstanding Bills</span>
                        <Link
                          href={`/staff/circulation/bills?patron=${encodeURIComponent(patron.barcode)}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Pay bills <ArrowRight className="h-3 w-3 inline" />
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-0 px-4 pb-3">
                      <div className="space-y-2">
                        {bills.map((b) => (
                          <div key={b.id} className="flex items-center justify-between text-sm">
                            <span className="truncate flex-1">{b.title}</span>
                            <span className="text-red-600 font-medium">{formatCurrency(b.balance)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Quick Links */}
                <div className="pt-2">
                  <h4 className="text-sm font-medium mb-2">Quick Actions</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/staff/circulation/checkout?patron=${encodeURIComponent(patron.barcode)}`}>
                        <BookOpen className="h-4 w-4 mr-1" /> Checkout
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/staff/circulation/checkin`}>
                        <Package className="h-4 w-4 mr-1" /> Checkin
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/staff/circulation/bills?patron=${encodeURIComponent(patron.barcode)}`}>
                        <CreditCard className="h-4 w-4 mr-1" /> Bills
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/staff/circulation/holds-management?patron=${encodeURIComponent(patron.barcode)}`}>
                        <Bookmark className="h-4 w-4 mr-1" /> Holds
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-center py-8 text-muted-foreground">
                No patron selected
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
