/**
 * Density Toggle - Switch between compact/comfortable/spacious modes
 * World-class UX: User preference for information density
 */

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Rows3, LayoutGrid, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type DensityMode = "compact" | "comfortable" | "spacious";

const DENSITY_KEY = "stacksos_density";

const DENSITY_OPTIONS: { value: DensityMode; label: string; description: string; icon: typeof Rows3 }[] = [
  {
    value: "compact",
    label: "Compact",
    description: "More rows, less spacing",
    icon: Rows3,
  },
  {
    value: "comfortable",
    label: "Comfortable",
    description: "Balanced (default)",
    icon: LayoutGrid,
  },
  {
    value: "spacious",
    label: "Spacious",
    description: "Larger text, more breathing room",
    icon: Square,
  },
];

interface DensityToggleProps {
  className?: string;
}

export function DensityToggle({ className }: DensityToggleProps) {
  const [density, setDensity] = useState<DensityMode>("comfortable");

  // Load preference from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(DENSITY_KEY) as DensityMode | null;
    if (stored && ["compact", "comfortable", "spacious"].includes(stored)) {
      setDensity(stored);
      document.documentElement.setAttribute("data-density", stored);
    }
  }, []);

  // Apply density to document
  const handleChange = (value: DensityMode) => {
    setDensity(value);
    localStorage.setItem(DENSITY_KEY, value);
    document.documentElement.setAttribute("data-density", value);
  };

  const currentOption = DENSITY_OPTIONS.find((opt) => opt.value === density)!;
  const Icon = currentOption.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 w-8 p-0", className)}
          title={`Density: ${currentOption.label}`}
        >
          <Icon className="h-4 w-4" />
          <span className="sr-only">Toggle density</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Display Density</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={density} onValueChange={(v) => handleChange(v as DensityMode)}>
          {DENSITY_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="flex items-center gap-3 py-2"
            >
              <option.icon className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useDensity() {
  const [density, setDensity] = useState<DensityMode>("comfortable");

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const stored = localStorage.getItem(DENSITY_KEY) as DensityMode | null;
    if (stored) setDensity(stored);

    // Listen for changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "data-density") {
          const newDensity = document.documentElement.getAttribute("data-density") as DensityMode;
          if (newDensity) setDensity(newDensity);
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return density;
}

export type { DensityMode };
