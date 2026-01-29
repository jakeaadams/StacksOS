"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect } from "react";
import { PageContainer, PageHeader, PageContent } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building, Search, Phone, Mail, Globe, Loader2 } from "lucide-react";
import Link from "next/link";


interface Vendor {
  id: string | number;
  name: string;
  code: string;
  email: string;
  phone: string;
  fax: string;
  url: string;
  address: string;
  currency: string;
  active: boolean;
  contacts: any[];
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    setLoading(true);
    setError(null);
    setSetupMessage(null);

    try {
      const response = await fetchWithAuth("/api/evergreen/acquisitions?action=vendors");
      const data = await response.json();

      if (data.ok) {
        setVendors(data.vendors || []);
        setSetupMessage(data.message || null);
      } else {
        setError(data.error || "Failed to load vendors");
      }
    } catch (_error) {
      setError("Failed to connect to acquisitions service");
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Vendors"
        subtitle="Manage acquisition vendors and supplier contacts."
        breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "Vendors" }]}
      />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
      <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 w-64 h-8"
          />
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/staff/acquisitions">Back</Link>
        </Button>
      </div>

      {error && (
        <div className="p-4 text-center text-red-600">{error}</div>
      )}

      <div className="flex-1 p-4 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="h-4 w-4" />
                Vendors ({filteredVendors.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredVendors.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{vendors.length === 0 ? (setupMessage || "No vendors configured") : "No vendors match your search"}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor / Code</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-24">Currency</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVendors.map((vendor) => (
                      <TableRow
                        key={vendor.id}
                        className={`cursor-pointer ${selectedVendor && selectedVendor.id === vendor.id ? "bg-muted" : "hover:bg-muted/50"}`}
                        onClick={() => setSelectedVendor(vendor)}
                      >
                        <TableCell>
                          <div className="font-medium">{vendor.name}</div>
                          <div className="text-sm text-muted-foreground font-mono">{vendor.code}</div>
                        </TableCell>
                        <TableCell>{vendor.email || "-"}</TableCell>
                        <TableCell>{vendor.currency}</TableCell>
                        <TableCell>
                          <Badge className={vendor.active ? "bg-green-100 text-green-800" : "bg-muted/50 text-foreground"}>
                            {vendor.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Vendor Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {selectedVendor ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-lg">{selectedVendor.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{selectedVendor.code}</Badge>
                      <Badge className={selectedVendor.active ? "bg-green-100 text-green-800" : "bg-muted/50 text-foreground"}>
                        {selectedVendor.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {selectedVendor.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a href={`mailto:${selectedVendor.email}`} className="text-blue-600 hover:underline">
                          {selectedVendor.email}
                        </a>
                      </div>
                    )}
                    {selectedVendor.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedVendor.phone}</span>
                      </div>
                    )}
                    {selectedVendor.url && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a href={selectedVendor.url.startsWith("http") ? selectedVendor.url : `https://${selectedVendor.url}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {selectedVendor.url}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ID:</span>
                      <span className="font-mono">{selectedVendor.id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Currency:</span>
                      <span>{selectedVendor.currency}</span>
                    </div>
                  </div>

                  {selectedVendor.contacts && selectedVendor.contacts.length > 0 && (
                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-medium mb-2">Contacts</h4>
                      <div className="space-y-2 text-sm">
                        {selectedVendor.contacts.map((contact: any, idx: number) => (
                          <div key={idx} className="p-2 bg-muted/50 rounded">
                            <div className="font-medium">{contact.name}</div>
                            {contact.email && <div className="text-muted-foreground">{contact.email}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  Select a vendor to view details
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4">
        <span>Active: {vendors.filter(v => v.active).length}</span>
        <span>Total Vendors: {vendors.length}</span>
        <div className="flex-1" />
        <span>Vendor Management</span>
      </div>

    </div>
      </PageContent>
    </PageContainer>
  );
}
