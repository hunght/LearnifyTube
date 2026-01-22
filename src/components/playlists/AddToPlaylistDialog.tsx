import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, ListPlus, FolderPlus } from "lucide-react";
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";

type AddToPlaylistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  videoTitle?: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
};

export function AddToPlaylistDialog({
  open,
  onOpenChange,
  videoId,
  videoTitle,
  channelTitle,
  thumbnailUrl,
  durationSeconds,
}: AddToPlaylistDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<string>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Get all custom playlists
  const playlistsQuery = useQuery({
    queryKey: ["customPlaylists", "all"],
    queryFn: () => trpcClient.customPlaylists.listAll.query(),
    enabled: open,
  });

  // Get which playlists already contain this video
  const containingPlaylistsQuery = useQuery({
    queryKey: ["customPlaylists", "forVideo", videoId],
    queryFn: () => trpcClient.customPlaylists.getPlaylistsForVideo.query({ videoId }),
    enabled: open && !!videoId,
  });

  // Set of playlist IDs that already contain the video
  const existingPlaylistIds = useMemo(() => {
    return new Set(containingPlaylistsQuery.data?.map((p) => p.id) ?? []);
  }, [containingPlaylistsQuery.data]);

  const addMutation = useMutation({
    mutationFn: async (playlistIds: string[]) => {
      const results = await Promise.all(
        playlistIds.map((playlistId) =>
          trpcClient.customPlaylists.addVideo.mutate({
            playlistId,
            videoId,
            title: videoTitle,
            channelTitle,
            thumbnailUrl,
            durationSeconds,
          })
        )
      );
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      if (successCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["customPlaylists"] });
        toast.success(`Added to ${successCount} playlist${successCount > 1 ? "s" : ""}`);
        onOpenChange(false);
      } else {
        toast.error("Failed to add to playlists");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add to playlists"),
  });

  const handleTogglePlaylist = (playlistId: string): void => {
    // Don't allow toggling if already in playlist
    if (existingPlaylistIds.has(playlistId)) return;

    setSelectedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
      }
      return next;
    });
  };

  const handleSave = (): void => {
    if (selectedPlaylists.size === 0) {
      toast.error("Please select at least one playlist");
      return;
    }
    addMutation.mutate(Array.from(selectedPlaylists));
  };

  const handlePlaylistCreated = (playlistId: string): void => {
    // Add to selection after creating
    setSelectedPlaylists((prev) => new Set(prev).add(playlistId));
    // Refetch playlists list
    queryClient.invalidateQueries({ queryKey: ["customPlaylists", "all"] });
  };

  const isLoading = playlistsQuery.isLoading || containingPlaylistsQuery.isLoading;
  const playlists = playlistsQuery.data ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-5 w-5" />
              Add to Playlist
            </DialogTitle>
            {videoTitle && (
              <DialogDescription className="line-clamp-2">{videoTitle}</DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : playlists.length === 0 ? (
              <div className="py-6 text-center">
                <FolderPlus className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No playlists yet</p>
                <p className="text-xs text-muted-foreground">Create one to get started</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2 pr-4">
                  {playlists.map((playlist) => {
                    const isInPlaylist = existingPlaylistIds.has(playlist.id);
                    const isSelected = selectedPlaylists.has(playlist.id);

                    return (
                      <label
                        key={playlist.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                          isInPlaylist ? "cursor-default opacity-60" : ""
                        }`}
                      >
                        <Checkbox
                          checked={isInPlaylist || isSelected}
                          onCheckedChange={() => handleTogglePlaylist(playlist.id)}
                          disabled={isInPlaylist}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{playlist.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {playlist.itemCount ?? 0} video{(playlist.itemCount ?? 0) !== 1 && "s"}
                            {isInPlaylist && " (already added)"}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4" />
              Create New Playlist
            </Button>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={selectedPlaylists.size === 0 || addMutation.isPending}
                className="gap-2"
              >
                {addMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <span>
                    Add to {selectedPlaylists.size || ""} Playlist
                    {selectedPlaylists.size !== 1 && "s"}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CreatePlaylistDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handlePlaylistCreated}
      />
    </>
  );
}
