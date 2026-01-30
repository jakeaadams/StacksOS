"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatronSession } from "@/hooks/usePatronSession";
import { fetchWithAuth } from "@/lib/client-fetch";
import {
  Heart,
  BookOpen,
  CheckCircle,
  Plus,
  Trash2,
  Edit2,
  MoreVertical,
  ChevronLeft,
  Loader2,
  AlertCircle,
  List,
  Lock,
  Globe,
  Search,
  X,
} from "lucide-react";

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
  const router = useRouter();
  const { isLoggedIn, isLoading: sessionLoading } = usePatronSession();
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

  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      router.push("/opac/login?redirect=/opac/account/lists");
      return;
    }
    if (isLoggedIn) {
      fetchLists();
    }
  }, [isLoggedIn, sessionLoading, router]);

  const fetchLists = async () => {
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
      
      // Select first list by default if none selected
      if (data.lists?.length > 0 && !selectedList) {
        selectList(data.lists[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const selectList = async (list: BookList) => {
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
  };

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
        setLists(lists.map(l => l.id === selectedList.id ? updatedList : l));
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
        const newLists = lists.filter(l => l.id !== list.id);
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
        setListItems(listItems.filter(item => item.id !== itemId));
        setLists(lists.map(l => 
          l.id === selectedList.id 
            ? { ...l, itemCount: l.itemCount - 1 }
            : l
        ));
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
    ? listItems.filter(item => 
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.author?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : listItems;

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
            <button
              type="button"
              onClick={() => {
                setNewListName("");
                setNewListDescription("");
                setNewListVisibility("private");
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white
                       rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create List
            </button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError(null)} className="ml-auto">
              <X className="h-4 w-4 text-red-600" />
            </button>
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
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="font-semibold text-foreground">Your Lists</h2>
                </div>
                <div className="divide-y divide-border">
                  {lists.map((list) => {
                    const Icon = iconMap[list.icon] || List;
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => selectList(list)}
                        className={`w-full text-left p-4 hover:bg-muted/30 transition-colors
                                  ${selectedList?.id === list.id ? "bg-primary-50 border-l-4 border-primary-600" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`h-5 w-5 ${selectedList?.id === list.id ? "text-primary-600" : "text-muted-foreground"}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate ${selectedList?.id === list.id ? "text-primary-600" : "text-foreground"}`}>
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
                      </button>
                    );
                  })}
                  {lists.length === 0 && (
                    <div className="p-6 text-center text-muted-foreground">
                      No lists yet
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* List content */}
            <div className="lg:col-span-3">
              {selectedList ? (
                <div className="bg-white rounded-xl border border-border">
                  {/* List header */}
                  <div className="p-6 border-b border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-foreground">{selectedList.name}</h2>
                        {selectedList.description && (
                          <p className="text-muted-foreground mt-1">{selectedList.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span>{selectedList.itemCount} item{selectedList.itemCount !== 1 && "s"}</span>
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
                          <button
                            type="button"
                            onClick={openEditModal}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 
                                     rounded-lg transition-colors"
                            title="Edit list"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(selectedList)}
                            className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 
                                     rounded-lg transition-colors"
                            title="Delete list"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Search within list */}
                    {listItems.length > 0 && (
                      <div className="mt-4 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search in this list..."
                          className="w-full pl-10 pr-4 py-2 border border-border rounded-lg
                                   focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                          <div
                            key={item.id}
                            className="flex gap-4 p-4 bg-muted/30 rounded-lg"
                          >
                            {/* Cover */}
                            <div className="w-16 h-24 bg-muted rounded-lg shrink-0 overflow-hidden">
                              {item.coverUrl ? (
                                <img
                                  src={item.coverUrl}
                                  alt=""
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
                              <button
                                type="button"
                                onClick={() => removeItemFromList(item.id)}
                                className="p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50
                                         rounded-lg transition-colors"
                                title="Remove from list"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
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
                            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white
                                     rounded-lg font-medium hover:bg-primary-700 transition-colors"
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
                <div className="bg-white rounded-xl border border-border p-12 text-center">
                  <List className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    Select a list
                  </h2>
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
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  List Name *
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., Summer Reading"
                  className="w-full px-3 py-2 border border-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Description
                </label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="What is this list for?"
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Visibility
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
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
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 border border-border rounded-lg text-foreground/80
                         hover:bg-muted/30 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createList}
                disabled={!newListName.trim() || actionLoading}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium
                         hover:bg-primary-700 transition-colors disabled:opacity-50
                         disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create List"
                )}
              </button>
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
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  List Name *
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Description
                </label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Visibility
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
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
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-2 border border-border rounded-lg text-foreground/80
                         hover:bg-muted/30 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={updateList}
                disabled={!newListName.trim() || actionLoading}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg font-medium
                         hover:bg-primary-700 transition-colors disabled:opacity-50
                         disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save Changes"
                )}
              </button>
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
              Are you sure you want to delete <strong>{showDeleteConfirm.name}</strong>? 
              This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-2 border border-border rounded-lg text-foreground/80
                         hover:bg-muted/30 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteList(showDeleteConfirm)}
                disabled={actionLoading}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium
                         hover:bg-red-700 transition-colors disabled:opacity-50
                         disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Delete List"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
