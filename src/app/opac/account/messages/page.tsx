"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/usePatronSession";
import { fetchWithAuth } from "@/lib/client-fetch";
import { Mail, MailOpen, Trash2, ChevronLeft, Loader2, AlertCircle, CheckCircle, Clock, DollarSign, User, Bell, X, RefreshCw } from "lucide-react";

interface PatronMessage { id: number; title: string; content: string; sendingLibrary: string; sendingLibraryId: number; isRead: boolean; readDate: string | null; createDate: string; messageType: "general" | "holds" | "fines" | "account"; }

const msgIcons: Record<string, React.ElementType> = { general: Bell, holds: Clock, fines: DollarSign, account: User };
const msgColors: Record<string, string> = { general: "bg-blue-100 text-blue-600", holds: "bg-purple-100 text-purple-600", fines: "bg-amber-100 text-amber-600", account: "bg-green-100 text-green-600" };

export default function PatronMessagesPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading } = usePatronSession();
  const [messages, setMessages] = useState<PatronMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selMsg, setSelMsg] = useState<PatronMessage | null>(null);
  const [selIds, setSelIds] = useState<Set<number>>(new Set());
  const [actLoad, setActLoad] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");

  useEffect(() => { if (!sessionLoading && !isLoggedIn) { router.push("/opac/login?redirect=/opac/account/messages"); return; } if (isLoggedIn) fetchMsgs(); }, [isLoggedIn, sessionLoading, router]);

  const fetchMsgs = async () => { try { setIsLoading(true); setError(null); const r = await fetch("/api/opac/messages", { credentials: "include" }); if (!r.ok) { if (r.status === 401) { router.push("/opac/login?redirect=/opac/account/messages"); return; } throw new Error("Failed"); } const d = await r.json(); setMessages(d.messages || []); } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setIsLoading(false); } };

  const markRead = async (ids: number[]) => { setActLoad(true); try { const r = await fetchWithAuth("/api/opac/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_read", messageIds: ids }) }); if (r.ok) { setMessages(messages.map(m => ids.includes(m.id) ? { ...m, isRead: true } : m)); setSelIds(new Set()); } } catch { setError("Failed"); } finally { setActLoad(false); } };

  const deleteMsgs = async (ids: number[]) => { setActLoad(true); try { const r = await fetchWithAuth("/api/opac/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", messageIds: ids }) }); if (r.ok) { setMessages(messages.filter(m => !ids.includes(m.id))); setSelIds(new Set()); if (selMsg && ids.includes(selMsg.id)) setSelMsg(null); } } catch { setError("Failed"); } finally { setActLoad(false); } };

  const openMsg = async (m: PatronMessage) => { setSelMsg(m); if (!m.isRead) await markRead([m.id]); };
  const toggle = (id: number) => { const n = new Set(selIds); if (n.has(id)) n.delete(id); else n.add(id); setSelIds(n); };
  const fMsgs = messages.filter(m => { if (filter === "unread") return !m.isRead; if (filter === "read") return m.isRead; return true; });
  const unread = messages.filter(m => !m.isRead).length;

  if (sessionLoading || !isLoggedIn) return <div className="min-h-screen bg-muted/30 flex items-center justify-center"><Loader2 className="h-8 w-8 text-primary-600 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <Link href="/opac/account" className="inline-flex items-center gap-1 text-primary-600 hover:underline mb-4"><ChevronLeft className="h-4 w-4" />Back to Account</Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary-100 rounded-xl relative"><Mail className="h-6 w-6 text-primary-600" />{unread > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">{unread > 9 ? "9+" : unread}</span>}</div>
              <div><h1 className="text-2xl font-bold text-foreground">Messages</h1><p className="text-muted-foreground">{unread > 0 ? unread + " unread" : "All caught up!"}</p></div>
            </div>
            <button type="button" onClick={fetchMsgs} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 border border-border text-foreground/80 rounded-lg hover:bg-muted/30"><RefreshCw className={"h-4 w-4" + (isLoading ? " animate-spin" : "")} />Refresh</button>
          </div>
        </div>
        {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3"><AlertCircle className="h-5 w-5 text-red-600" /><p className="text-red-700">{error}</p><button type="button" onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4 text-red-600" /></button></div>}
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 text-primary-600 animate-spin" /></div> : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="p-4 border-b border-border space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {("all" + ",unread,read").split(",").map(f => <button key={f} type="button" onClick={() => setFilter(f as "all"|"unread"|"read")} className={"px-3 py-1 rounded-full text-sm font-medium transition-colors " + (filter === f ? "bg-primary-600 text-white" : "bg-muted/50 text-foreground/80 hover:bg-muted")}>{f === "all" ? "All (" + messages.length + ")" : f === "unread" ? "Unread (" + unread + ")" : "Read (" + (messages.length - unread) + ")"}</button>)}
                  </div>
                  {selIds.size > 0 && <div className="flex items-center gap-2 pt-2 border-t border-border"><span className="text-sm text-muted-foreground">{selIds.size} selected</span><button type="button" onClick={() => markRead(Array.from(selIds))} disabled={actLoad} className="px-2 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded">Mark read</button><button type="button" onClick={() => deleteMsgs(Array.from(selIds))} disabled={actLoad} className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded">Delete</button></div>}
                </div>
                <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                  {fMsgs.length > 0 ? fMsgs.map(m => { const I = msgIcons[m.messageType] || Bell; const c = msgColors[m.messageType] || "bg-gray-100 text-gray-600"; return (
                    <div key={m.id} className={"flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 " + (selMsg?.id === m.id ? "bg-primary-50 " : "") + (!m.isRead ? "bg-blue-50/50" : "")}>
                      <input type="checkbox" checked={selIds.has(m.id)} onChange={() => toggle(m.id)} className="mt-1 rounded border-border text-primary-600" onClick={e => e.stopPropagation()} />
                      <div className="flex-1 min-w-0" onClick={() => openMsg(m)}>
                        <div className="flex items-center gap-2 mb-1"><span className={"p-1 rounded " + c}><I className="h-3 w-3" /></span>{!m.isRead && <span className="w-2 h-2 bg-primary-600 rounded-full" />}<span className="text-xs text-muted-foreground">{new Date(m.createDate).toLocaleDateString()}</span></div>
                        <p className={"text-sm truncate " + (!m.isRead ? "font-semibold" : "")}>{m.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.sendingLibrary}</p>
                      </div>
                    </div>
                  ); }) : <div className="p-8 text-center"><MailOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" /><p className="text-muted-foreground">{filter === "unread" ? "No unread" : filter === "read" ? "No read" : "No messages"}</p></div>}
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              {selMsg ? (
                <div className="bg-white rounded-xl border border-border">
                  <div className="p-6 border-b border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">{(() => { const I = msgIcons[selMsg.messageType] || Bell; const c = msgColors[selMsg.messageType] || "bg-gray-100 text-gray-600"; return <span className={"p-1.5 rounded " + c}><I className="h-4 w-4" /></span>; })()}<span className="text-sm text-muted-foreground capitalize">{selMsg.messageType} Message</span></div>
                        <h2 className="text-xl font-bold text-foreground">{selMsg.title}</h2>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground"><span>From: {selMsg.sendingLibrary}</span><span>{new Date(selMsg.createDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span></div>
                      </div>
                      <button type="button" onClick={() => deleteMsgs([selMsg.id])} disabled={actLoad} className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="h-5 w-5" /></button>
                    </div>
                  </div>
                  <div className="p-6"><div className="prose prose-sm max-w-none text-foreground/80">{selMsg.content.split("\n").map((p, i) => <p key={i}>{p}</p>)}</div></div>
                  <div className="px-6 py-4 bg-muted/30 border-t border-border"><div className="flex items-center gap-2 text-sm text-muted-foreground">{selMsg.isRead ? <><CheckCircle className="h-4 w-4 text-green-600" />Read {selMsg.readDate && new Date(selMsg.readDate).toLocaleString()}</> : <><Mail className="h-4 w-4" />Unread</>}</div></div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-border p-12 text-center"><Mail className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" /><h2 className="text-xl font-semibold text-foreground mb-2">Select a message</h2><p className="text-muted-foreground">Choose a message from the list</p></div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
