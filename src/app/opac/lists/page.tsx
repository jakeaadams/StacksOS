"use client";
import { clientLogger } from "@/lib/client-logger";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePatronSession } from "@/hooks/usePatronSession";
import { BookCard } from "@/components/opac/BookCard";
import {
  Heart,
  BookOpen,
  Clock,
  CheckCircle,
  Plus,
  Trash2,
  Edit3,
  Share2,
  Lock,
  Globe,
  Users,
  MoreVertical,
  Star,
  List,
  Grid,
  ChevronRight,
  Search,
  X,
  Loader2,
} from "lucide-react";

interface ListItem {
  id: number;
  bibId: number;
  title: string;
  author: string;
  coverUrl?: string;
  dateAdded: string;
  notes?: string;
}

interface UserList {
  id: number;
  name: string;
  description?: string;
  visibility: "private" | "shared" | "public";
  itemCount: number;
  items: ListItem[];
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  icon: "heart" | "book" | "clock" | "check" | "star" | "list";
}

const defaultLists: UserList[] = [
  {
    id: 1,
    name: "Want to Read",
    description: "Books I want to check out",
    visibility: "private",
    itemCount: 0,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: true,
    icon: "heart",
  },
  {
    id: 2,
    name: "Currently Reading",
    description: "Books I am reading now",
    visibility: "private",
    itemCount: 0,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: true,
    icon: "book",
  },
  {
    id: 3,
    name: "Completed",
    description: "Books I have finished",
    visibility: "private",
    itemCount: 0,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: true,
    icon: "check",
  },
];

const iconMap: Record<string, React.ElementType> = {
  heart: Heart,
  book: BookOpen,
  clock: Clock,
  check: CheckCircle,
  star: Star,
  list: List,
};

const visibilityIcons: Record<string, React.ElementType> = {
  private: Lock,
  shared: Users,
  public: Globe,
};

export default function ListsPage() {
  const { isLoggedIn, patron } = usePatronSession();
  const [lists, setLists] = useState<UserList[]>(defaultLists);
  const [selectedList, setSelectedList] = useState<UserList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // New list form state
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListVisibility, setNewListVisibility] = useState<"private" | "shared" | "public">("private");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      fetchLists();
    } else {
      setIsLoading(false);
    }
  }, [isLoggedIn]);

  const fetchLists = async () => {
    try {
      setIsLoading(true);
      const response = await fetchWithAuth("/api/opac/lists");
      if (response.ok) {
        const data = await response.json();
        setLists(data.lists || defaultLists);
      }
    } catch (err) {
      clientLogger.error("Error fetching lists:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetchWithAuth("/api/opac/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newListName,
          description: newListDescription,
          visibility: newListVisibility,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setLists((prev) => [...prev, data.list]);
        setShowCreateModal(false);
        setNewListName("");
        setNewListDescription("");
        setNewListVisibility("private");
      }
    } catch (err) {
      clientLogger.error("Error creating list:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteList = async (listId: number) => {
    if (!confirm("Are you sure you want to delete this list?")) return;

    try {
      await fetchWithAuth(`/api/opac/lists/${listId}`, { method: "DELETE" });
      setLists((prev) => prev.filter((l) => l.id !== listId));
      if (selectedList?.id === listId) {
        setSelectedList(null);
      }
    } catch (err) {
      clientLogger.error("Error deleting list:", err);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-border p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Heart className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">
            My Lists
          </h1>
          <p className="text-muted-foreground mb-6">
            Create reading lists, save books you want to read, and track what you have finished.
            Log in to access your lists.
          </p>
          <Link
            href="/opac/login"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white 
                     rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            Log In
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Lists</h1>
            <p className="text-muted-foreground mt-1">
              Organize your reading with custom lists
            </p>
          </div>
          <button type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg
                     font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Create New List
          </button>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Lists sidebar */}
          <div className="lg:col-span-1">
            <nav className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Your Lists</h2>
              </div>
              <div className="divide-y divide-border/50">
                {lists.map((list) => {
                  const Icon = iconMap[list.icon] || List;
                  const VisIcon = visibilityIcons[list.visibility];
                  const isSelected = selectedList?.id === list.id;

                  return (
                    <button type="button"
                      key={list.id}
                      onClick={() => setSelectedList(list)}
                      className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors
                        ${isSelected ? "bg-primary-50" : "hover:bg-muted/30"}`}
                    >
                      <div className={`p-2 rounded-lg ${isSelected ? "bg-primary-100" : "bg-muted/50"}`}>
                        <Icon className={`h-4 w-4 ${isSelected ? "text-primary-600" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${isSelected ? "text-primary-700" : "text-foreground"}`}>
                          {list.name}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <VisIcon className="h-3 w-3" />
                          {list.itemCount} items
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Staff Picks & Community Lists */}
            <div className="mt-6 bg-white rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Discover</h2>
              </div>
              <div className="p-2">
                <Link
                  href="/opac/lists/staff-picks"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Star className="h-4 w-4 text-purple-600" />
                  </div>
                  <span className="font-medium text-foreground">Staff Picks</span>
                </Link>
                <Link
                  href="/opac/lists/community"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-foreground">Community Lists</span>
                </Link>
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
                      <h2 className="text-2xl font-bold text-foreground">{selectedList.name}</h2>
                      {selectedList.description && (
                        <p className="text-muted-foreground mt-1">{selectedList.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {(() => {
                            const VisIcon = visibilityIcons[selectedList.visibility];
                            return <VisIcon className="h-4 w-4" />;
                          })()}
                          {selectedList.visibility === "private" ? "Private" : 
                           selectedList.visibility === "shared" ? "Shared with link" : "Public"}
                        </span>
                        <span>{selectedList.itemCount} items</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button"
                        onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
                        className="p-2 text-muted-foreground/70 hover:text-muted-foreground rounded-lg hover:bg-muted/50"
                        title={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
                      >
                        {viewMode === "grid" ? <List className="h-5 w-5" /> : <Grid className="h-5 w-5" />}
                      </button>
                      {!selectedList.isDefault && (
                        <>
                          <button type="button" className="p-2 text-muted-foreground/70 hover:text-muted-foreground rounded-lg hover:bg-muted/50">
                            <Share2 className="h-5 w-5" />
                          </button>
                          <button className="p-2 text-muted-foreground/70 hover:text-muted-foreground rounded-lg hover:bg-muted/50">
                            <Edit3 className="h-5 w-5" />
                          </button>
                          <button type="button"
                            onClick={() => handleDeleteList(selectedList.id)}
                            className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* List items */}
                <div className="p-6">
                  {selectedList.items.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookOpen className="h-8 w-8 text-muted-foreground/70" />
                      </div>
                      <h3 className="text-lg font-medium text-foreground mb-2">
                        This list is empty
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        Browse the catalog and click the heart icon to add items to this list.
                      </p>
                      <Link
                        href="/opac/search"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white 
                                 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                      >
                        <Search className="h-4 w-4" />
                        Browse Catalog
                      </Link>
                    </div>
                  ) : (
                    <div className={viewMode === "grid" 
                      ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4" 
                      : "space-y-4"
                    }>
                      {selectedList.items.map((item) => (
                        <BookCard
                          key={item.id}
                          id={item.bibId}
                          title={item.title}
                          author={item.author}
                          coverUrl={item.coverUrl}
                          variant={viewMode === "grid" ? "grid" : "list"}
                          showFormats={false}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border p-12 text-center">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <List className="h-8 w-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Select a list to view
                </h3>
                <p className="text-muted-foreground">
                  Choose a list from the sidebar or create a new one.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Create New List</h2>
              <button type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-muted-foreground/70 hover:text-muted-foreground rounded-lg hover:bg-muted/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateList} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  List Name *
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., Summer Reading, Book Club Picks"
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Description
                </label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="What is this list about?"
                  rows={3}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Visibility
                </label>
                <div className="space-y-2">
                  {[
                    { value: "private", label: "Private", desc: "Only you can see this list", icon: Lock },
                    { value: "shared", label: "Shared", desc: "Anyone with the link can view", icon: Users },
                    { value: "public", label: "Public", desc: "Visible in community lists", icon: Globe },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                        ${newListVisibility === option.value 
                          ? "border-primary-500 bg-primary-50" 
                          : "border-border hover:border-border"}`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={option.value}
                        checked={newListVisibility === option.value}
                        onChange={(e) => setNewListVisibility(e.target.value as any)}
                        className="sr-only"
                      />
                      <option.icon className={`h-5 w-5 ${newListVisibility === option.value ? "text-primary-600" : "text-muted-foreground/70"}`} />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-border text-foreground/80 rounded-lg font-medium
                           hover:bg-muted/30 transition-colors"
                >
                  Cancel
                </button>
                <button type="submit"
                  disabled={isCreating || !newListName.trim()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium
                           hover:bg-primary-700 transition-colors disabled:opacity-50 
                           disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create List
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
