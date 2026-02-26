"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/use-patron-session";
import { fetchWithAuth } from "@/lib/client-fetch";
import { featureFlags } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Heart,
  BookOpen,
  CheckCircle,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  Loader2,
  AlertCircle,
  List,
  Lock,
  Globe,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface ListItem {
  id: number | string;
  bibId: number;
  title?: string;
  author?: string;
  coverUrl?: string;
  dateAdded: string;
  notes?: string;
}

interface BookList {
  id: number | string;
  name: string;
  description: string;
  visibility: "public" | "private";
  itemCount: number;
  items: ListItem[];
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  icon: string;
}

const iconMap: Record<string, React.ElementType> = {
  heart: Heart,
  book: BookOpen,
  check: CheckCircle,
  list: List,
};

export default function MyListsPage() {
  const t = useTranslations("listsPage");
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading } = usePatronSession();
  const enabled = featureFlags.opacLists;
  const [lists, setLists] = useState<BookList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<BookList | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<BookList | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListVisibility, setNewListVisibility] = useState<"public" | "private">("private");
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLists = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/opac/lists", { credentials: "include" });

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/opac/login?redirect=/opac/account/lists");
          return;
        }
        throw new Error("Failed to fetch lists");
      }

      const data = await response.json();
      setLists(data.lists || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!enabled) return;
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/lists");
      return;
    }
    if (isLoggedIn) {
      void fetchLists();
    }
  }, [enabled, fetchLists, isLoggedIn, sessionLoading, router]);

  const selectList = useCallback(async (list: BookList) => {
    setSelectedList(list);
    setItemsLoading(true);

    try {
      // Fetch full list details with items
      const response = await fetch(`/api/opac/lists/${list.id}`, { credentials: "include" });

      if (response.ok) {
        const data = await response.json();
        setListItems(data.items || list.items || []);
      } else {
        setListItems(list.items || []);
      }
    } catch {
      setListItems(list.items || []);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lists.length > 0 && !selectedList) {
      void selectList(lists[0]!);
    }
  }, [lists, selectedList, selectList]);

  const createList = async () => {
    if (!newListName.trim()) return;

    setActionLoading(true);
    try {
      const response = await fetchWithAuth("/api/opac/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDescription.trim(),
          visibility: newListVisibility,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setLists([...lists, data.list]);
        setShowCreateModal(false);
        setNewListName("");
        setNewListDescription("");
        setNewListVisibility("private");
        selectList(data.list);
      } else {
        const errData = await response.json();
        setError(errData.error || "Failed to create list");
      }
    } catch {
      setError("Failed to create list");
    } finally {
      setActionLoading(false);
    }
  };

  const updateList = async () => {
    if (!selectedList || !newListName.trim()) return;

    setActionLoading(true);
    try {
      const response = await fetchWithAuth(`/api/opac/lists/${selectedList.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDescription.trim(),
          visibility: newListVisibility,
        }),
      });

      if (response.ok) {
        const updatedList = {
          ...selectedList,
          name: newListName.trim(),
          description: newListDescription.trim(),
          visibility: newListVisibility,
        };
        setLists(lists.map((l) => (l.id === selectedList.id ? updatedList : l)));
        setSelectedList(updatedList);
        setShowEditModal(false);
      } else {
        const errData = await response.json();
        setError(errData.error || "Failed to update list");
      }
    } catch {
      setError("Failed to update list");
    } finally {
      setActionLoading(false);
    }
  };

  const deleteList = async (list: BookList) => {
    setActionLoading(true);
    try {
      const response = await fetchWithAuth(`/api/opac/lists/${list.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        const newLists = lists.filter((l) => l.id !== list.id);
        setLists(newLists);
        if (selectedList?.id === list.id) {
          setSelectedList(newLists[0] || null);
          if (newLists[0]) {
            selectList(newLists[0]);
          } else {
            setListItems([]);
          }
        }
        setShowDeleteConfirm(null);
      } else {
        const errData = await response.json();
        setError(errData.error || "Failed to delete list");
      }
    } catch {
      setError("Failed to delete list");
    } finally {
      setActionLoading(false);
    }
  };

  const removeItemFromList = async (itemId: number | string) => {
    if (!selectedList) return;

    try {
      const response = await fetchWithAuth(`/api/opac/lists/${selectedList.id}/items/${itemId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setListItems(listItems.filter((item) => item.id !== itemId));
        setLists(
          lists.map((l) => (l.id === selectedList.id ? { ...l, itemCount: l.itemCount - 1 } : l))
        );
        if (selectedList) {
          setSelectedList({ ...selectedList, itemCount: selectedList.itemCount - 1 });
        }
      }
    } catch {
      setError("Failed to remove item");
    }
  };

  const openEditModal = () => {
    if (selectedList) {
      setNewListName(selectedList.name);
      setNewListDescription(selectedList.description);
      setNewListVisibility(selectedList.visibility);
      setShowEditModal(true);
    }
  };

  const filteredItems = searchQuery
    ? listItems.filter(
        (item) =>
          item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.author?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : listItems;

  if (!enabled) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-sm border border-border p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Heart className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Lists are disabled</h1>
          <p className="text-muted-foreground mb-6">
            This feature is still being integrated. Check back soon.
          </p>
          <Link
            href="/opac"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 stx-action-primary
                     rounded-lg font-medium hover:brightness-110 transition-colors"
          >
            Back to catalog
          </Link>
        </div>
      </div>
    );
  }

  if (sessionLoading || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/opac/account"
            className="inline-flex items-center gap-1 text-primary-600 hover:underline mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Account
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 rounded-xl">
                <Heart className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">My Lists</h1>
                <p className="text-muted-foreground">Organize your reading</p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => {
                setNewListName("");
                setNewListDescription("");
                setNewListVisibility("private");
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 stx-action-primary
                       rounded-lg hover:brightness-110 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create List
            </Button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700">{error}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setError(null)}
              className="ml-auto h-8 w-8 rounded-full text-red-600 hover:bg-red-100"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Lists sidebar */}
            <div className="lg:col-span-1">
              <div className="stx-surface rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="font-semibold text-foreground">Your Lists</h2>
                </div>
                <div className="divide-y divide-border">
                  {lists.map((list) => {
                    const Icon = iconMap[list.icon] || List;
                    return (
                      <Button
                        key={list.id}
                        type="button"
                        onClick={() => selectList(list)}
                        variant="ghost"
                        className={`h-auto w-full justify-start p-4 text-left hover:bg-muted/30 transition-colors
                                  ${selectedList?.id === list.id ? "bg-primary-50 border-l-4 border-primary-600" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon
                            className={`h-5 w-5 ${selectedList?.id === list.id ? "text-primary-600" : "text-muted-foreground"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={`font-medium truncate ${selectedList?.id === list.id ? "text-primary-600" : "text-foreground"}`}
                            >
                              {list.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {list.itemCount} item{list.itemCount !== 1 && "s"}
                            </p>
                          </div>
                          {list.visibility === "private" ? (
                            <Lock className="h-4 w-4 text-muted-foreground/50" />
                          ) : (
                            <Globe className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </div>
                      </Button>
                    );
                  })}
                  {lists.length === 0 && (
                    <div className="p-6 text-center text-muted-foreground">{t("noLists")}</div>
                  )}
                </div>
              </div>
            </div>

            {/* List content */}
            <div className="lg:col-span-3">
              {selectedList ? (
                <div className="stx-surface rounded-xl">
                  {/* List header */}
                  <div className="p-6 border-b border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-foreground">{selectedList.name}</h2>
                        {selectedList.description && (
                          <p className="text-muted-foreground mt-1">{selectedList.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span>
                            {selectedList.itemCount} item{selectedList.itemCount !== 1 && "s"}
                          </span>
                          <span className="flex items-center gap-1">
                            {selectedList.visibility === "private" ? (
                              <>
                                <Lock className="h-3 w-3" />
                                Private
                              </>
                            ) : (
                              <>
                                <Globe className="h-3 w-3" />
                                Public
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                      {!selectedList.isDefault && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={openEditModal}
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                            title="Edit list"
                            aria-label="Edit list"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowDeleteConfirm(selectedList)}
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            title="Delete list"
                            aria-label="Delete list"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Search within list */}
                    {listItems.length > 0 && (
                      <div className="mt-4 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                        <Input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search in this list..."
                          className="h-9 rounded-lg border-border bg-background pl-10 pr-4"
                        />
                      </div>
                    )}
                  </div>

                  {/* List items */}
                  <div className="p-6">
                    {itemsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 text-primary-600 animate-spin" />
                      </div>
                    ) : filteredItems.length > 0 ? (
                      <div className="space-y-4">
                        {filteredItems.map((item) => (
                          <div key={item.id} className="flex gap-4 p-4 bg-muted/30 rounded-lg">
                            {/* Cover */}
                            <div className="w-16 h-24 bg-muted rounded-lg shrink-0 overflow-hidden">
                              {item.coverUrl ? (
                                <Image
                                  src={item.coverUrl}
                                  alt={`Cover of ${item.title || "item"}`}
                                  width={64}
                                  height={96}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <BookOpen className="h-6 w-6 text-muted-foreground/70" />
                                </div>
                              )}
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <Link
                                href={`/opac/record/${item.bibId}`}
                                className="font-semibold text-foreground hover:text-primary-600 line-clamp-2"
                              >
                                {item.title || "Unknown Title"}
                              </Link>
                              {item.author && (
                                <p className="text-sm text-muted-foreground mt-1">{item.author}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                Added {new Date(item.dateAdded).toLocaleDateString()}
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="shrink-0 flex gap-2">
                              <Link
                                href={`/opac/record/${item.bibId}`}
                                className="px-3 py-1 text-sm text-primary-600 border border-primary-200
                                         rounded-lg hover:bg-primary-50 transition-colors"
                              >
                                View
                              </Link>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItemFromList(item.id)}
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                title="Remove from list"
                                aria-label="Remove from list"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <List className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          {searchQuery ? "No matching items" : "This list is empty"}
                        </h3>
                        <p className="text-muted-foreground mb-6">
                          {searchQuery
                            ? "Try a different search term"
                            : "Browse the catalog and save items to this list"}
                        </p>
                        {!searchQuery && (
                          <Link
                            href="/opac"
                            className="inline-flex items-center gap-2 px-6 py-3 stx-action-primary
                                     rounded-lg font-medium hover:brightness-110 transition-colors"
                          >
                            <Search className="h-4 w-4" />
                            Browse Catalog
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="stx-surface rounded-xl p-12 text-center">
                  <List className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">Select a list</h2>
                  <p className="text-muted-foreground">
                    Choose a list from the sidebar or create a new one
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-foreground mb-4">Create New List</h3>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="list-name"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  List Name *
                </label>
                <Input
                  id="list-name"
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., Summer Reading"
                  className="h-10 rounded-lg px-3"
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  Description
                </label>
                <Textarea
                  id="description"
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="What is this list for?"
                  rows={3}
                  className="min-h-[84px] rounded-lg px-3"
                />
              </div>

              <div>
                <label
                  htmlFor="visibility"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  Visibility
                </label>
                <div className="flex gap-4">
                  <label htmlFor="private" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="visibility"
                      type="radio"
                      name="visibility"
                      value="private"
                      checked={newListVisibility === "private"}
                      onChange={() => setNewListVisibility("private")}
                      className="text-primary-600"
                    />
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Private
                  </label>
                  <label htmlFor="public" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="private"
                      type="radio"
                      name="visibility"
                      value="public"
                      checked={newListVisibility === "public"}
                      onChange={() => setNewListVisibility("public")}
                      className="text-primary-600"
                    />
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    Public
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={createList}
                disabled={!newListName.trim() || actionLoading}
                className="flex-1"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("createList")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit List Modal */}
      {showEditModal && selectedList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-foreground mb-4">Edit List</h3>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="list-name-2"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  List Name *
                </label>
                <Input
                  id="list-name-2"
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="h-10 rounded-lg px-3"
                />
              </div>

              <div>
                <label
                  htmlFor="description-2"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  Description
                </label>
                <Textarea
                  id="description-2"
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  rows={3}
                  className="min-h-[84px] rounded-lg px-3"
                />
              </div>

              <div>
                <label
                  htmlFor="visibility-2"
                  className="block text-sm font-medium text-foreground/80 mb-2"
                >
                  Visibility
                </label>
                <div className="flex gap-4">
                  <label htmlFor="private-2" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="visibility-2"
                      type="radio"
                      name="edit-visibility"
                      value="private"
                      checked={newListVisibility === "private"}
                      onChange={() => setNewListVisibility("private")}
                      className="text-primary-600"
                    />
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Private
                  </label>
                  <label htmlFor="public-2" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="private-2"
                      type="radio"
                      name="edit-visibility"
                      value="public"
                      checked={newListVisibility === "public"}
                      onChange={() => setNewListVisibility("public")}
                      className="text-primary-600"
                    />
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    Public
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={updateList}
                disabled={!newListName.trim() || actionLoading}
                className="flex-1"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-foreground mb-4">Delete List</h3>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete <strong>{showDeleteConfirm.name}</strong>? This action
              cannot be undone.
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => deleteList(showDeleteConfirm)}
                disabled={actionLoading}
                className="flex-1"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete List"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
