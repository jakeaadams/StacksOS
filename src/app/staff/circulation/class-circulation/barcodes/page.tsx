"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageContent, PageHeader } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/client-fetch";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

type ClassOverview = {
  id: number;
  name: string;
  teacherName: string;
};

type BarcodeCard = {
  studentId: number;
  firstName: string;
  lastName: string;
  studentIdentifier: string | null;
  className: string;
  teacherName: string;
};

export default function BarcodesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOverview[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [cards, setCards] = useState<BarcodeCard[]>([]);
  const [className, setClassName] = useState("");

  async function loadClasses() {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/staff/k12/class-circulation", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true)
        throw new Error(json.error || `HTTP ${response.status}`);
      setClasses(Array.isArray(json.classes) ? json.classes : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load classes: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  const loadBarcodes = useCallback(async (classId: number) => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/api/staff/k12/barcodes?classId=${classId}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true)
        throw new Error(json.error || `HTTP ${response.status}`);
      setCards(Array.isArray(json.cards) ? json.cards : []);
      setClassName(typeof json.className === "string" ? json.className : "");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load barcode data: ${message}`);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      void loadBarcodes(selectedClassId);
    } else {
      setCards([]);
      setClassName("");
    }
  }, [selectedClassId, loadBarcodes]);

  function onPrint() {
    window.print();
  }

  return (
    <PageContainer>
      <PageHeader
        title="Barcode Cards"
        subtitle="Print barcode cards for students in a class."
        breadcrumbs={[
          { label: "Circulation" },
          { label: "Class Circulation", href: "/staff/circulation/class-circulation" },
          { label: "Barcode Cards" },
        ]}
        actions={[
          {
            label: "Back to Class Circulation",
            onClick: () => router.push("/staff/circulation/class-circulation"),
            icon: ArrowLeft,
            variant: "outline" as const,
          },
        ]}
      />

      <PageContent className="space-y-6">
        {/* Class selector - hidden during print */}
        <div className="print:hidden">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Class</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Select
                value={selectedClassId ? String(selectedClassId) : "__none__"}
                onValueChange={(v) => setSelectedClassId(v === "__none__" ? null : Number(v))}
              >
                <SelectTrigger className="h-10 max-w-sm">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a class</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} - {c.teacherName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cards.length > 0 ? (
                <Button onClick={onPrint} variant="outline">
                  <Printer className="mr-2 h-4 w-4" />
                  Print Cards
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {loading && selectedClassId ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 print:hidden">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading barcode data...
          </div>
        ) : cards.length === 0 && selectedClassId ? (
          <p className="text-sm text-muted-foreground print:hidden">
            No students found in this class.
          </p>
        ) : !selectedClassId ? (
          <p className="text-sm text-muted-foreground print:hidden">
            Select a class to generate barcode cards.
          </p>
        ) : null}

        {/* Printable barcode cards - 8-up layout */}
        {cards.length > 0 ? (
          <div className="barcode-sheet grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2 print:p-0">
            {cards.map((card) => (
              <div
                key={card.studentId}
                className="barcode-card rounded border p-3 text-center break-inside-avoid print:border-black print:border print:p-2"
              >
                <p className="text-xs text-muted-foreground print:text-black">{card.className}</p>
                <p className="text-sm font-semibold mt-1">
                  {card.firstName} {card.lastName}
                </p>
                <div className="mt-2 font-mono text-lg tracking-widest border-t pt-2">
                  {card.studentIdentifier || `S${String(card.studentId).padStart(6, "0")}`}
                </div>
                <p className="text-xs text-muted-foreground mt-1 print:text-black">
                  {card.teacherName}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </PageContent>
    </PageContainer>
  );
}
