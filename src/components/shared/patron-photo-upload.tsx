"use client";

import * as React from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, ImageOff } from "lucide-react";

interface PatronPhotoUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patronId: number;
  patronName: string;
  currentPhotoUrl?: string;
  onPhotoUploaded: (url: string) => void;
}

export function PatronPhotoUpload({
  open,
  onOpenChange,
  patronId,
  patronName,
  currentPhotoUrl,
  onPhotoUploaded,
}: PatronPhotoUploadProps) {
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl || null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error("Please select a file");
      return;
    }

    try {
      setLoading(true);

      // Create form data
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("patronId", patronId.toString());

      // Upload to server
      const response = await fetch("/api/upload-patron-photo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const data = await response.json();

      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success("Photo uploaded successfully!");
      }

      onPhotoUploaded(data.url);
      onOpenChange(false);

      // Reset state
      setUploadFile(null);
      setPreview(null);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload photo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Patron Photo</DialogTitle>
          <DialogDescription>
            Upload a photo for {patronName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="flex justify-center">
            {preview ? (
              <div className="relative">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-48 h-48 object-cover rounded-full border-4 border-muted"
                />
              </div>
            ) : (
              <div className="w-48 h-48 bg-muted rounded-full flex items-center justify-center">
                <ImageOff className="h-16 w-16 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="patron-photo">Choose Photo</Label>
            <Input
              id="patron-photo"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={loading}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Supported: JPG, PNG, GIF, WEBP (max 2MB)
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadFile || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Photo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
