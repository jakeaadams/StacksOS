"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, ArrowRight } from "lucide-react";

const WORKFLOWS = [
  {
    key: "checkout",
    title: "Checkout (P0)",
    description: "Scan-first checkout flow with policy blocks and override UX.",
    href: "/staff/circulation/checkout",
    steps: [
      "Scan or search a patron (barcode recommended).",
      "Scan items into the queue (keep scanning while requests are in-flight).",
      "If blocked, review the block details and only override when eligible.",
      "Print or save the receipt if needed.",
    ],
  },
  {
    key: "checkin",
    title: "Checkin (P0)",
    description: "Fast returns with routing decisions and slip printing.",
    href: "/staff/circulation/checkin",
    steps: [
      "Enable bookdrop mode for rapid scanning if needed.",
      "Scan returned items and confirm routing: reshelve / transit / hold shelf.",
      "Print slips when prompted.",
    ],
  },
  {
    key: "holds",
    title: "Holds shelf workflow (P0)",
    description: "Capture → print slip → shelf → clear shelf.",
    href: "/staff/circulation/holds-management",
    steps: [
      "Use Pull List to retrieve holds.",
      "Capture hold and print hold slip.",
      "Move item to Shelf List and clear when picked up/expired.",
    ],
  },
  {
    key: "bills",
    title: "Bills & payments (P0)",
    description: "Take payments and print receipts; refunds are permissioned and audited.",
    href: "/staff/circulation/bills",
    steps: [
      "Open a patron record and review bills.",
      "Post a payment and confirm Evergreen state is updated.",
      "Use refund workflow only with appropriate permissions.",
    ],
  },
];

export default function TrainingPage() {
  const searchParams = useSearchParams();
  const workflowParam = String(searchParams.get("workflow") || "").trim().toLowerCase();
  const workflowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedKey = useMemo(() => {
    const allowed = new Set(WORKFLOWS.map((w) => w.key));
    return allowed.has(workflowParam) ? workflowParam : "";
  }, [workflowParam]);

  useEffect(() => {
    if (!selectedKey) return;
    const el = workflowRefs.current[selectedKey];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedKey]);

  return (
    <PageContainer>
      <PageHeader
        title="Training"
        subtitle="Practical walkthroughs and checklists for core workflows"
        breadcrumbs={[{ label: "Training" }]}
      />
      <PageContent className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Getting started
            </CardTitle>
            <CardDescription>
              These walkthroughs are designed for pilots: they map to the P0 circulation desk workflows and are safe to run in the sandbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tip: when you see a requestId in an error dialog, include it in your support ticket for fast diagnosis.
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {WORKFLOWS.map((w) => (
            <div
              key={w.href}
              ref={(el) => {
                workflowRefs.current[w.key] = el;
              }}
            >
              <Card className={`rounded-2xl ${selectedKey === w.key ? "ring-2 ring-primary" : ""}`}>
              <CardHeader>
                <CardTitle className="text-base">{w.title}</CardTitle>
                <CardDescription>{w.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                  {w.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <Button asChild size="sm">
                  <Link href={w.href}>
                    Open workflow <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </PageContent>
    </PageContainer>
  );
}
