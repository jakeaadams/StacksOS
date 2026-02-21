"use client";

import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle,
  AlertTriangle,
  LogOut,
  Loader2,
  Scan,
  User,
  Volume2,
  VolumeX,
  RotateCcw,
  Printer,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface CheckedOutItem {
  id: number;
  title: string;
  author?: string;
  barcode: string;
  dueDate: string;
}

interface PatronInfo {
  id: number;
  name: string;
  barcode: string;
  checkoutsCount: number;
  holdsReady: number;
}

type KioskState = "idle" | "patron-login" | "ready" | "scanning" | "complete";

const IDLE_TIMEOUT = 60000; // 60 seconds of inactivity returns to idle

export default function SelfCheckoutPage() {
  const t = useTranslations("selfCheckout");
  const [state, setState] = useState<KioskState>("idle");
  const [patron, setPatron] = useState<PatronInfo | null>(null);
  const [checkedOutItems, setCheckedOutItems] = useState<CheckedOutItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Play audio feedback
  const playSound = useCallback((type: "success" | "error" | "welcome") => {
    if (!soundEnabled) return;
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === "success") {
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => oscillator.stop(), 150);
    } else if (type === "error") {
      oscillator.frequency.value = 220;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => {
        oscillator.frequency.value = 180;
        setTimeout(() => oscillator.stop(), 200);
      }, 200);
    } else if (type === "welcome") {
      oscillator.frequency.value = 523;
      gainNode.gain.value = 0.2;
      oscillator.start();
      setTimeout(() => {
        oscillator.frequency.value = 659;
        setTimeout(() => {
          oscillator.frequency.value = 784;
          setTimeout(() => oscillator.stop(), 100);
        }, 100);
      }, 100);
    }
  }, [soundEnabled]);

  // Reset idle timer
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    if (state !== "idle") {
      idleTimerRef.current = setTimeout(() => {
        handleLogout();
      }, IDLE_TIMEOUT);
    }
  }, [state]);

  // Focus barcode input when ready
  useEffect(() => {
    if ((state === "patron-login" || state === "ready") && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
    resetIdleTimer();
  }, [state, resetIdleTimer]);

  // Handle patron login
  const handlePatronLogin = async () => {
    if (!barcodeInput.trim()) return;
    
    setIsProcessing(true);
    setLastError(null);
    
	  try {
	    // In production, this would call the Evergreen API
	    // For now, simulate a successful login
	    const res = await fetchWithAuth("/api/opac/auth", {
	      method: "POST",
	      headers: { "Content-Type": "application/json" },
	      body: JSON.stringify({ barcode: barcodeInput, pin: pinInput }),
	    });
      
      const data = await res.json();
      
      if (data.ok && data.patron) {
        setPatron({
          id: data.patron.id,
          name: data.patron.name || data.patron.family_name + ", " + data.patron.first_given_name,
          barcode: barcodeInput,
          checkoutsCount: data.patron.checkouts_count || 0,
          holdsReady: data.patron.holds_ready || 0,
        });
        setState("ready");
        playSound("welcome");
        setBarcodeInput("");
        setPinInput("");
      } else {
        setLastError(data.error || "Invalid barcode or PIN");
        playSound("error");
      }
    } catch (error) {
      clientLogger.warn("Self-checkout login failed", { error });
      setLastError("Connection error. Please try again.");
      playSound("error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle item checkout
  const handleCheckout = async () => {
    if (!barcodeInput.trim() || !patron) return;
    
    setIsProcessing(true);
    setLastError(null);
    
	  try {
	    const res = await fetchWithAuth("/api/opac/self-checkout", {
	      method: "POST",
	      headers: { "Content-Type": "application/json" },
	      body: JSON.stringify({
	        itemBarcode: barcodeInput,
        }),
      });
      
      const data = await res.json();
      
      const checkout = data?.checkout;
      if (data.ok && checkout) {
        const newItem: CheckedOutItem = {
          id: checkout.circId || Date.now(),
          title: checkout.title || "Unknown Title",
          author: checkout.author,
          barcode: checkout.barcode || barcodeInput,
          dueDate: checkout.dueDate || new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        };
        setCheckedOutItems((prev) => [newItem, ...prev]);
        playSound("success");
        setBarcodeInput("");
        resetIdleTimer();
      } else {
        setLastError(data.error || "Could not check out item");
        playSound("error");
      }
    } catch (error) {
      clientLogger.warn("Self-checkout login failed", { error });
      setLastError("Connection error. Please try again.");
      playSound("error");
    } finally {
      setIsProcessing(false);
      barcodeInputRef.current?.focus();
    }
  };

  // Handle logout
  const handleLogout = () => {
    // Best-effort: terminate Evergreen session + clear httpOnly cookies.
    void fetchWithAuth("/api/opac/auth", { method: "DELETE" }).catch((error) => {
      clientLogger.warn("Self-checkout logout request failed", error);
    });

    setPatron(null);
    setCheckedOutItems([]);
    setBarcodeInput("");
    setPinInput("");
    setLastError(null);
    setState("idle");
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
  };

  // Print receipt
  const handlePrintReceipt = () => {
    window.print();
    toast.success("Receipt sent to printer");
  };

  // Finish session
  const handleFinish = () => {
    if (checkedOutItems.length > 0) {
      setState("complete");
    } else {
      handleLogout();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <BookOpen className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Self-Checkout</h1>
              <p className="text-primary-foreground/80 text-sm">Scan your items to check out</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-white/20"
              aria-label={soundEnabled ? "Mute sound" : "Enable sound"}
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            {patron && (
              <Button
                variant="secondary"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                End Session
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          
          {/* Idle State - Touch to Start */}
          {state === "idle" && (
            <div 
              className="h-[70vh] flex flex-col items-center justify-center cursor-pointer"
              onClick={() => setState("patron-login")}
            >
              <div className="text-center space-y-6 animate-pulse">
                <div className="h-32 w-32 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                  <Scan className="h-16 w-16 text-primary" />
                </div>
                <h2 className="text-4xl font-bold text-foreground">Touch to Begin</h2>
                <p className="text-xl text-muted-foreground">Scan your library card to start</p>
              </div>
            </div>
          )}

          {/* Patron Login */}
          {state === "patron-login" && (
            <Card className="max-w-md mx-auto mt-12">
              <CardHeader className="text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Scan Your Library Card</CardTitle>
                <CardDescription>Or enter your barcode and PIN</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Input
                    ref={barcodeInputRef}
                    placeholder="Library Card Barcode"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (pinInput ? handlePatronLogin() : document.getElementById("pin-input")?.focus())}
                    className="text-center text-lg h-14"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Input
                    id="pin-input"
                    type="password"
                    placeholder="PIN"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePatronLogin()}
                    className="text-center text-lg h-14"
                    autoComplete="off"
                  />
                </div>
                
                {lastError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-center">
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    {lastError}
                  </div>
                )}

                <Button 
                  className="w-full h-14 text-lg" 
                  onClick={handlePatronLogin}
                  disabled={isProcessing || !barcodeInput}
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5 mr-2" />
                      Continue
                    </>
                  )}
                </Button>

                <Button variant="ghost" className="w-full" onClick={handleLogout}>
                  Cancel
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Ready to Scan Items */}
          {state === "ready" && patron && (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Scan Area */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scan className="h-5 w-5" />
                    Scan Items
                  </CardTitle>
                  <CardDescription>
                    Place item barcode under scanner or type it below
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-8 bg-muted/50 rounded-xl border-2 border-dashed border-primary/30 text-center">
                    <Scan className="h-16 w-16 text-primary/50 mx-auto mb-4" />
                    <p className="text-muted-foreground">Scan item barcode here</p>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      ref={barcodeInputRef}
                      placeholder="Or type barcode..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCheckout()}
                      className="text-lg h-12"
                      autoComplete="off"
                    />
                    <Button 
                      className="h-12 px-6" 
                      onClick={handleCheckout}
                      disabled={isProcessing || !barcodeInput}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                    </Button>
                  </div>

                  {lastError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
                      <AlertTriangle className="h-4 w-4 inline mr-2" />
                      {lastError}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Session Info & Items */}
              <div className="space-y-6">
                {/* Patron Info */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{patron.name}</p>
                          <p className="text-sm text-muted-foreground font-mono">{patron.barcode}</p>
                        </div>
                      </div>
                      {patron.holdsReady > 0 && (
                        <Badge variant="secondary" className="text-amber-600">
                          {patron.holdsReady} holds ready
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Checked Out Items */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <span>Items This Session ({checkedOutItems.length})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {checkedOutItems.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        Scan items to check them out
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-auto">
                        {checkedOutItems.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{item.title}</p>
                              {item.author && (
                                <p className="text-sm text-muted-foreground truncate">{item.author}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-muted-foreground">Due</p>
                              <p className="text-sm font-medium">{item.dueDate}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handlePrintReceipt} disabled={checkedOutItems.length === 0}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Receipt
                  </Button>
                  <Button className="flex-1" onClick={handleFinish}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Finish
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Complete State */}
          {state === "complete" && (
            <Card className="max-w-md mx-auto mt-12 text-center">
              <CardContent className="pt-8 pb-8">
                <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold mb-2">All Done!</h2>
                <p className="text-muted-foreground mb-6">
                  You checked out {checkedOutItems.length} item{checkedOutItems.length !== 1 ? "s" : ""}
                </p>

                <div className="space-y-3">
                  <Button className="w-full" onClick={handlePrintReceipt}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Receipt
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handleLogout}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Start New Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-sm text-muted-foreground">
        <p>Need help? Ask a librarian or call the circulation desk.</p>
      </footer>
    </div>
  );
}
