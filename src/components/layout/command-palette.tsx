"use client";
import { DEBOUNCE_DELAY_MS } from "@/lib/constants";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clientLogger } from "@/lib/client-logger";
import {
  searchStaffCatalog,
  searchStaffItemsByBarcode,
  searchStaffPatrons,
  type StaffCatalogSearchResult as CatalogResult,
  type StaffItemSearchResult as ItemResult,
  type StaffPatronSearchResult as PatronResult,
} from "@/lib/search/staff-search";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeftRight,
  Package,
  Users,
  Search,
  BarChart3,
  UserPlus,
  FileText,
  Bookmark,
  CreditCard,
  Clock,
  Tag,
  Globe,
  WifiOff,
  Library,
  BookOpen,
  Hash,
  Loader2,
  ChevronRight,
  ShoppingCart,
  Receipt,
  AlertCircle,
  Edit3,
  Share2,
  KeyRound,
  Building,
  Database,
  Sliders,
  Moon,
  Sun,
  ScanBarcode,
  Keyboard,
  FolderOpen,
  Truck,
} from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResults {
  patrons: PatronResult[];
  catalog: CatalogResult[];
  items: ItemResult[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function getInitials(firstName?: string, lastName?: string): string {
  const f = firstName?.charAt(0) || "";
  const l = lastName?.charAt(0) || "";
  return (f + l).toUpperCase() || "?";
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResults>({ patrons: [], catalog: [], items: [] });
  const debouncedQuery = useDebounce(searchQuery, DEBOUNCE_DELAY_MS);
  const { theme, setTheme } = useTheme();

  const runCommand = useCallback(
    (command: () => void) => {
      onOpenChange(false);
      command();
    },
    [onOpenChange]
  );

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setResults({ patrons: [], catalog: [], items: [] });
      setIsSearching(false);
    }
  }, [open]);

  useEffect(() => {
    const query = debouncedQuery.trim();

    if (query.length < 2) {
      setResults({ patrons: [], catalog: [], items: [] });
      setIsSearching(false);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);

      try {
        const [patrons, catalog, items] = await Promise.all([
          searchStaffPatrons(query, "name", 5),
          searchStaffCatalog(query, "keyword", 5),
          searchStaffItemsByBarcode(query, 3),
        ]);
        setResults({ patrons, catalog, items });
      } catch (error) {
        clientLogger.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    };

    void performSearch();
  }, [debouncedQuery]);

  const hasResults =
    results.patrons.length > 0 || results.catalog.length > 0 || results.items.length > 0;
  const showNavigation = searchQuery.length < 2;

  const getStatusColor = (statusId: number) => {
    switch (statusId) {
      case 0:
        return "text-green-600 bg-green-50";
      case 1:
        return "text-blue-600 bg-blue-50";
      case 6:
        return "text-amber-600 bg-amber-50";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-2xl"
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search patrons, catalog, items..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList className="max-h-[480px]">
        {isSearching && (
          <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Searching...</span>
          </div>
        )}

        {!isSearching && searchQuery.length >= 2 && !hasResults && (
          <CommandEmpty>
            <div className="py-6 text-center">
              <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{`No results found for "${searchQuery}"`}</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
            </div>
          </CommandEmpty>
        )}

        {!isSearching && hasResults && (
          <>
            {results.patrons.length > 0 && (
              <CommandGroup heading="Patrons">
                {results.patrons.map((patron) => (
                  <CommandItem
                    key={"patron-" + patron.id}
                    onSelect={() => runCommand(() => router.push("/staff/patrons/" + patron.id))}
                    className="flex items-center gap-3"
                  >
                    {/* Patron avatar */}
                    {patron.photoUrl ? (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-muted">
                        <Image
                          src={patron.photoUrl}
                          alt={`${patron.firstName} ${patron.lastName}`.trim() || "Patron photo"}
                          width={32}
                          height={32}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-medium">
                        {getInitials(patron.firstName, patron.lastName)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {patron.lastName}, {patron.firstName}
                        </span>
                        {patron.barred && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Barred
                          </Badge>
                        )}
                        {!patron.active && !patron.barred && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="font-mono">{patron.barcode}</span>
                        {patron.email && (
                          <>
                            <span>•</span>
                            <span className="truncate">{patron.email}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CommandItem>
                ))}
                <CommandItem
                  onSelect={() =>
                    runCommand(() =>
                      router.push("/staff/patrons?q=" + encodeURIComponent(searchQuery))
                    )
                  }
                  className="text-primary"
                >
                  <Search className="h-4 w-4 mr-2" />
                  <span>See all patron results</span>
                  <ChevronRight className="h-4 w-4 ml-auto" />
                </CommandItem>
              </CommandGroup>
            )}

            {results.patrons.length > 0 &&
              (results.catalog.length > 0 || results.items.length > 0) && <CommandSeparator />}

            {results.catalog.length > 0 && (
              <CommandGroup heading="Catalog">
                {results.catalog.map((record) => (
                  <CommandItem
                    key={"catalog-" + record.id}
                    onSelect={() =>
                      runCommand(() => router.push("/staff/catalog/record/" + record.id))
                    }
                    className="flex items-center gap-3"
                  >
                    {/* Book cover thumbnail */}
                    {record.coverUrl ? (
                      <div className="flex-shrink-0 w-8 h-11 rounded overflow-hidden bg-muted">
                        <Image
                          src={record.coverUrl}
                          alt={`Cover of ${record.title}`}
                          width={32}
                          height={44}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-8 h-11 rounded bg-sky-100 text-sky-600 flex items-center justify-center">
                        <BookOpen className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{record.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {record.author && <span className="truncate">{record.author}</span>}
                        {record.pubdate && (
                          <>
                            {record.author && <span>•</span>}
                            <span>{record.pubdate}</span>
                          </>
                        )}
                        {record.format && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {record.format}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CommandItem>
                ))}
                <CommandItem
                  onSelect={() =>
                    runCommand(() =>
                      router.push("/staff/catalog?q=" + encodeURIComponent(searchQuery))
                    )
                  }
                  className="text-primary"
                >
                  <Search className="h-4 w-4 mr-2" />
                  <span>See all catalog results</span>
                  <ChevronRight className="h-4 w-4 ml-auto" />
                </CommandItem>
              </CommandGroup>
            )}

            {results.catalog.length > 0 && results.items.length > 0 && <CommandSeparator />}

            {results.items.length > 0 && (
              <CommandGroup heading="Items">
                {results.items.map((item) => (
                  <CommandItem
                    key={"item-" + item.id}
                    onSelect={() =>
                      runCommand(() =>
                        router.push("/staff/catalog/item-status?barcode=" + item.barcode)
                      )
                    }
                    className="flex items-center gap-3"
                  >
                    <Hash className="h-4 w-4 text-amber-600" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="font-mono">{item.barcode}</span>
                        <span>•</span>
                        <span>{item.location}</span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={"text-[10px] px-1.5 py-0 " + getStatusColor(item.statusId)}
                    >
                      {item.status}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {showNavigation && !isSearching && (
          <>
            <CommandGroup heading="Quick Actions">
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/circulation"))}>
                <ArrowLeftRight className="mr-2 h-4 w-4 text-[hsl(var(--brand-1))]" />
                <span>Circulation Desk</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/circulation/checkout"))}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4 text-[hsl(var(--brand-1))]" />
                <span>Check Out Items</span>
                <CommandShortcut>F1</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/circulation/checkin"))}
              >
                <Package className="mr-2 h-4 w-4 text-[hsl(var(--brand-3))]" />
                <span>Check In Items</span>
                <CommandShortcut>F2</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/patrons"))}>
                <Users className="mr-2 h-4 w-4 text-emerald-600" />
                <span>Search Patrons</span>
                <CommandShortcut>F3</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/patrons/register"))}
              >
                <UserPlus className="mr-2 h-4 w-4 text-amber-600" />
                <span>Register New Patron</span>
                <CommandShortcut>F4</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/catalog"))}>
                <Search className="mr-2 h-4 w-4 text-sky-600" />
                <span>Search Catalog</span>
                <CommandShortcut>F5</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onOpenChange(false);
                  setTimeout(() => {
                    const el =
                      (document.querySelector("[data-barcode-input]") as HTMLInputElement) ||
                      (document.querySelector('input[name="barcode"]') as HTMLInputElement);
                    if (el) {
                      el.focus();
                      el.select();
                    }
                  }, 100);
                }}
              >
                <ScanBarcode className="mr-2 h-4 w-4 text-indigo-600" />
                <span>Scan Barcode</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                  onOpenChange(false);
                }}
              >
                {theme === "dark" ? (
                  <Sun className="mr-2 h-4 w-4 text-amber-500" />
                ) : (
                  <Moon className="mr-2 h-4 w-4 text-indigo-500" />
                )}
                <span>Toggle Dark Mode</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  onOpenChange(false);
                  setTimeout(() => {
                    document.dispatchEvent(
                      new KeyboardEvent("keydown", { key: "/", metaKey: true, bubbles: true })
                    );
                  }, 100);
                }}
              >
                <Keyboard className="mr-2 h-4 w-4 text-slate-500" />
                <span>View Keyboard Shortcuts</span>
                <CommandShortcut>{"\u2318/"}</CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Circulation">
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/circulation/renew"))}
              >
                <Clock className="mr-2 h-4 w-4" />
                <span>Renew Items</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(() => router.push("/staff/circulation/holds-management"))
                }
              >
                <Bookmark className="mr-2 h-4 w-4" />
                <span>Manage Holds</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/circulation/transits"))}
              >
                <Truck className="mr-2 h-4 w-4" />
                <span>Transits</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/circulation/in-house"))}
              >
                <Library className="mr-2 h-4 w-4" />
                <span>In-House Use</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/circulation/bills"))}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                <span>Bills & Payments</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/circulation/offline"))}
              >
                <WifiOff className="mr-2 h-4 w-4" />
                <span>Offline Mode</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Cataloging">
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/catalog"))}>
                <Search className="mr-2 h-4 w-4" />
                <span>Search Catalog</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/cataloging/marc-editor"))}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                <span>MARC Editor</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/catalog/create"))}>
                <FileText className="mr-2 h-4 w-4" />
                <span>Create New Record</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/cataloging/z3950"))}
              >
                <Globe className="mr-2 h-4 w-4" />
                <span>Import Records (Z39.50)</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/cataloging/authority"))}
              >
                <Share2 className="mr-2 h-4 w-4" />
                <span>Authorities</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/catalog/item-status"))}
              >
                <Tag className="mr-2 h-4 w-4" />
                <span>Item Status</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Patrons">
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/patrons"))}>
                <Search className="mr-2 h-4 w-4" />
                <span>Search Patrons</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/patrons/register"))}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                <span>Register Patron</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/patrons/groups"))}>
                <Users className="mr-2 h-4 w-4" />
                <span>Patron Groups</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Acquisitions">
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/acquisitions/orders"))}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                <span>Purchase Orders</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/acquisitions/invoices"))}
              >
                <Receipt className="mr-2 h-4 w-4" />
                <span>Invoices</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/acquisitions/claims"))}
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                <span>Claims</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/acquisitions/funds"))}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                <span>Funds</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Admin">
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/admin/settings"))}>
                <Sliders className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/admin/users"))}>
                <Users className="mr-2 h-4 w-4" />
                <span>Users</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/admin"))}>
                <Building className="mr-2 h-4 w-4" />
                <span>Locations</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/admin/permissions"))}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                <span>Permissions</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/admin/policy-inspector"))}
              >
                <Database className="mr-2 h-4 w-4" />
                <span>Org Units</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Reports">
              <CommandItem onSelect={() => runCommand(() => router.push("/staff/reports"))}>
                <BarChart3 className="mr-2 h-4 w-4" />
                <span>Run Reports</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/reports/my-reports"))}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                <span>Saved Reports</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/staff/reports/templates"))}
              >
                <FileText className="mr-2 h-4 w-4" />
                <span>Report Templates</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
