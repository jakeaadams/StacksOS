"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState } from "react";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {

  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Edit,
  Copy,
  Upload,
  Globe,
  Tag,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface BibRecord {
  id: string | number;
  tcn: string;
  title: string;
  author: string;
  isbn: string;
  pubdate: string;
  publisher: string;
  edition: string;
  physical_description: string;
}

export default function CatalogingPage() {
  const [records, setRecords] = useState<BibRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("keyword");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    setHasSearched(true);
    
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        type: searchType,
        limit: "50",
      });
      
      const response = await fetchWithAuth(`/api/evergreen/catalog?${params}`);
      const data = await response.json();
      
      if (data.ok) {
        setRecords(data.records || []);
        setTotalCount(data.count || 0);
      } else {
        setError(data.error || "Search failed");
        setRecords([]);
      }
    } catch (_error) {
      setError("Failed to connect to catalog service");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Cataloging"
        subtitle="Search, edit, and manage bibliographic records."
        breadcrumbs={[{ label: "Cataloging" }]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
      <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
        <Button asChild size="sm">
          <Link href="/staff/cataloging/marc-editor">
            <Plus className="h-4 w-4 mr-1" />New Record
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/staff/cataloging/z3950">
            <Globe className="h-4 w-4 mr-1" />Z39.50 Search
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/staff/cataloging/import">
            <Upload className="h-4 w-4 mr-1" />Import
          </Link>
        </Button>
        <div className="border-l h-6 mx-2" />
        <Button asChild size="sm" variant="outline">
          <Link href="/staff/cataloging/authority">
            <Tag className="h-4 w-4 mr-1" />Authority Control
          </Link>
        </Button>
        <div className="flex-1" />
      </div>

      <div className="bg-background border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Select value={searchType} onValueChange={setSearchType}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">Keyword</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="author">Author</SelectItem>
              <SelectItem value="subject">Subject</SelectItem>
              <SelectItem value="isbn">ISBN</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search catalog records..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
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
          <div className="p-4 text-center text-red-600">
            {error}
          </div>
        )}
        
        {!hasSearched && !loading && (
          <div className="p-8 text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Enter a search term to find catalog records</p>
          </div>
        )}
        
        {hasSearched && !loading && records.length === 0 && !error && (
          <div className="p-8 text-center text-muted-foreground">
            <p>No records found matching your search</p>
          </div>
        )}
        
        {records.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">ID</TableHead>
                <TableHead>Title / Author</TableHead>
                <TableHead className="w-36">ISBN</TableHead>
                <TableHead className="w-24">Year</TableHead>
                <TableHead>Publisher</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-mono text-sm">{record.id}</TableCell>
                  <TableCell>
                    <Link href={`/staff/cataloging/marc-editor?id=${record.id}`} className="hover:underline">
                      <div className="font-medium text-blue-600">{record.title}</div>
                    </Link>
                    <div className="text-sm text-muted-foreground">{record.author}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{record.isbn || "-"}</TableCell>
                  <TableCell className="text-sm">{record.pubdate || "-"}</TableCell>
                  <TableCell className="text-sm">{record.publisher || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit">
                        <Link href={`/staff/cataloging/marc-editor?id=${record.id}`}>
                          <Edit className="h-3 w-3" />
                          <span className="sr-only">Edit</span>
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="Holdings">
                        <Link href={`/staff/cataloging/holdings?id=${record.id}`}>
                          <Copy className="h-3 w-3" />
                          <span className="sr-only">Holdings</span>
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
        <span>
          {hasSearched ? `Found: ${totalCount} records` : "Ready"}
          {records.length > 0 && records.length < totalCount && ` (showing ${records.length})`}
        </span>
        <div className="flex-1" />
        <span>Cataloging Module</span>
      </div>
    </div>
      </PageContent>
    </PageContainer>
  );
}
