"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/use-patron-session";
import { CreditCard, CheckCircle, Loader2, ArrowLeft, Calendar, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Button } from "@/components/ui/button";

export default function FinesPage() {
  const t = useTranslations("finesPage");
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading, fines, fetchFines } = usePatronSession();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedFines, setSelectedFines] = useState<number[]>([]);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/fines");
    }
  }, [sessionLoading, isLoggedIn, router]);

  useEffect(() => {
    if (isLoggedIn) {
      setIsLoading(true);
      fetchFines().finally(() => setIsLoading(false));
    }
  }, [fetchFines, isLoggedIn]);

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  const unpaidFines = fines.filter((f) => !f.isPaid);
  const paidFines = fines.filter((f) => f.isPaid);
  const totalBalance = unpaidFines.reduce((sum, f) => sum + f.amount, 0);
  const selectedTotal = unpaidFines
    .filter((f) => selectedFines.includes(f.id))
    .reduce((sum, f) => sum + f.amount, 0);

  const toggleFine = (id: number) => {
    setSelectedFines((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (selectedFines.length === unpaidFines.length) {
      setSelectedFines([]);
    } else {
      setSelectedFines(unpaidFines.map((f) => f.id));
    }
  };

  const handlePayment = async () => {
    if (isProcessingPayment || selectedFines.length === 0) return;
    setIsProcessingPayment(true);
    try {
      await fetchWithAuth("/api/opac/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: selectedTotal,
          fineIds: selectedFines,
          description: "Fine payment",
        }),
      });
      toast.success(t("paymentSuccessToast"));
      setSelectedFines([]);
      await fetchFines();
    } catch (_error) {
      toast.error(t("paymentErrorToast"));
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <Link
          href="/opac/account"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToAccount")}
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        </div>

        {/* Balance summary */}
        <div
          className={`rounded-xl p-6 mb-6 ${
            totalBalance > 0
              ? "bg-amber-50 border border-amber-200"
              : "bg-green-50 border border-green-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("currentBalance")}</p>
              <p
                className={`text-4xl font-bold ${totalBalance > 0 ? "text-amber-700" : "text-green-700"}`}
              >
                ${totalBalance.toFixed(2)}
              </p>
            </div>
            {totalBalance > 0 && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-2">
                  {selectedFines.length > 0
                    ? t("selectedCount", {
                        count: selectedFines.length,
                        amount: selectedTotal.toFixed(2),
                      })
                    : t("selectItemsToPay")}
                </p>
                <Button
                  type="button"
                  disabled={selectedFines.length === 0 || isProcessingPayment}
                  onClick={handlePayment}
                  className="px-6 py-3 font-medium flex items-center gap-2"
                >
                  {isProcessingPayment ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CreditCard className="h-5 w-5" />
                  )}
                  {isProcessingPayment
                    ? t("processing")
                    : selectedFines.length > 0
                      ? t("payAmount", { amount: selectedTotal.toFixed(2) })
                      : t("payNow")}
                </Button>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : fines.length === 0 ? (
          <div className="stx-surface rounded-xl p-12 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">{t("noFinesTitle")}</h2>
            <p className="text-muted-foreground">{t("noFinesDescription")}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unpaid fines */}
            {unpaidFines.length > 0 && (
              <div className="stx-surface rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="font-semibold text-foreground">
                    {t("outstandingCount", { count: unpaidFines.length })}
                  </h2>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {selectedFines.length === unpaidFines.length
                      ? t("deselectAll")
                      : t("selectAll")}
                  </button>
                </div>
                <div className="divide-y divide-border/50">
                  {unpaidFines.map((fine) => (
                    <div
                      key={fine.id}
                      className={`px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30
                               ${selectedFines.includes(fine.id) ? "bg-primary-50" : ""}`}
                      onClick={() => toggleFine(fine.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFines.includes(fine.id)}
                        onChange={() => {}}
                        className="h-5 w-5 rounded border-border text-primary-600 
                                 focus:ring-primary-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{fine.type}</p>
                        {fine.title && (
                          <p className="text-sm text-muted-foreground truncate">{fine.title}</p>
                        )}
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="h-4 w-4" />
                          {fine.dateBilled}
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-amber-700">
                        ${fine.amount.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paid fines history */}
            {paidFines.length > 0 && (
              <div className="stx-surface rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-muted-foreground/70" />
                    {t("paymentHistoryCount", { count: paidFines.length })}
                  </h2>
                </div>
                <div className="divide-y divide-border/50">
                  {paidFines.map((fine) => (
                    <div key={fine.id} className="px-6 py-4 flex items-center gap-4">
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground/80">{fine.type}</p>
                        {fine.title && (
                          <p className="text-sm text-muted-foreground truncate">{fine.title}</p>
                        )}
                        <p className="text-sm text-muted-foreground/70">{fine.dateBilled}</p>
                      </div>
                      <p className="text-muted-foreground line-through">
                        ${fine.amount.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Payment info */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="font-semibold text-blue-900 mb-2">{t("paymentOptions")}</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>{`• ${t("payOnlineCard")}`}</li>
            <li>{`• ${t("payInPerson")}`}</li>
            <li>{`• ${t("paymentMethodsAccepted")}`}</li>
          </ul>
          <p className="text-sm text-blue-700 mt-3">
            {t("contactQuestion")}{" "}
            <a href="tel:555-123-4567" className="underline">
              555-123-4567
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
