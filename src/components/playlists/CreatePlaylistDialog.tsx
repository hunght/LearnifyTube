import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";

type CreatePlaylistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (playlistId: string, name: string) => void;
};

export function CreatePlaylistDialog({
  open,
  onOpenChange,
  onCreated,
}: CreatePlaylistDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: () =>
      trpcClient.customPlaylists.create.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: (res) => {
      if (res.success && "id" in res) {
        queryClient.invalidateQueries({ queryKey: ["customPlaylists"] });
        toast.success(`Playlist "${res.name}" created`);
        onCreated?.(res.id, res.name ?? name);
        onOpenChange(false);
      } else if (!res.success && "message" in res) {
        toast.error(res.message ?? "Failed to create playlist");
      } else {
        toast.error("Failed to create playlist");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create playlist"),
  });

  const canCreate = name.trim().length > 0 && !createMutation.isPending;

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!canCreate) return;
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create Playlist
          </DialogTitle>
          <DialogDescription>Create a new playlist to organize your videos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="playlist-name">Name</Label>
            <Input
              id="playlist-name"
              placeholder="My Playlist"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="playlist-description">Description (optional)</Label>
            <Textarea
              id="playlist-description"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canCreate} className="gap-2">
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Create</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
