"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/client-fetch";
import { clientLogger } from "@/lib/client-logger";
import {
  PageContainer,
  PageHeader,
  PageContent,
  DataTable,
  EmptyState,
  LoadingInline,
} from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderOpen, Plus, Trash2, Edit2, Share2, RefreshCw, Loader2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { featureFlags } from "@/lib/feature-flags";

interface Bucket {
  id: number;
  name: string;
  description?: string;
  itemCount: number;
  createTime: string;
  owner: number;
  pub: boolean;
}

export default function RecordBucketsPage() {
  const enabled = featureFlags.recordBuckets;
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [newBucketDescription, setNewBucketDescription] = useState("");
  const [newBucketShared, setNewBucketShared] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchBuckets = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/buckets?shared=true");
      const data = await response.json();

      if (data.ok && data.buckets) {
        setBuckets(data.buckets);
      } else {
        toast.error(data.error || "Failed to load buckets");
      }
    } catch (err) {
      clientLogger.error("Error fetching buckets:", err);
      toast.error("Failed to load buckets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchBuckets();
  }, [enabled, fetchBuckets]);

  const handleCreate = async () => {
    if (!newBucketName.trim()) {
      toast.error("Please enter a bucket name");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetchWithAuth("/api/evergreen/buckets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: newBucketName.trim(),
          description: newBucketDescription.trim(),
          pub: newBucketShared,
        }),
      });

      const data = await response.json();

      if (data.ok && data.bucket) {
        setBuckets(prev => [data.bucket, ...prev]);
        setShowCreateDialog(false);
        setNewBucketName("");
        setNewBucketDescription("");
        setNewBucketShared(false);
        toast.success("Bucket created");
      } else {
        toast.error(data.error || "Failed to create bucket");
      }
    } catch (err) {
      clientLogger.error("Error creating bucket:", err);
      toast.error("Failed to create bucket");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (bucketId: number) => {
    setDeletingId(bucketId);
    try {
      const response = await fetchWithAuth(`/api/evergreen/buckets?id=${bucketId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.ok) {
        setBuckets(prev => prev.filter(b => b.id !== bucketId));
        toast.success("Bucket deleted");
      } else {
        toast.error(data.error || "Failed to delete bucket");
      }
    } catch (err) {
      clientLogger.error("Error deleting bucket:", err);
      toast.error("Failed to delete bucket");
    } finally {
      setDeletingId(null);
    }
  };

  const columns: ColumnDef<Bucket>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Bucket Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{row.original.name}</div>
            {row.original.description && (
              <div className="text-xs text-muted-foreground">{row.original.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "itemCount",
      header: "Records",
      cell: ({ row }) => <span className="font-mono">{row.original.itemCount}</span>,
    },
    {
      accessorKey: "pub",
      header: "Shared",
      cell: ({ row }) => row.original.pub ? (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <Share2 className="h-3 w-3" /> Yes
        </span>
      ) : "No",
    },
    {
      accessorKey: "createTime",
      header: "Created",
      cell: ({ row }) => {
        const date = row.original.createTime;
        if (!date) return "—";
        return new Date(date).toLocaleDateString();
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit bucket">
            <Edit2 className="h-4 w-4" />
            <span className="sr-only">Edit bucket</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-rose-600"
            onClick={() => handleDelete(row.original.id)}
            disabled={deletingId === row.original.id}
            title="Delete bucket"
          >
            {deletingId === row.original.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            <span className="sr-only">Delete bucket</span>
          </Button>
        </div>
      ),
    },
  ], [deletingId]);

  const pageActions = useMemo(() => [
    {
      label: "Refresh",
      icon: RefreshCw,
      variant: "outline" as const,
      onClick: fetchBuckets,
      loading: isLoading,
    },
    {
      label: "New Bucket",
      icon: Plus,
      onClick: () => setShowCreateDialog(true),
    },
	  ], [fetchBuckets, isLoading]);

  if (!enabled) {
    return (
      <PageContainer>
        <PageHeader
          title="Record Buckets"
          subtitle="Buckets are behind a feature flag until bulk workflows are fully validated."
          breadcrumbs={[
            { label: "Catalog", href: "/staff/catalog" },
            { label: "Record Buckets" },
          ]}
        />
        <PageContent>
          <EmptyState
            icon={FolderOpen}
            title="Record Buckets is disabled"
            description="This feature is hidden by default to avoid dead UI. Enable it once bucket create/edit/delete + permissions are verified on your Evergreen."
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Record Buckets"
        subtitle="Organize records into buckets for batch operations"
        breadcrumbs={[{ label: "Catalog", href: "/staff/catalog" }, { label: "Buckets" }]}
        actions={pageActions}
      />

      <PageContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingInline message="Loading buckets..." />
          </div>
        ) : buckets.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No buckets yet"
            description="Create your first bucket to start organizing records."
            action={{
              label: "Create Bucket",
              onClick: () => setShowCreateDialog(true),
              icon: Plus,
            }}
            secondaryAction={{
              label: "Seed demo data",
              onClick: () => window.location.assign("/staff/help#demo-data"),
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Buckets</CardTitle>
              <CardDescription>{buckets.length} bucket{buckets.length !== 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={columns} data={buckets} />
            </CardContent>
          </Card>
        )}
      </PageContent>

      {/* Create Bucket Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Bucket</DialogTitle>
            <DialogDescription>
              Create a new bucket to organize catalog records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Bucket Name</Label>
              <Input
                id="name"
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                placeholder="e.g., Summer Reading List"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newBucketDescription}
                onChange={(e) => setNewBucketDescription(e.target.value)}
                placeholder="What is this bucket for?"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="shared">Share with others</Label>
                <p className="text-xs text-muted-foreground">Allow other staff to view this bucket</p>
              </div>
              <Switch
                id="shared"
                checked={newBucketShared}
                onCheckedChange={setNewBucketShared}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Bucket"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
