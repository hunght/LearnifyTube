import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer } from "@/components/ui/page-container";
import { RefreshCw, Search, Plus, Youtube, FolderHeart } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";
import { CustomPlaylistCard } from "@/components/playlists/CustomPlaylistCard";
import { CreatePlaylistDialog } from "@/components/playlists/CreatePlaylistDialog";

type TabType = "all" | "youtube" | "custom";

export default function PlaylistsPage(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(100);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // YouTube playlists query
  const youtubePlaylistsQuery = useQuery({
    queryKey: ["playlists", "all", limit],
    queryFn: () => trpcClient.playlists.listAll.query({ limit }),
    refetchOnWindowFocus: false,
  });

  // Custom playlists query
  const customPlaylistsQuery = useQuery({
    queryKey: ["customPlaylists", "all"],
    queryFn: () => trpcClient.customPlaylists.listAll.query(),
    refetchOnWindowFocus: false,
  });

  const updateYoutubePlaylistViewMutation = useMutation({
    mutationFn: (playlistId: string) => trpcClient.playlists.updateView.mutate({ playlistId }),
  });

  const updateCustomPlaylistViewMutation = useMutation({
    mutationFn: (playlistId: string) =>
      trpcClient.customPlaylists.updateView.mutate({ playlistId }),
  });

  // Filter and combine playlists based on active tab
  const filteredYoutubePlaylists = useMemo(() => {
    if (!youtubePlaylistsQuery.data) return [];
    if (!searchQuery.trim()) return youtubePlaylistsQuery.data;

    const query = searchQuery.toLowerCase();
    return youtubePlaylistsQuery.data.filter(
      (playlist) =>
        playlist.title.toLowerCase().includes(query) ||
        playlist.channelTitle?.toLowerCase().includes(query)
    );
  }, [youtubePlaylistsQuery.data, searchQuery]);

  const filteredCustomPlaylists = useMemo(() => {
    if (!customPlaylistsQuery.data) return [];
    if (!searchQuery.trim()) return customPlaylistsQuery.data;

    const query = searchQuery.toLowerCase();
    return customPlaylistsQuery.data.filter(
      (playlist) =>
        playlist.name.toLowerCase().includes(query) ||
        playlist.description?.toLowerCase().includes(query)
    );
  }, [customPlaylistsQuery.data, searchQuery]);

  // Determine which playlists to show based on tab
  const { youtubePlaylists, customPlaylists } = useMemo(() => {
    switch (activeTab) {
      case "youtube":
        return { youtubePlaylists: filteredYoutubePlaylists, customPlaylists: [] };
      case "custom":
        return { youtubePlaylists: [], customPlaylists: filteredCustomPlaylists };
      default:
        return {
          youtubePlaylists: filteredYoutubePlaylists,
          customPlaylists: filteredCustomPlaylists,
        };
    }
  }, [activeTab, filteredYoutubePlaylists, filteredCustomPlaylists]);

  const totalCount = youtubePlaylists.length + customPlaylists.length;

  const handleRefresh = (): void => {
    youtubePlaylistsQuery.refetch();
    customPlaylistsQuery.refetch();
  };

  const handleYoutubePlaylistClick = (playlistId: string): void => {
    updateYoutubePlaylistViewMutation.mutate(playlistId);
  };

  const handleCustomPlaylistClick = (playlistId: string): void => {
    updateCustomPlaylistViewMutation.mutate(playlistId);
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${seconds}s`;
  };

  const isLoading = youtubePlaylistsQuery.isLoading || customPlaylistsQuery.isLoading;
  const isRefetching = youtubePlaylistsQuery.isRefetching || customPlaylistsQuery.isRefetching;

  return (
    <PageContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold sm:text-3xl">Playlists</h1>
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
            onClick={() => setShowCreateDialog(true)}
            size="sm"
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Playlist
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={isRefetching}
            size="sm"
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              {activeTab === "all" && "All Playlists"}
              {activeTab === "youtube" && "YouTube Playlists"}
              {activeTab === "custom" && "My Playlists"}
              {totalCount > 0 && ` (${totalCount})`}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Tabs
                value={activeTab}
                onValueChange={(v: string) => {
                  if (v === "all" || v === "youtube" || v === "custom") {
                    setActiveTab(v);
                  }
                }}
              >
                <TabsList>
                  <TabsTrigger value="all" className="gap-1.5">
                    All
                    {(youtubePlaylistsQuery.data?.length ?? 0) +
                      (customPlaylistsQuery.data?.length ?? 0) >
                      0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                        {(youtubePlaylistsQuery.data?.length ?? 0) +
                          (customPlaylistsQuery.data?.length ?? 0)}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="youtube" className="gap-1.5">
                    <Youtube className="h-3.5 w-3.5" />
                    YouTube
                    {(youtubePlaylistsQuery.data?.length ?? 0) > 0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                        {youtubePlaylistsQuery.data?.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="custom" className="gap-1.5">
                    <FolderHeart className="h-3.5 w-3.5" />
                    My Playlists
                    {(customPlaylistsQuery.data?.length ?? 0) > 0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                        {customPlaylistsQuery.data?.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {youtubePlaylistsQuery.data && youtubePlaylistsQuery.data.length >= limit && (
                <Button variant="outline" size="sm" onClick={() => setLimit((prev) => prev + 50)}>
                  Load More
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="aspect-video w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : totalCount > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Custom Playlists first */}
              {customPlaylists.map((playlist) => (
                <CustomPlaylistCard
                  key={`custom-${playlist.id}`}
                  playlist={playlist}
                  onPlaylistClick={handleCustomPlaylistClick}
                />
              ))}

              {/* YouTube Playlists */}
              {youtubePlaylists.map((playlist) => {
                const hasWatchHistory = (playlist.viewCount ?? 0) > 0;
                const progress =
                  playlist.itemCount && playlist.currentVideoIndex
                    ? Math.round((playlist.currentVideoIndex / playlist.itemCount) * 100)
                    : 0;

                return (
                  <Link
                    key={`youtube-${playlist.playlistId}`}
                    to="/playlist"
                    search={{ playlistId: playlist.playlistId, type: undefined }}
                    onClick={() => handleYoutubePlaylistClick(playlist.playlistId)}
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
          ) : activeTab === "custom" ? (
            <div className="py-8 text-center text-muted-foreground">
              <FolderHeart className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
              <p>No custom playlists yet.</p>
              <p className="text-sm">Create one to start organizing your videos.</p>
              <Button onClick={() => setShowCreateDialog(true)} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Create Playlist
              </Button>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No playlists yet. Playlists from channels will appear here.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Card */}
      {((youtubePlaylistsQuery.data && youtubePlaylistsQuery.data.length > 0) ||
        (customPlaylistsQuery.data && customPlaylistsQuery.data.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Playlists</p>
                <p className="text-2xl font-bold">
                  {(youtubePlaylistsQuery.data?.length ?? 0) +
                    (customPlaylistsQuery.data?.length ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">My Playlists</p>
                <p className="text-2xl font-bold">{customPlaylistsQuery.data?.length ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Videos</p>
                <p className="text-2xl font-bold">
                  {(youtubePlaylistsQuery.data?.reduce((sum, pl) => sum + (pl.itemCount || 0), 0) ??
                    0) +
                    (customPlaylistsQuery.data?.reduce((sum, pl) => sum + (pl.itemCount || 0), 0) ??
                      0)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Watched Playlists</p>
                <p className="text-2xl font-bold">
                  {(youtubePlaylistsQuery.data?.filter((pl) => (pl.viewCount ?? 0) > 0).length ??
                    0) +
                    (customPlaylistsQuery.data?.filter((pl) => (pl.viewCount ?? 0) > 0).length ??
                      0)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Watch Time</p>
                <p className="text-2xl font-bold">
                  {formatDuration(
                    (youtubePlaylistsQuery.data?.reduce(
                      (sum, pl) => sum + (pl.totalWatchTimeSeconds || 0),
                      0
                    ) ?? 0) +
                      (customPlaylistsQuery.data?.reduce(
                        (sum, pl) => sum + (pl.totalWatchTimeSeconds || 0),
                        0
                      ) ?? 0)
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <CreatePlaylistDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </PageContainer>
  );
}
