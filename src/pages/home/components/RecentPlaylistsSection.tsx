import React from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListVideo, Clock } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

type Playlist = {
  playlistId: string;
  title: string;
  thumbnailUrl: string | null;
  thumbnailPath: string | null;
  channelTitle: string | null;
  itemCount: number | null;
  lastViewedAt: number | null;
};

type RecentPlaylistsSectionProps = {
  playlists: Playlist[];
  isLoading?: boolean;
};

export function RecentPlaylistsSection({
  playlists,
  isLoading,
}: RecentPlaylistsSectionProps): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListVideo className="h-5 w-5 text-primary" />
            Recent Playlists
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-64 flex-shrink-0">
                <div className="aspect-video w-full animate-pulse rounded-lg bg-muted" />
                <div className="mt-2 space-y-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (playlists.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListVideo className="h-5 w-5 text-primary" />
            Recent Playlists
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted p-4">
              <ListVideo className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">No playlists yet</p>
              <p className="text-sm text-muted-foreground">
                Add YouTube playlists to organize your learning
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListVideo className="h-5 w-5 text-primary" />
          Recent Playlists
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {playlists.map((playlist) => (
            <PlaylistCard key={playlist.playlistId} playlist={playlist} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PlaylistCard({ playlist }: { playlist: Playlist }): React.JSX.Element {
  return (
    <Link
      to="/playlist"
      search={{ playlistId: playlist.playlistId, type: undefined }}
      className="group w-64 flex-shrink-0"
    >
      <div className="relative overflow-hidden rounded-lg">
        <Thumbnail
          thumbnailPath={playlist.thumbnailPath}
          thumbnailUrl={playlist.thumbnailUrl}
          alt={playlist.title}
          className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
          fallbackIcon={<ListVideo className="h-8 w-8 text-muted-foreground" />}
        />

        {/* Video count badge */}
        {playlist.itemCount !== null && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
            <ListVideo className="h-3 w-3" />
            {playlist.itemCount} videos
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1">
        <h4 className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-primary">
          {playlist.title}
        </h4>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {playlist.channelTitle ?? "Playlist"}
        </p>
      </div>
    </Link>
  );
}
