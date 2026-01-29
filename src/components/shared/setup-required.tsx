"use client";

import { AlertTriangle, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SetupRequiredProps {
  module: string;
  description: string;
  setupSteps?: string[];
  docsUrl?: string;
  adminUrl?: string;
}

/**
 * Setup Required Component
 * Displays when a module is not configured in Evergreen
 * Provides guidance on how to configure the module
 */
export function SetupRequired({
  module,
  description,
  setupSteps = [],
  docsUrl,
  adminUrl,
}: SetupRequiredProps) {
  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-lg">Setup Required</CardTitle>
            <CardDescription>{module} needs to be configured</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>

        {setupSteps.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">To enable this feature:</p>
            <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
              {setupSteps.map((step, i) => (
                <li key={`step-${i}`}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {adminUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={adminUrl}>
                <Settings className="mr-2 h-4 w-4" />
                Open Admin Settings
              </a>
            </Button>
          )}
          {docsUrl && (
            <Button variant="ghost" size="sm" asChild>
              <a href={docsUrl} target="_blank" rel="noopener noreferrer">
                View Documentation
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Pre-configured setup messages for common modules
export const SETUP_CONFIGS = {
  acquisitions: {
    module: "Acquisitions",
    description: "No purchase orders, funds, or vendors have been configured in Evergreen.",
    setupSteps: [
      "Create at least one fund in Evergreen Admin → Acquisitions → Fund Administration",
      "Add vendors in Evergreen Admin → Acquisitions → Provider Search",
      "Create selection lists or purchase orders",
    ],
  },
  serials: {
    module: "Serials",
    description: "No serial subscriptions have been configured in Evergreen.",
    setupSteps: [
      "Create a serial subscription in Evergreen → Serials → Manage Subscriptions",
      "Configure distribution and routing lists",
      "Set up expected issuance patterns",
    ],
  },
  booking: {
    module: "Booking / Reservations",
    description: "No bookable resources have been configured in Evergreen.",
    setupSteps: [
      "Create resource types in Evergreen Admin → Booking → Resource Types",
      "Add individual resources to each type",
      "Configure booking rules and availability",
    ],
  },
  authority: {
    module: "Authority Records",
    description: "Authority search requires Z39.50 targets to be configured.",
    setupSteps: [
      "Configure Z39.50 targets in Evergreen Admin → Server → Z39.50 Servers",
      "Ensure authority sources are properly linked",
    ],
  },
  z3950: {
    module: "Z39.50 Import",
    description: "No Z39.50 targets have been configured for catalog import.",
    setupSteps: [
      "Add Z39.50 server targets in Evergreen Admin → Server → Z39.50 Servers",
      "Common targets: Library of Congress, OCLC WorldCat",
      "Test connection to verify credentials",
    ],
  },
  staffPicks: {
    module: "Staff Picks",
    description: "No staff picks have been configured.",
    setupSteps: [
      "Create a public bookbag in Evergreen with \"Staff Pick\" in the name",
      "Add bibliographic records to the bookbag",
      "The OPAC will automatically display items from these bookbags",
    ],
  },
  holds: {
    module: "Holds",
    description: "No holds are currently in the system.",
    setupSteps: [
      "Patrons can place holds through the OPAC",
      "Staff can place holds on behalf of patrons",
      "Configure hold policies in Evergreen Admin → Local Admin → Hold Policies",
    ],
  },
};
