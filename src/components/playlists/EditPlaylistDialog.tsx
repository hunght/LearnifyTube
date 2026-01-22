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
import { Pencil, Loader2 } from "lucide-react";

type EditPlaylistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string;
  initialName: string;
  initialDescription?: string | null;
  onUpdated?: () => void;
};

export function EditPlaylistDialog({
  open,
  onOpenChange,
  playlistId,
  initialName,
  initialDescription,
  onUpdated,
}: EditPlaylistDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription ?? "");
    }
  }, [open, initialName, initialDescription]);

  const updateMutation = useMutation({
    mutationFn: () =>
      trpcClient.customPlaylists.update.mutate({
        playlistId,
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["customPlaylists"] });
        toast.success("Playlist updated");
        onUpdated?.();
        onOpenChange(false);
      } else if ("message" in res) {
        toast.error(res.message ?? "Failed to update playlist");
      } else {
        toast.error("Failed to update playlist");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update playlist"),
  });

  const canUpdate =
    name.trim().length > 0 &&
    !updateMutation.isPending &&
    (name.trim() !== initialName || (description.trim() || null) !== (initialDescription || null));

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!canUpdate) return;
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Playlist
          </DialogTitle>
          <DialogDescription>Update your playlist details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-playlist-name">Name</Label>
            <Input
              id="edit-playlist-name"
              placeholder="My Playlist"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-playlist-description">Description (optional)</Label>
            <Textarea
              id="edit-playlist-description"
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
            <Button type="submit" disabled={!canUpdate} className="gap-2">
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
