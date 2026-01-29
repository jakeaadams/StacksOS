"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState } from "react";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tag, Search, Loader2 } from "lucide-react";
import Link from "next/link";


interface AuthorityRecord {
  id: string | number;
  heading: string;
  type: string;
  linkedBibs: number;
}

export default function AuthorityControlPage() {
  const [authorities, setAuthorities] = useState<AuthorityRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedAuthority, setSelectedAuthority] = useState<AuthorityRecord | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setSetupMessage(null);
    setHasSearched(true);

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        type: searchType,
        limit: "50",
      });

      const response = await fetchWithAuth(`/api/evergreen/authority?${params}`);
      const data = await response.json();

      if (data.ok) {
        setAuthorities(data.authorities || []);
        setSetupMessage(data.message || null);
      } else {
        setError(data.error || "Search failed");
        setAuthorities([]);
      }
    } catch (_error) {
      setError("Failed to connect to authority service");
      setAuthorities([]);
    } finally {
      setLoading(false);
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      personal: "bg-blue-100 text-blue-800",
      corporate: "bg-purple-100 text-purple-800",
      geographic: "bg-green-100 text-green-800",
      topical: "bg-yellow-100 text-yellow-800",
      genre: "bg-pink-100 text-pink-800",
      main: "bg-muted/50 text-foreground",
    };
    return <Badge className={colors[type] || "bg-muted/50 text-foreground"}>{type}</Badge>;
  };

  return (
    <PageContainer>
      <PageHeader
        title="Authority Control"
        subtitle="Search and manage authority records and headings."
        breadcrumbs={[{ label: "Cataloging", href: "/staff/cataloging" }, { label: "Authority" }]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
      <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
        <div className="flex-1" />
        <Button asChild size="sm" variant="outline"><Link href="/staff/cataloging">Back to Cataloging</Link></Button>
      </div>

      <div className="bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Select value={searchType} onValueChange={setSearchType}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="personal">Personal Names</SelectItem>
              <SelectItem value="corporate">Corporate Names</SelectItem>
              <SelectItem value="geographic">Geographic</SelectItem>
              <SelectItem value="topical">Topical</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search authority headings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="pl-14 h-9"
            />
          </div>
          <Button size="sm" onClick={handleSearch} disabled={loading || !searchQuery.trim()}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
            Search
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {error && (
          <div className="p-4 text-center text-red-600">{error}</div>
        )}

        {!hasSearched && !loading && (
          <div className="p-8 text-center text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Enter a search term to find authority records</p>
          </div>
        )}

        {hasSearched && !loading && authorities.length === 0 && !error && (
          <div className="p-8 text-center text-muted-foreground space-y-3">
            <p>{setupMessage || "No authority records found matching your search"}</p>
            {setupMessage && (
              <Button asChild size="sm" variant="outline">
                <Link href="/staff/help#evergreen-setup">Evergreen setup checklist</Link>
              </Button>
            )}
          </div>
        )}

        {authorities.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">ID</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead>Heading</TableHead>
                <TableHead className="w-20">Bibs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {authorities.map((auth) => (
                <TableRow
                  key={auth.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => { setSelectedAuthority(auth); setDetailsOpen(true); }}
                >
                  <TableCell className="font-mono text-sm">{auth.id}</TableCell>
                  <TableCell>{getTypeBadge(auth.type)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{auth.heading}</div>
                  </TableCell>
                  <TableCell className="text-center">{auth.linkedBibs}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
        <span>{hasSearched ? `Found: ${authorities.length} authorities` : "Ready"}</span>
        <div className="flex-1" />
        <span>Authority Control</span>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />Authority Record
            </DialogTitle>
          </DialogHeader>
          {selectedAuthority && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getTypeBadge(selectedAuthority.type)}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Heading</label>
                <div className="text-lg font-medium">{selectedAuthority.heading}</div>
              </div>
              <div className="flex items-center gap-4 text-sm border-t pt-4">
                <div>
                  <span className="text-muted-foreground">ID:</span>{" "}
                  <span className="font-mono">{selectedAuthority.id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Linked Bibs:</span>{" "}
                  <span className="font-medium">{selectedAuthority.linkedBibs}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
      </PageContent>
    </PageContainer>
  );
}
