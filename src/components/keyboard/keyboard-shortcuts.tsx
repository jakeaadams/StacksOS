"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string; action?: () => void }[];
}

interface KeyboardContextType {
  showHelp: () => void;
  hideHelp: () => void;
  registerShortcut: (key: string, callback: () => void) => void;
  unregisterShortcut: (key: string) => void;
}

const KeyboardContext = createContext<KeyboardContextType | null>(null);

export function useKeyboard() {
  const context = useContext(KeyboardContext);
  if (!context) {
    throw new Error("useKeyboard must be used within KeyboardProvider");
  }
  return context;
}

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, () => void>>({});

  const shortcuts: ShortcutGroup[] = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: ["F1"], description: "Go to Checkout" },
        { keys: ["F2"], description: "Go to Checkin" },
        { keys: ["F3"], description: "Go to Patron Search" },
        { keys: ["F4"], description: "Register New Patron" },
        { keys: ["F5"], description: "Go to Catalog Search" },
        { keys: ["Cmd", "Shift", "H"], description: "Go to Dashboard" },
        { keys: ["Cmd", "K"], description: "Open Command Palette" },
      ],
    },
    {
      title: "Actions",
      shortcuts: [
        { keys: ["Enter"], description: "Submit / Confirm" },
        { keys: ["Escape"], description: "Cancel / Close / Clear" },
        { keys: ["Cmd", "S"], description: "Save" },
        { keys: ["Cmd", "P"], description: "Print" },
        { keys: ["Cmd", "N"], description: "New Record" },
      ],
    },
    {
      title: "Interface",
      shortcuts: [
        { keys: ["Cmd", "B"], description: "Toggle Sidebar" },
        { keys: ["Cmd", "/"], description: "Show Keyboard Shortcuts" },
        { keys: ["Tab"], description: "Next Field" },
        { keys: ["Shift", "Tab"], description: "Previous Field" },
        { keys: ["Cmd", "Q"], description: "Sign Out" },
      ],
    },
    {
      title: "Data Entry",
      shortcuts: [
        { keys: ["Ctrl", "Space"], description: "Auto-complete" },
        { keys: ["Cmd", "Z"], description: "Undo" },
        { keys: ["Cmd", "Shift", "Z"], description: "Redo" },
        { keys: ["Cmd", "A"], description: "Select All" },
      ],
    },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const cmdKey = isMac ? e.metaKey : e.ctrlKey;
    
    // Help dialog
    if (e.key === "/" && cmdKey) {
      e.preventDefault();
      setHelpOpen(true);
      return;
    }
    
    // Close help with Escape
    if (e.key === "Escape" && helpOpen) {
      setHelpOpen(false);
      return;
    }

    // Function keys - navigation
    if (e.key === "F1" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      router.push("/staff/circulation/checkout");
      return;
    }
    if (e.key === "F2" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      router.push("/staff/circulation/checkin");
      return;
    }
    if (e.key === "F3" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      router.push("/staff/patrons");
      return;
    }
    if (e.key === "F4" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      router.push("/staff/patrons/register");
      return;
    }
    if (e.key === "F5" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      router.push("/staff/catalog");
      return;
    }

    // Cmd+Shift+H - Home/Dashboard
    if (e.key === "h" && cmdKey && e.shiftKey) {
      e.preventDefault();
      router.push("/staff");
      return;
    }

    // Check custom shortcuts
    const shortcutKey = `${cmdKey ? "cmd+" : ""}${e.shiftKey ? "shift+" : ""}${e.altKey ? "alt+" : ""}${e.key.toLowerCase()}`;
    if (customShortcuts[shortcutKey]) {
      e.preventDefault();
      customShortcuts[shortcutKey]();
    }
  }, [router, helpOpen, customShortcuts]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const registerShortcut = useCallback((key: string, callback: () => void) => {
    setCustomShortcuts(prev => ({ ...prev, [key]: callback }));
  }, []);

  const unregisterShortcut = useCallback((key: string) => {
    setCustomShortcuts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return (
    <KeyboardContext.Provider value={{ 
      showHelp: () => setHelpOpen(true), 
      hideHelp: () => setHelpOpen(false),
      registerShortcut,
      unregisterShortcut,
    }}>
      {children}
      
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Keyboard Shortcuts
              <Badge variant="outline" className="text-xs">Press Escape to close</Badge>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {shortcuts.map((group) => (
                <div key={group.title}>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{group.title}</h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut, i) => (
                      <div key={`shortcut-${i}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span className="text-sm text-slate-600 dark:text-slate-400">{shortcut.description}</span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, j) => (
                            <span key={j}>
                              <kbd className="px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">{key}</kbd>
                              {j < shortcut.keys.length - 1 && <span className="text-slate-400 mx-1">+</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </KeyboardContext.Provider>
  );
}
