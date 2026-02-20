"use client";

import { useLibrary } from "@/hooks/use-library";

export function HelpContactPhone() {
  const { currentLocation } = useLibrary();
  return (
    <a href="tel:555-1234" className="text-primary-600 hover:underline">
      {currentLocation?.phone || "(555) 123-4567"}
    </a>
  );
}
