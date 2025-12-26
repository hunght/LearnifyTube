import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search } from "lucide-react";

export default function ChannelsPage(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(100);

  const channelsQuery = useQuery({
    queryKey: ["ytdlp", "channels", limit],
    queryFn: () => trpcClient.ytdlp.listChannels.query({ limit }),
    refetchOnWindowFocus: false,
  });

  const filteredChannels = useMemo(() => {
    if (!channelsQuery.data) return [];
    if (!searchQuery.trim()) return channelsQuery.data;

    const query = searchQuery.toLowerCase();
    return channelsQuery.data.filter((channel) =>
      channel.channelTitle.toLowerCase().includes(query)
    );
  }, [channelsQuery.data, searchQuery]);

  const handleRefresh = (): void => {
    channelsQuery.refetch();
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Channels</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search channels..."
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
            disabled={channelsQuery.isRefetching}
            size="sm"
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${channelsQuery.isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              All Channels {filteredChannels.length > 0 && `(${filteredChannels.length})`}
            </CardTitle>
            {channelsQuery.data && channelsQuery.data.length >= limit && (
              <Button variant="outline" size="sm" onClick={() => setLimit((prev) => prev + 50)}>
                Load More
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {channelsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredChannels.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredChannels.map((channel) => (
                <Link
                  key={channel.channelId}
                  to="/channel"
                  search={{ channelId: channel.channelId }}
                  className="group rounded-lg border p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex items-start gap-3">
                    {channel.thumbnailUrl ? (
                      <img
                        src={channel.thumbnailUrl}
                        alt={channel.channelTitle}
                        className="h-16 w-16 flex-shrink-0 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                        {channel.channelTitle.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="truncate font-semibold group-hover:text-primary">
                        {channel.channelTitle}
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>
                            {channel.videoCount} {channel.videoCount === 1 ? "video" : "videos"}
                          </span>
                          {channel.subscriberCount && (
                            <>
                              <span>•</span>
                              <span>{channel.subscriberCount.toLocaleString()} subscribers</span>
                            </>
                          )}
                        </div>
                        {channel.lastUpdated && (
                          <span>Updated: {new Date(channel.lastUpdated).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : searchQuery ? (
            <div className="py-8 text-center text-muted-foreground">
              No channels found matching "{searchQuery}"
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No channels yet. Download some videos to see channels here.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Card */}
      {channelsQuery.data && channelsQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Channels</p>
                <p className="text-2xl font-bold">{channelsQuery.data.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Videos</p>
                <p className="text-2xl font-bold">
                  {channelsQuery.data.reduce((sum, ch) => sum + (ch.videoCount || 0), 0)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Avg Videos/Channel</p>
                <p className="text-2xl font-bold">
                  {Math.round(
                    channelsQuery.data.reduce((sum, ch) => sum + (ch.videoCount || 0), 0) /
                      channelsQuery.data.length
                  )}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">With Subscribers</p>
                <p className="text-2xl font-bold">
                  {channelsQuery.data.filter((ch) => ch.subscriberCount).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
