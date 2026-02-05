"use client";
import { fetchWithAuth } from "@/lib/client-fetch";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageContainer, PageHeader, PageContent, EmptyState, ErrorMessage } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Server, Search, Plus, RefreshCw, Mail, CheckCircle, XCircle, Clock, ArrowDownToLine, ArrowUpFromLine, Loader2, Settings, Trash2, TestTube, FileText, AlertCircle } from "lucide-react";

interface EDIAccount { id: number; label: string; host: string; username: string; vendorId: number; lastActivity?: string; inDirectory?: string; outDirectory?: string; useHttp?: boolean; path?: string; }
interface EDIMessage { id: number; accountId: number; messageType: string; direction: "inbound" | "outbound"; status: "pending" | "processed" | "error" | "cancelled"; content?: string; error?: string; purchaseOrderId?: number; invoiceId?: number; createTime: string; processTime?: string; }
interface EDIMessageType { code: string; number: string; description: string; direction: string; }
interface Vendor { id: number; name: string; }

export default function EDIPage() {
  const [accounts, setAccounts] = useState<EDIAccount[]>([]);
  const [messages, setMessages] = useState<EDIMessage[]>([]);
  const [messageTypes, setMessageTypes] = useState<EDIMessageType[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<EDIAccount | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<EDIMessage | null>(null);
  const [filterMessageType, setFilterMessageType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Partial<EDIAccount> | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { void loadData(); }, []);

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      const [accountsRes, messagesRes, typesRes, vendorsRes] = await Promise.all([
        fetchWithAuth("/api/evergreen/acquisitions/edi?action=accounts"),
        fetchWithAuth("/api/evergreen/acquisitions/edi?action=messages&limit=200"),
        fetchWithAuth("/api/evergreen/acquisitions/edi?action=message_types"),
        fetchWithAuth("/api/evergreen/acquisitions/vendors"),
      ]);
      const [accountsJson, messagesJson, typesJson, vendorsJson] = await Promise.all([accountsRes.json(), messagesRes.json(), typesRes.json(), vendorsRes.json()]);
      if (accountsJson.ok) setAccounts(accountsJson.accounts || []);
      if (messagesJson.ok) setMessages(messagesJson.messages || []);
      if (typesJson.ok) setMessageTypes(typesJson.types || []);
      if (vendorsJson.ok) setVendors(vendorsJson.vendors || []);
    } catch { setError("Failed to load EDI data"); } finally { setLoading(false); }
  };

  const vendorMap = useMemo(() => { const map = new Map<number, Vendor>(); vendors.forEach(v => map.set(v.id, v)); return map; }, [vendors]);
  const getVendorName = (id: number) => vendorMap.get(id)?.name || "Vendor " + id;
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = { pending: "bg-yellow-100 text-yellow-800", processed: "bg-green-100 text-green-800", error: "bg-red-100 text-red-800", cancelled: "bg-muted/50" };
    const icons: Record<string, React.ReactNode> = { pending: <Clock className="h-3 w-3" />, processed: <CheckCircle className="h-3 w-3" />, error: <XCircle className="h-3 w-3" />, cancelled: <XCircle className="h-3 w-3" /> };
    return <Badge className={(styles[status] || "bg-muted/50") + " flex items-center gap-1"}>{icons[status]}{status}</Badge>;
  };
  const getDirectionIcon = (dir: string) => dir === "inbound" ? <ArrowDownToLine className="h-4 w-4 text-blue-600" /> : <ArrowUpFromLine className="h-4 w-4 text-green-600" />;

  const handleSaveAccount = async () => {
    if (!editingAccount) return;
    setActionLoading(true);
    try {
      const action = editingAccount.id ? "update_account" : "create_account";
      const res = await fetchWithAuth("/api/evergreen/acquisitions/edi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...editingAccount }) });
      const data = await res.json();
      if (data.ok) { setShowAccountDialog(false); setEditingAccount(null); await loadData(); } else { alert(data.error || "Failed"); }
    } catch { alert("Failed"); } finally { setActionLoading(false); }
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return;
    setActionLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/edi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_account", id: selectedAccount.id }) });
      if ((await res.json()).ok) { setShowDeleteDialog(false); setSelectedAccount(null); await loadData(); }
    } catch { alert("Failed"); } finally { setActionLoading(false); }
  };

  const handleTestConnection = async (accountId: number) => {
    setActionLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/edi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test_connection", accountId }) });
      alert((await res.json()).ok ? "Connection successful!" : "Connection failed");
    } catch { alert("Failed"); } finally { setActionLoading(false); }
  };

  const handleProcessInbound = async (accountId: number) => {
    setActionLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/edi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "process_inbound", accountId }) });
      const data = await res.json();
      if (data.ok) { alert(data.message || "Processed"); await loadData(); }
    } catch { alert("Failed"); } finally { setActionLoading(false); }
  };

  const handleRetryMessage = async (messageId: number) => {
    setActionLoading(true);
    try {
      const res = await fetchWithAuth("/api/evergreen/acquisitions/edi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry_message", messageId }) });
      if ((await res.json()).ok) { alert("Queued for retry"); await loadData(); }
    } catch { alert("Failed"); } finally { setActionLoading(false); }
  };

  const filteredMessages = useMemo(() => {
    let filtered = messages;
    if (filterMessageType !== "all") filtered = filtered.filter(m => m.messageType === filterMessageType);
    if (filterStatus !== "all") filtered = filtered.filter(m => m.status === filterStatus);
    if (selectedAccount) filtered = filtered.filter(m => m.accountId === selectedAccount.id);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); filtered = filtered.filter(m => String(m.id).includes(q) || m.messageType.toLowerCase().includes(q)); }
    return filtered;
  }, [messages, filterMessageType, filterStatus, selectedAccount, searchQuery]);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <PageContainer>
      <PageHeader title="EDI Integration" subtitle="Manage Electronic Data Interchange accounts and messages." breadcrumbs={[{ label: "Acquisitions", href: "/staff/acquisitions" }, { label: "EDI" }]} actions={[{ label: "Add Account", onClick: () => { setEditingAccount({}); setShowAccountDialog(true); }, icon: Plus }]} />
      <PageContent className="p-0">
        <div className="h-full flex flex-col -m-6">
          <div className="bg-muted/50 border-b px-4 py-2 flex items-center gap-2">
            <Button onClick={() => { setEditingAccount({}); setShowAccountDialog(true); }} size="sm"><Plus className="h-4 w-4 mr-1" />Add Account</Button>
            <Button onClick={() => loadData()} size="sm" variant="outline" disabled={actionLoading}><RefreshCw className={"h-4 w-4 mr-1 " + (actionLoading ? "animate-spin" : "")} />Refresh</Button>
            <div className="flex-1" />
            <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 w-64 h-8" /></div>
            <Button asChild size="sm" variant="outline"><Link href="/staff/acquisitions">Back</Link></Button>
          </div>
          {error && <div className="p-4"><ErrorMessage message={error} onRetry={() => void loadData()} /></div>}
          <div className="flex-1 p-4 overflow-auto">
            <Tabs defaultValue="accounts" className="h-full flex flex-col">
              <TabsList>
                <TabsTrigger value="accounts"><Server className="h-4 w-4 mr-2" />EDI Accounts ({accounts.length})</TabsTrigger>
                <TabsTrigger value="messages"><Mail className="h-4 w-4 mr-2" />Messages ({messages.length})</TabsTrigger>
                <TabsTrigger value="types"><FileText className="h-4 w-4 mr-2" />Message Types</TabsTrigger>
              </TabsList>
              <TabsContent value="accounts" className="flex-1 mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card className="lg:col-span-2">
                    <CardHeader className="py-3"><CardTitle className="text-base"><Server className="h-4 w-4 inline mr-2" />EDI Accounts</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      {accounts.length === 0 ? <div className="p-8"><EmptyState icon={Server} title="No EDI accounts" description="Configure EDI accounts to exchange data with vendors." action={{ label: "Add Account", onClick: () => { setEditingAccount({}); setShowAccountDialog(true); }, icon: Plus }} /></div> :
                        <Table><TableHeader><TableRow><TableHead>Account / Host</TableHead><TableHead>Vendor</TableHead><TableHead>Last Activity</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                          <TableBody>{accounts.map(a => (<TableRow key={a.id} className={"cursor-pointer " + (selectedAccount?.id === a.id ? "bg-muted" : "hover:bg-muted/50")} onClick={() => setSelectedAccount(a)}><TableCell><div className="font-medium">{a.label}</div><div className="text-sm text-muted-foreground">{a.host}</div></TableCell><TableCell>{getVendorName(a.vendorId)}</TableCell><TableCell>{a.lastActivity ? new Date(a.lastActivity).toLocaleDateString() : "-"}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleTestConnection(a.id); }}><TestTube className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingAccount(a); setShowAccountDialog(true); }}><Settings className="h-4 w-4" /></Button></TableCell></TableRow>))}</TableBody></Table>}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="py-3"><CardTitle className="text-base">Account Details</CardTitle></CardHeader>
                    <CardContent>{selectedAccount ? <div className="space-y-4"><div><h3 className="font-medium text-lg">{selectedAccount.label}</h3><Badge variant="outline">ID: {selectedAccount.id}</Badge></div><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Host:</span><span className="font-mono">{selectedAccount.host}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Vendor:</span><span>{getVendorName(selectedAccount.vendorId)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Protocol:</span><span>{selectedAccount.useHttp ? "HTTP" : "FTP/SFTP"}</span></div></div><div className="pt-4 border-t flex flex-col gap-2"><Button size="sm" onClick={() => handleProcessInbound(selectedAccount.id)} disabled={actionLoading}><ArrowDownToLine className="h-4 w-4 mr-1" />Process Inbound</Button><Button size="sm" variant="outline" onClick={() => { setEditingAccount(selectedAccount); setShowAccountDialog(true); }}><Settings className="h-4 w-4 mr-1" />Edit</Button><Button size="sm" variant="destructive" onClick={() => setShowDeleteDialog(true)}><Trash2 className="h-4 w-4 mr-1" />Delete</Button></div></div> : <div className="h-48 flex items-center justify-center text-muted-foreground">Select an account</div>}</CardContent>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="messages" className="flex-1 mt-4">
                <Card className="h-full">
                  <CardHeader className="py-3"><div className="flex items-center justify-between"><CardTitle className="text-base"><Mail className="h-4 w-4 inline mr-2" />Message Queue</CardTitle><div className="flex gap-2"><Select value={filterMessageType} onValueChange={setFilterMessageType}><SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{messageTypes.map(t => <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>)}</SelectContent></Select><Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="processed">Processed</SelectItem><SelectItem value="error">Error</SelectItem></SelectContent></Select></div></div></CardHeader>
                  <CardContent className="p-0">{filteredMessages.length === 0 ? <div className="p-8"><EmptyState icon={Mail} title="No messages" description="No EDI messages match your filters." /></div> : <Table><TableHeader><TableRow><TableHead></TableHead><TableHead>ID / Type</TableHead><TableHead>Account</TableHead><TableHead>Reference</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{filteredMessages.map(m => (<TableRow key={m.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedMessage(m); setShowMessageDialog(true); }}><TableCell>{getDirectionIcon(m.direction)}</TableCell><TableCell><div className="font-mono">{m.id}</div><div className="text-sm text-muted-foreground">{m.messageType}</div></TableCell><TableCell>{accounts.find(a => a.id === m.accountId)?.label || "Account " + m.accountId}</TableCell><TableCell>{m.purchaseOrderId && <span>PO: {m.purchaseOrderId}</span>}{m.invoiceId && <span>Inv: {m.invoiceId}</span>}</TableCell><TableCell>{new Date(m.createTime).toLocaleDateString()}</TableCell><TableCell>{getStatusBadge(m.status)}</TableCell><TableCell>{m.status === "error" && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleRetryMessage(m.id); }}><RefreshCw className="h-4 w-4" /></Button>}</TableCell></TableRow>))}</TableBody></Table>}</CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="types" className="flex-1 mt-4"><Card><CardHeader className="py-3"><CardTitle className="text-base">EDI Message Types</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Number</TableHead><TableHead>Description</TableHead><TableHead>Direction</TableHead></TableRow></TableHeader><TableBody>{messageTypes.map(t => <TableRow key={t.code}><TableCell className="font-mono font-medium">{t.code}</TableCell><TableCell className="font-mono">{t.number}</TableCell><TableCell>{t.description}</TableCell><TableCell><div className="flex items-center gap-2">{getDirectionIcon(t.direction)}<span className="capitalize">{t.direction}</span></div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
            </Tabs>
          </div>
          <div className="bg-muted/50 border-t px-4 py-1 text-xs text-muted-foreground flex items-center gap-4"><span>Accounts: {accounts.length}</span><span>Messages: {messages.length}</span><span>Pending: {messages.filter(m => m.status === "pending").length}</span><span>Errors: {messages.filter(m => m.status === "error").length}</span><div className="flex-1" /><span>EDI Integration</span></div>
        </div>
      </PageContent>
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editingAccount?.id ? "Edit EDI Account" : "Add EDI Account"}</DialogTitle><DialogDescription>Configure connection settings for EDI data exchange.</DialogDescription></DialogHeader><div className="grid gap-4 py-4"><div><Label>Account Label</Label><Input value={editingAccount?.label || ""} onChange={e => setEditingAccount(p => ({ ...p, label: e.target.value }))} placeholder="e.g., Baker and Taylor EDI" /></div><div><Label>Host</Label><Input value={editingAccount?.host || ""} onChange={e => setEditingAccount(p => ({ ...p, host: e.target.value }))} placeholder="e.g., ftp.vendor.com" /></div><div className="grid grid-cols-2 gap-4"><div><Label>Username</Label><Input value={editingAccount?.username || ""} onChange={e => setEditingAccount(p => ({ ...p, username: e.target.value }))} /></div><div><Label>Password</Label><Input type="password" placeholder={editingAccount?.id ? "(unchanged)" : ""} onChange={e => setEditingAccount(p => ({ ...p, password: e.target.value }))} /></div></div><div><Label>Vendor</Label><Select value={String(editingAccount?.vendorId || "")} onValueChange={v => setEditingAccount(p => ({ ...p, vendorId: parseInt(v) }))}><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent>{vendors.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-4"><div><Label>Inbound Dir</Label><Input value={editingAccount?.inDirectory || ""} onChange={e => setEditingAccount(p => ({ ...p, inDirectory: e.target.value }))} placeholder="/incoming" /></div><div><Label>Outbound Dir</Label><Input value={editingAccount?.outDirectory || ""} onChange={e => setEditingAccount(p => ({ ...p, outDirectory: e.target.value }))} placeholder="/outgoing" /></div></div></div><DialogFooter><Button variant="outline" onClick={() => { setShowAccountDialog(false); setEditingAccount(null); }}>Cancel</Button><Button onClick={handleSaveAccount} disabled={actionLoading}>{actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingAccount?.id ? "Save" : "Create"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}><DialogContent className="max-w-2xl max-h-[80vh] overflow-auto"><DialogHeader><DialogTitle>EDI Message Details</DialogTitle></DialogHeader>{selectedMessage && <div className="space-y-4"><div className="grid grid-cols-2 gap-4 text-sm"><div><span className="text-muted-foreground">ID:</span><span className="ml-2 font-mono">{selectedMessage.id}</span></div><div><span className="text-muted-foreground">Type:</span><span className="ml-2 font-mono">{selectedMessage.messageType}</span></div><div><span className="text-muted-foreground">Direction:</span><span className="ml-2 capitalize">{selectedMessage.direction}</span></div><div><span className="text-muted-foreground">Status:</span><span className="ml-2">{getStatusBadge(selectedMessage.status)}</span></div><div><span className="text-muted-foreground">Created:</span><span className="ml-2">{new Date(selectedMessage.createTime).toLocaleString()}</span></div>{selectedMessage.processTime && <div><span className="text-muted-foreground">Processed:</span><span className="ml-2">{new Date(selectedMessage.processTime).toLocaleString()}</span></div>}</div>{selectedMessage.error && <div className="p-3 bg-red-50 border border-red-200 rounded-md"><div className="flex items-center gap-2 text-red-800 font-medium"><AlertCircle className="h-4 w-4" />Error</div><pre className="mt-2 text-sm text-red-700 whitespace-pre-wrap">{selectedMessage.error}</pre></div>}{selectedMessage.content && <div><Label>Content</Label><pre className="mt-2 p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto max-h-64">{selectedMessage.content}</pre></div>}</div>}<DialogFooter>{selectedMessage?.status === "error" && <Button variant="outline" onClick={() => { handleRetryMessage(selectedMessage.id); setShowMessageDialog(false); }}><RefreshCw className="h-4 w-4 mr-2" />Retry</Button>}<Button onClick={() => setShowMessageDialog(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}><DialogContent><DialogHeader><DialogTitle>Delete EDI Account</DialogTitle><DialogDescription>Are you sure? This cannot be undone.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button><Button variant="destructive" onClick={handleDeleteAccount} disabled={actionLoading}>{actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete</Button></DialogFooter></DialogContent></Dialog>
    </PageContainer>
  );
}
