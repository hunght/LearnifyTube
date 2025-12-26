import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

export default function PlaylistsPage(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(100);

  const playlistsQuery = useQuery({
    queryKey: ["playlists", "all", limit],
    queryFn: () => trpcClient.playlists.listAll.query({ limit }),
    refetchOnWindowFocus: false,
  });

  const updatePlaylistViewMutation = useMutation({
    mutationFn: (playlistId: string) => trpcClient.playlists.updateView.mutate({ playlistId }),
  });

  const filteredPlaylists = useMemo(() => {
    if (!playlistsQuery.data) return [];
    if (!searchQuery.trim()) return playlistsQuery.data;

    const query = searchQuery.toLowerCase();
    return playlistsQuery.data.filter(
      (playlist) =>
        playlist.title.toLowerCase().includes(query) ||
        playlist.channelTitle?.toLowerCase().includes(query)
    );
  }, [playlistsQuery.data, searchQuery]);

  const handleRefresh = (): void => {
    playlistsQuery.refetch();
  };

  const handlePlaylistClick = (playlistId: string): void => {
    updatePlaylistViewMutation.mutate(playlistId);
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${seconds}s`;
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Playlists</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search playlists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
              Clear
            </Button>
          )}
          <Button
            onClick={handleRefresh}
            disabled={playlistsQuery.isRefetching}
            size="sm"
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${playlistsQuery.isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              All Playlists {filteredPlaylists.length > 0 && `(${filteredPlaylists.length})`}
            </CardTitle>
            {playlistsQuery.data && playlistsQuery.data.length >= limit && (
              <Button variant="outline" size="sm" onClick={() => setLimit((prev) => prev + 50)}>
                Load More
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {playlistsQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="aspect-video w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : filteredPlaylists.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPlaylists.map((playlist) => {
                const hasWatchHistory = (playlist.viewCount ?? 0) > 0;
                const progress =
                  playlist.itemCount && playlist.currentVideoIndex
                    ? Math.round((playlist.currentVideoIndex / playlist.itemCount) * 100)
                    : 0;

                return (
                  <Link
                    key={playlist.playlistId}
                    to="/playlist"
                    search={{ playlistId: playlist.playlistId }}
                    onClick={() => handlePlaylistClick(playlist.playlistId)}
                    className="group cursor-pointer space-y-2 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    {/* Thumbnail */}
                    <div className="relative">
                      <Thumbnail
                        thumbnailPath={playlist.thumbnailPath}
                        thumbnailUrl={playlist.thumbnailUrl}
                        alt={playlist.title}
                        className="aspect-video w-full rounded object-cover"
                      />
                      {playlist.itemCount && (
                        <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white">
                          {playlist.itemCount} videos
                        </div>
                      )}
                      {progress > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="space-y-1">
                      <div className="line-clamp-2 text-sm font-medium">{playlist.title}</div>
                      {playlist.channelTitle && (
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {playlist.channelTitle}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex gap-2">
                          {hasWatchHistory && progress > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {progress}%
                            </Badge>
                          )}
                          {playlist.lastFetchedAt && (
                            <span>{new Date(playlist.lastFetchedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : searchQuery ? (
            <div className="py-8 text-center text-muted-foreground">
              No playlists found matching "{searchQuery}"
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No playlists yet. Playlists from channels will appear here.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Card */}
      {playlistsQuery.data && playlistsQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Playlists</p>
                <p className="text-2xl font-bold">{playlistsQuery.data.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Videos</p>
                <p className="text-2xl font-bold">
                  {playlistsQuery.data.reduce((sum, pl) => sum + (pl.itemCount || 0), 0)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Watched Playlists</p>
                <p className="text-2xl font-bold">
                  {playlistsQuery.data.filter((pl) => (pl.viewCount ?? 0) > 0).length}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Watch Time</p>
                <p className="text-2xl font-bold">
                  {formatDuration(
                    playlistsQuery.data.reduce(
                      (sum, pl) => sum + (pl.totalWatchTimeSeconds || 0),
                      0
                    )
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
