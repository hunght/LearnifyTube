import React, { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExternalLink } from "@/components/ExternalLink";
import { PageContainer } from "@/components/ui/page-container";
import { toast } from "sonner";
import { LatestTab, PopularTab, LibraryTab, PlaylistsTab } from "./components";
import { RefreshCw } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

export default function ChannelPage(): React.JSX.Element {
  const search = useSearch({ from: "/channel" });
  const channelId = search.channelId;
  const queryClient = useQueryClient();

  // Track active tab for lazy loading
  const [activeTab, setActiveTab] = useState("latest");

  const { data, isLoading } = useQuery({
    queryKey: ["channel", channelId],
    queryFn: async () => {
      if (!channelId) return null;
      return await trpcClient.ytdlp.getChannelDetails.query({ channelId });
    },
    enabled: !!channelId,
  });

  // Separate query for library videos - fetches directly from DB with download status updates
  // Only show videos that have been downloaded or are in download process
  const libraryQuery = useQuery({
    queryKey: ["channel-library", channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const videos = await trpcClient.ytdlp.getVideosByChannel.query({
        channelId: channelId!,
        limit: 100,
      });
      // Filter to only show videos with download activity
      return videos.filter(
        (v) =>
          v.downloadStatus &&
          ["downloading", "queued", "completed", "paused", "failed"].includes(v.downloadStatus)
      );
    },
    enabled: !!channelId && activeTab === "library", // Only fetch when library tab is active
    refetchInterval: activeTab === "library" ? 3000 : false, // Only poll when tab is active
    staleTime: 0, // Always fetch fresh data to show latest download status
  });

  const addToQueueMutation = useMutation({
    mutationFn: (url: string) => trpcClient.queue.addToQueue.mutate({ urls: [url], priority: 0 }),
  });

  const refreshChannelMutation = useMutation({
    mutationFn: () => trpcClient.ytdlp.refreshChannelInfo.mutate({ channelId: channelId! }),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate and refetch channel data
        queryClient.invalidateQueries({ queryKey: ["channel", channelId] });
        toast.success("Channel information refreshed successfully");
      } else {
        toast.error("Failed to refresh channel information");
      }
    },
    onError: () => {
      toast.error("Failed to refresh channel information");
      // Error already shown to user via toast
    },
  });

  const handleDownloadVideo = async (videoUrl: string, videoTitle: string): Promise<void> => {
    try {
      const result = await addToQueueMutation.mutateAsync(videoUrl);

      if (result.success) {
        toast.success(`Added "${videoTitle}" to download queue`);
        // Invalidate queue status to resume polling and update sidebar
        queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
      } else {
        toast.error(result.message || "Failed to add to queue");
      }
    } catch (err) {
      toast.error("Failed to add video to queue");
      // Error already shown to user via toast
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Loading channel...</p>
      </PageContainer>
    );
  }

  if (!channelId) {
    return (
      <PageContainer>
        <Alert>
          <AlertTitle>Missing channel</AlertTitle>
          <AlertDescription>No channel ID provided.</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (!data || !data.channel) {
    return (
      <PageContainer>
        <Alert>
          <AlertTitle>Channel not found</AlertTitle>
          <AlertDescription>Could not find channel with ID: {channelId}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const { channel } = data;

  return (
    <PageContainer>
      {/* Channel Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            {/* Channel Avatar */}
            <Thumbnail
              thumbnailPath={channel.thumbnailPath}
              thumbnailUrl={channel.thumbnailUrl}
              alt={channel.channelTitle}
              className="h-24 w-24 rounded-full object-cover"
              fallbackIcon={<div className="h-24 w-24 rounded-full bg-muted" />}
            />

            {/* Channel Info */}
            <div className="flex-1 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-2xl font-bold">{channel.channelTitle}</h1>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refreshChannelMutation.mutate()}
                  disabled={refreshChannelMutation.isPending}
                  className="flex items-center gap-2"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshChannelMutation.isPending ? "animate-spin" : ""}`}
                  />
                  {refreshChannelMutation.isPending ? "Refreshing..." : "Refresh Info"}
                </Button>
              </div>

              {channel.channelDescription && (
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {channel.channelDescription}
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {channel.subscriberCount && (
                  <span>{channel.subscriberCount.toLocaleString()} subscribers</span>
                )}
                {libraryQuery.data && libraryQuery.data.length > 0 && (
                  <span>{libraryQuery.data.length} videos in library</span>
                )}
                {channel.customUrl && <span>@{channel.customUrl}</span>}
              </div>

              {channel.channelUrl && (
                <ExternalLink
                  href={channel.channelUrl}
                  className="text-sm text-blue-600"
                  showIcon={true}
                  iconClassName="h-3 w-3"
                >
                  View on YouTube
                </ExternalLink>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Videos and Discovery */}
      <Card>
        <CardHeader>
          <CardTitle>Videos</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="latest" value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="latest">Latest</TabsTrigger>
              <TabsTrigger value="popular">Popular</TabsTrigger>
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="playlists">Playlists</TabsTrigger>
            </TabsList>

            <TabsContent value="latest" className="mt-4">
              <LatestTab
                channelId={channelId!}
                isActive={activeTab === "latest"}
                onDownload={handleDownloadVideo}
              />
            </TabsContent>

            <TabsContent value="popular" className="mt-4">
              <PopularTab
                channelId={channelId!}
                isActive={activeTab === "popular"}
                onDownload={handleDownloadVideo}
              />
            </TabsContent>

            <TabsContent value="library" className="mt-4">
              <LibraryTab
                channelId={channelId!}
                isActive={activeTab === "library"}
                onDownload={handleDownloadVideo}
              />
            </TabsContent>

            <TabsContent value="playlists" className="mt-4">
              <PlaylistsTab channelId={channelId!} isActive={activeTab === "playlists"} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
