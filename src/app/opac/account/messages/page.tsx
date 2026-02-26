"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle,
  ChevronLeft,
  Clock,
  DollarSign,
  Loader2,
  Mail,
  MailOpen,
  RefreshCw,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePatronSession } from "@/hooks/use-patron-session";
import { fetchWithAuth } from "@/lib/client-fetch";

type MessageFilter = "all" | "unread" | "read";

interface PatronMessage {
  id: number;
  title: string;
  content: string;
  sendingLibrary: string;
  sendingLibraryId: number;
  isRead: boolean;
  readDate: string | null;
  createDate: string;
  messageType: "general" | "holds" | "fines" | "account";
}

const messageIcons = {
  general: Bell,
  holds: Clock,
  fines: DollarSign,
  account: User,
} as const;

const messageColorClasses = {
  general: "bg-blue-100 text-blue-700",
  holds: "bg-indigo-100 text-indigo-700",
  fines: "bg-amber-100 text-amber-700",
  account: "bg-emerald-100 text-emerald-700",
} as const;

export default function PatronMessagesPage() {
  const t = useTranslations("messagesPage");
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading } = usePatronSession();

  const [messages, setMessages] = useState<PatronMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<PatronMessage | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<MessageFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/opac/messages", { credentials: "include" });
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/opac/login?redirect=/opac/account/messages");
          return;
        }
        throw new Error("Failed to load messages");
      }

      const data = await response.json();
      const nextMessages = Array.isArray(data.messages) ? (data.messages as PatronMessage[]) : [];
      setMessages(nextMessages);
      setSelectedIds(new Set());
      setSelectedMessage((prev) =>
        prev ? nextMessages.find((message) => message.id === prev.id) || null : null
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/messages");
      return;
    }
    if (isLoggedIn) {
      void fetchMessages();
    }
  }, [fetchMessages, isLoggedIn, router, sessionLoading]);

  const markRead = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    setIsActionLoading(true);
    try {
      const response = await fetchWithAuth("/api/opac/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", messageIds: ids }),
      });
      if (!response.ok) throw new Error("Failed to update messages");

      setMessages((prev) =>
        prev.map((message) =>
          ids.includes(message.id)
            ? { ...message, isRead: true, readDate: message.readDate || new Date().toISOString() }
            : message
        )
      );
      setSelectedIds(new Set());
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update messages");
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const deleteMessages = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    setIsActionLoading(true);
    try {
      const response = await fetchWithAuth("/api/opac/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", messageIds: ids }),
      });
      if (!response.ok) throw new Error("Failed to delete messages");

      setMessages((prev) => prev.filter((message) => !ids.includes(message.id)));
      setSelectedIds(new Set());
      setSelectedMessage((prev) => (prev && ids.includes(prev.id) ? null : prev));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete messages");
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const openMessage = useCallback(
    async (message: PatronMessage) => {
      setSelectedMessage(message);
      if (!message.isRead) {
        await markRead([message.id]);
      }
    },
    [markRead]
  );

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const unreadCount = useMemo(
    () => messages.filter((message) => !message.isRead).length,
    [messages]
  );

  const filteredMessages = useMemo(() => {
    if (filter === "unread") return messages.filter((message) => !message.isRead);
    if (filter === "read") return messages.filter((message) => message.isRead);
    return messages;
  }, [filter, messages]);

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8">
          <Link
            href="/opac/account"
            className="mb-4 inline-flex items-center gap-1 text-primary-600 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative rounded-xl bg-primary-100 p-3">
                <Mail className="h-6 w-6 text-primary-600" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Messages</h1>
                <p className="text-muted-foreground">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up!"}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void fetchMessages()}
              disabled={isLoading}
            >
              <RefreshCw className={isLoading ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700">{error}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7 text-red-700 hover:text-red-700"
              onClick={() => setError(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <Card className="overflow-hidden">
                <div className="space-y-3 border-b border-border p-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={filter === "all" ? "default" : "outline"}
                      onClick={() => setFilter("all")}
                    >
                      All ({messages.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={filter === "unread" ? "default" : "outline"}
                      onClick={() => setFilter("unread")}
                    >
                      Unread ({unreadCount})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={filter === "read" ? "default" : "outline"}
                      onClick={() => setFilter("read")}
                    >
                      Read ({messages.length - unreadCount})
                    </Button>
                  </div>

                  {selectedIds.size > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                      <span className="text-sm text-muted-foreground">
                        {selectedIds.size} selected
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isActionLoading}
                        onClick={() => void markRead(Array.from(selectedIds))}
                      >
                        Mark read
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isActionLoading}
                        onClick={() => void deleteMessages(Array.from(selectedIds))}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="max-h-[600px] divide-y divide-border overflow-y-auto">
                  {filteredMessages.length > 0 ? (
                    filteredMessages.map((message) => {
                      const Icon = messageIcons[message.messageType] || Bell;
                      const iconClasses =
                        messageColorClasses[message.messageType] || "bg-slate-100 text-slate-700";
                      const isSelected = selectedMessage?.id === message.id;
                      return (
                        <div
                          key={message.id}
                          className={[
                            "flex items-start gap-3 p-4",
                            isSelected ? "bg-primary-50" : "",
                            !message.isRead ? "bg-blue-50/50" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(message.id)}
                            onChange={() => toggleSelected(message.id)}
                            onClick={(event) => event.stopPropagation()}
                            className="mt-1 rounded border-border text-primary-600"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void openMessage(message)}
                            className="h-auto w-full items-start justify-start p-0 text-left hover:bg-transparent"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center gap-2">
                                <span className={`rounded p-1 ${iconClasses}`}>
                                  <Icon className="h-3 w-3" />
                                </span>
                                {!message.isRead ? (
                                  <span className="h-2 w-2 rounded-full bg-primary-600" />
                                ) : null}
                                <span className="text-xs text-muted-foreground">
                                  {new Date(message.createDate).toLocaleDateString()}
                                </span>
                              </div>
                              <p
                                className={
                                  message.isRead
                                    ? "truncate text-sm"
                                    : "truncate text-sm font-semibold"
                                }
                              >
                                {message.title}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {message.sendingLibrary}
                              </p>
                            </div>
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center">
                      <MailOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        {filter === "unread"
                          ? "No unread messages"
                          : filter === "read"
                            ? "No read messages"
                            : t("noMessages")}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <div className="lg:col-span-2">
              {selectedMessage ? (
                <Card>
                  <div className="border-b border-border p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          {(() => {
                            const Icon = messageIcons[selectedMessage.messageType] || Bell;
                            const iconClasses =
                              messageColorClasses[selectedMessage.messageType] ||
                              "bg-slate-100 text-slate-700";
                            return (
                              <span className={`rounded p-1.5 ${iconClasses}`}>
                                <Icon className="h-4 w-4" />
                              </span>
                            );
                          })()}
                          <span className="text-sm capitalize text-muted-foreground">
                            {selectedMessage.messageType} Message
                          </span>
                        </div>
                        <h2 className="text-xl font-bold text-foreground">
                          {selectedMessage.title}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span>From: {selectedMessage.sendingLibrary}</span>
                          <span>
                            {new Date(selectedMessage.createDate).toLocaleDateString(undefined, {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isActionLoading}
                        title="Delete"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => void deleteMessages([selectedMessage.id])}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="prose prose-sm max-w-none text-foreground/80">
                      {selectedMessage.content.split("\n").map((paragraph, index) => (
                        <p key={`${selectedMessage.id}-${index}`}>{paragraph}</p>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-border bg-muted/30 px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {selectedMessage.isRead ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                          Read{" "}
                          {selectedMessage.readDate
                            ? new Date(selectedMessage.readDate).toLocaleString()
                            : ""}
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4" />
                          Unread
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="p-12 text-center">
                  <Mail className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" />
                  <h2 className="mb-2 text-xl font-semibold text-foreground">Select a message</h2>
                  <p className="text-muted-foreground">Choose a message from the list</p>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
