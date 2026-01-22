import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Play, Check, Video, MoreVertical, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";
import { cn } from "@/lib/utils";
import type { PlaylistVideo } from "./PlaylistVideoCard";

interface CustomPlaylistVideoCardProps {
  video: PlaylistVideo;
  index: number;
  playlistId: string;
  totalVideos: number;
  isCurrentVideo: boolean;
  isSelected: boolean;
  onPlay: () => void;
  onToggleSelect: () => void;
  onRemoved: () => void;
}

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatViewCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K views`;
  return `${count} views`;
};

export function CustomPlaylistVideoCard({
  video,
  index,
  playlistId,
  totalVideos,
  isCurrentVideo,
  isSelected,
  onPlay,
  onToggleSelect,
  onRemoved,
}: CustomPlaylistVideoCardProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const isDownloaded = video.downloadStatus === "completed" && video.downloadFilePath;
  const hideNoThumb =
    typeof video.thumbnailUrl === "string" && video.thumbnailUrl.includes("no_thumbnail");

  const removeVideoMutation = useMutation({
    mutationFn: () =>
      trpcClient.customPlaylists.removeVideo.mutate({
        playlistId,
        videoId: video.videoId,
      }),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["customPlaylists"] });
        queryClient.invalidateQueries({ queryKey: ["customPlaylist-details", playlistId] });
        toast.success("Video removed from playlist");
        onRemoved();
      } else if ("message" in res) {
        toast.error(res.message ?? "Failed to remove video");
      } else {
        toast.error("Failed to remove video");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove video"),
  });

  const reorderMutation = useMutation({
    mutationFn: (direction: "up" | "down") =>
      trpcClient.customPlaylists.reorderVideos.mutate({
        playlistId,
        videoId: video.videoId,
        direction,
      }),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["customPlaylist-details", playlistId] });
      } else if ("message" in res) {
        toast.error(res.message ?? "Failed to reorder video");
      } else {
        toast.error("Failed to reorder video");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to reorder video"),
  });

  const canMoveUp = index > 0;
  const canMoveDown = index < totalVideos - 1;

  return (
    <div
      className={cn(
        "group cursor-pointer overflow-hidden rounded-xl bg-card transition-all duration-200",
        isCurrentVideo && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isSelected &&
          !isCurrentVideo &&
          "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
        !isCurrentVideo && !isSelected && "hover:bg-accent"
      )}
      onClick={onPlay}
    >
      {/* Thumbnail */}
      <div className="relative">
        {hideNoThumb ? (
          <div className="flex aspect-video w-full items-center justify-center bg-muted">
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
        ) : (
          <Thumbnail
            thumbnailPath={video.thumbnailPath}
            thumbnailUrl={video.thumbnailUrl}
            alt={video.title}
            className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-105"
            fallbackIcon={<Video className="h-8 w-8 text-muted-foreground" />}
          />
        )}

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/40">
          <div className="scale-0 rounded-full bg-primary p-3 text-primary-foreground shadow-lg transition-transform duration-200 group-hover:scale-100">
            <Play className="h-5 w-5" fill="currentColor" />
          </div>
        </div>

        {/* Episode number badge */}
        <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          {index + 1}
        </div>

        {/* Duration badge */}
        {typeof video.durationSeconds === "number" && (
          <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            {formatDuration(video.durationSeconds)}
          </div>
        )}

        {/* Current video indicator */}
        {isCurrentVideo && (
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground"></span>
            </span>
            Now Playing
          </div>
        )}

        {/* Downloaded indicator */}
        {isDownloaded && !isCurrentVideo && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white shadow-lg">
            <Check className="h-3 w-3" />
            Saved
          </div>
        )}

        {/* Action buttons - always show for custom playlists */}
        <div
          className={cn(
            "absolute right-2 top-2 flex items-center gap-1 transition-opacity duration-200",
            "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Selection checkbox for non-downloaded videos */}
          {!isDownloaded && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              className="h-5 w-5 border-2 border-white bg-black/50 shadow-lg data-[state=checked]:border-primary data-[state=checked]:bg-primary"
            />
          )}

          {/* More actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 bg-black/50 text-white hover:bg-black/70 hover:text-white"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => reorderMutation.mutate("up")}
                disabled={!canMoveUp || reorderMutation.isPending}
              >
                <ChevronUp className="mr-2 h-4 w-4" />
                Move Up
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => reorderMutation.mutate("down")}
                disabled={!canMoveDown || reorderMutation.isPending}
              >
                <ChevronDown className="mr-2 h-4 w-4" />
                Move Down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => removeVideoMutation.mutate()}
                disabled={removeVideoMutation.isPending}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove from Playlist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-primary">
          {video.title}
        </h3>
        {typeof video.viewCount === "number" && (
          <p className="mt-1.5 text-xs text-muted-foreground">{formatViewCount(video.viewCount)}</p>
        )}
      </div>
    </div>
  );
}
