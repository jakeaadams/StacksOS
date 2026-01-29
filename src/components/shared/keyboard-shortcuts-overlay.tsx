/**
 * Keyboard Shortcuts Overlay - Press ? to show all shortcuts
 * World-class UX: discoverable keyboard navigation
 */

"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface ShortcutCategory {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Open universal search" },
      { keys: ["⌘", "1"], description: "Go to Dashboard" },
      { keys: ["G", "C"], description: "Go to Circulation" },
      { keys: ["G", "P"], description: "Go to Patrons" },
      { keys: ["G", "T"], description: "Go to Catalog" },
      { keys: ["Esc"], description: "Close dialog / panel" },
    ],
  },
  {
    title: "Circulation",
    shortcuts: [
      { keys: ["F1"], description: "Checkout mode" },
      { keys: ["F2"], description: "Checkin mode" },
      { keys: ["F3"], description: "Search patrons" },
      { keys: ["F4"], description: "New patron" },
      { keys: ["F5"], description: "Search catalog" },
      { keys: ["F8"], description: "Reprint last receipt" },
      { keys: ["F9"], description: "Print slip" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["⌘", "S"], description: "Save" },
      { keys: ["⌘", "⇧", "S"], description: "Save and create new" },
      { keys: ["⌘", "Enter"], description: "Submit form" },
      { keys: ["⌘", "P"], description: "Print" },
      { keys: ["⌘", "Z"], description: "Undo" },
    ],
  },
  {
    title: "Tables",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Navigate rows" },
      { keys: ["Space"], description: "Select / deselect row" },
      { keys: ["⌘", "A"], description: "Select all" },
      { keys: ["Enter"], description: "Open selected item" },
      { keys: ["Delete"], description: "Delete selected" },
    ],
  },
];

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show overlay on ? key (shift + /)
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        // Don't trigger if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setOpen(true);
      }

      // Close on Escape
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Keyboard Shortcuts
            <Badge variant="secondary" className="font-mono text-xs">
              Press ? anytime
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {SHORTCUTS.map((category) => (
            <div key={category.title}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                {category.title}
              </h3>
              <div className="space-y-2">
                {category.shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <kbd
                          key={keyIdx}
                          className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium bg-muted border border-border rounded shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t text-center text-xs text-muted-foreground">
          Tip: Most shortcuts work globally. Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to close dialogs.
        </div>
      </DialogContent>
    </Dialog>
  );
}
