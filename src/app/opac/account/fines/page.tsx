"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/usePatronSession";
import {
  CreditCard,
  CheckCircle,
  Loader2,
  ArrowLeft,
  Calendar,
  Receipt,
} from "lucide-react";

export default function FinesPage() {
  const router = useRouter();
  const { 
    isLoggedIn, 
    isLoading: sessionLoading,
    fines,
    fetchFines,
  } = usePatronSession();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedFines, setSelectedFines] = useState<number[]>([]);

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
  }, [isLoggedIn]);

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  const unpaidFines = fines.filter(f => !f.isPaid);
  const paidFines = fines.filter(f => f.isPaid);
  const totalBalance = unpaidFines.reduce((sum, f) => sum + f.amount, 0);
  const selectedTotal = unpaidFines
    .filter(f => selectedFines.includes(f.id))
    .reduce((sum, f) => sum + f.amount, 0);

  const toggleFine = (id: number) => {
    setSelectedFines(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedFines.length === unpaidFines.length) {
      setSelectedFines([]);
    } else {
      setSelectedFines(unpaidFines.map(f => f.id));
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
          Back to Account
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Fines & Fees</h1>
        </div>

        {/* Balance summary */}
        <div className={`rounded-xl p-6 mb-6 ${totalBalance > 0 
          ? "bg-amber-50 border border-amber-200" 
          : "bg-green-50 border border-green-200"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
              <p className={`text-4xl font-bold ${totalBalance > 0 ? "text-amber-700" : "text-green-700"}`}>
                ${totalBalance.toFixed(2)}
              </p>
            </div>
            {totalBalance > 0 && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-2">
                  {selectedFines.length > 0 
                    ? `${selectedFines.length} selected: $${selectedTotal.toFixed(2)}`
                    : "Select items to pay"
                  }
                </p>
                <button type="button"
                  disabled={selectedFines.length === 0}
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium
                           hover:bg-primary-700 transition-colors disabled:opacity-50 
                           disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CreditCard className="h-5 w-5" />
                  Pay {selectedFines.length > 0 ? `$${selectedTotal.toFixed(2)}` : "Now"}
                </button>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : fines.length === 0 ? (
          <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No fines</h2>
            <p className="text-muted-foreground">Your account is in good standing.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unpaid fines */}
            {unpaidFines.length > 0 && (
              <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="font-semibold text-foreground">
                    Outstanding ({unpaidFines.length})
                  </h2>
                  <button type="button"
                    onClick={selectAll}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {selectedFines.length === unpaidFines.length ? "Deselect All" : "Select All"}
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
              <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-muted-foreground/70" />
                    Payment History ({paidFines.length})
                  </h2>
                </div>
                <div className="divide-y divide-border/50">
                  {paidFines.map((fine) => (
                    <div 
                      key={fine.id}
                      className="px-6 py-4 flex items-center gap-4"
                    >
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
          <h3 className="font-semibold text-blue-900 mb-2">Payment Options</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Pay online with credit/debit card</li>
            <li>• Pay in person at any library location</li>
            <li>• Cash, check, or card accepted in person</li>
          </ul>
          <p className="text-sm text-blue-700 mt-3">
            Questions about your fines? Contact us at{" "}
            <a href="tel:555-123-4567" className="underline">555-123-4567</a>
          </p>
        </div>
      </div>
    </div>
  );
}
