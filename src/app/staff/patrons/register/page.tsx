"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {

  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  ErrorMessage,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { useApi } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";
interface PatronGroup {
  id: number;
  name: string;
}

interface DuplicatePatron {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
  email?: string;
}

interface GeneratedCredentials {
  barcode?: string;
  username?: string;
  password?: string;
}

export default function PatronRegisterPage() {
  const router = useRouter();
  const { orgs } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [barcode, setBarcode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState("");
  const [homeLibrary, setHomeLibrary] = useState(orgs[0]?.id?.toString() || "1");
  const [expireDate, setExpireDate] = useState("");
  const [street1, setStreet1] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePatron[]>([]);
  const [generated, setGenerated] = useState<GeneratedCredentials | null>(null);

  const { data: groupsData } = useApi<any>("/api/evergreen/patrons?action=groups", { immediate: true });

  const patronGroups: PatronGroup[] = useMemo(() => {
    const tree = groupsData?.groups || [];
    const result: PatronGroup[] = [];

    function walk(node: any) {
      if (!node) return;
      result.push({ id: node.id ?? node[0], name: node.name ?? node[2] ?? "Group" });
      const children = node.children || node[3] || [];
      if (Array.isArray(children)) children.forEach(walk);
    }

    if (Array.isArray(tree)) {
      tree.forEach(walk);
    } else if (tree) {
      walk(tree);
    }

    return result;
  }, [groupsData]);

  const duplicateColumns = useMemo<ColumnDef<DuplicatePatron>[]>(
    () => [
      {
        header: "Name",
        cell: ({ row }) => `${row.original.lastName}, ${row.original.firstName}`,
      },
      {
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
      },
    ],
    []
  );

  const checkDuplicates = async () => {
    if (!lastName.trim()) return;
    try {
      const res = await fetchWithAuth(`/api/evergreen/patrons?q=${encodeURIComponent(lastName.trim())}`);
      const data = await res.json();
      if (!res.ok || data.ok === false) return;
      const patrons = (data.patrons || []).map((p: any) => ({
        id: p.id,
        barcode: p.barcode,
        firstName: p.firstName || "",
        lastName: p.lastName || "",
        email: p.email || "",
      }));
      setDuplicates(patrons);
    } catch (_error) {
      setDuplicates([]);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setGenerated(null);

    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    if (!profile) {
      toast.error("Select a patron group");
      return;
    }
    if (!street1.trim() || !city.trim() || !zip.trim() || !country.trim()) {
      toast.error("Street, city, postal code, and country are required");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/patrons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          barcode: barcode.trim() || undefined,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
          profile,
          homeLibrary,
          expireDate,
          address: {
            street1,
            street2,
            city,
            state,
            zip,
            country,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Registration failed");
      }

      if (data.generated) {
        setGenerated(data.generated);
      }

      const createdBarcode = data?.patron?.barcode || barcode || data?.generated?.barcode || "";
      toast.success("Patron created", {
        description: createdBarcode ? `Barcode ${createdBarcode}` : `${firstName} ${lastName}`,
      });

      if (createdBarcode) {
        router.push(`/staff/patrons?q=${encodeURIComponent(createdBarcode)}&type=barcode`);
      }
    } catch (err: any) {
      setError(err?.message || "Registration failed");
      toast.error(err?.message || "Registration failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Register Patron"
        subtitle="Create a new patron account in Evergreen."
        breadcrumbs={[{ label: "Patrons", href: "/staff/patrons" }, { label: "Register" }]}
        actions={[
          {
            label: "Cancel",
            onClick: () => router.back(),
            icon: UserPlus,
            variant: "outline",
          },
        ]}
      />
      <PageContent>
        {error && (
          <div className="mb-4">
            <ErrorMessage message={error} onRetry={() => setError(null)} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
          <Card>
            <CardHeader>
              <CardTitle>Patron Details</CardTitle>
              <CardDescription>Required fields are marked with *</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} onBlur={checkDuplicates} />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={checkDuplicates} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Barcode (optional)</Label>
                <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Leave blank to auto-generate" />
              </div>
              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input type="date" value={expireDate} onChange={(e) => setExpireDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Patron Group *</Label>
                <Select value={profile} onValueChange={setProfile}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {patronGroups.map((group) => (
                      <SelectItem key={group.id} value={String(group.id)}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Home Library</Label>
                <Select value={homeLibrary} onValueChange={setHomeLibrary}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select library" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((org) => (
                      <SelectItem key={org.id} value={String(org.id)}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 border-t pt-4">
                <p className="text-sm font-medium">Credentials</p>
              </div>
              <div className="space-y-2">
                <Label>Username (optional)</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Leave blank to auto-generate" />
              </div>
              <div className="space-y-2">
                <Label>PIN / Password (optional)</Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to auto-generate" />
              </div>

              <div className="md:col-span-2 border-t pt-4">
                <p className="text-sm font-medium">Address</p>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Street *</Label>
                <Input value={street1} onChange={(e) => setStreet1(e.target.value)} />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Street 2</Label>
                <Input value={street2} onChange={(e) => setStreet2(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>City *</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Postal Code *</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Country *</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>

              <div className="md:col-span-2">
                <Button onClick={handleSubmit} disabled={isSaving}>
                  {isSaving ? "Creating..." : "Create Patron"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Possible Duplicates</CardTitle>
                <CardDescription>Based on last name search</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={duplicateColumns}
                  data={duplicates}
                  searchable={false}
                  paginated={false}
                  emptyState={<EmptyState title="No duplicates" description="No matching patrons found." />}
                />
              </CardContent>
            </Card>

            {generated && (
              <Card>
                <CardHeader>
                  <CardTitle>Generated Credentials</CardTitle>
                  <CardDescription>Save these for the patron record</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {generated.barcode && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Barcode</span>
                      <span className="font-mono">{generated.barcode}</span>
                    </div>
                  )}
                  {generated.username && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Username</span>
                      <span className="font-mono">{generated.username}</span>
                    </div>
                  )}
                  {generated.password && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">PIN</span>
                      <span className="font-mono">{generated.password}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
