import React from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Clock, Video } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";

type WatchedVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  thumbnailPath: string | null;
  channelTitle: string;
  durationSeconds: number | null;
  lastPositionSeconds: number | null;
  totalWatchSeconds: number | null;
};

type ContinueWatchingSectionProps = {
  videos: WatchedVideo[];
  isLoading?: boolean;
};

export function ContinueWatchingSection({
  videos,
  isLoading,
}: ContinueWatchingSectionProps): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Play className="h-5 w-5 text-primary" />
            Continue Watching
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

  if (videos.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Play className="h-5 w-5 text-primary" />
            Continue Watching
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted p-4">
              <Video className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">No videos watched yet</p>
              <p className="text-sm text-muted-foreground">
                Start watching videos to see them here
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
          <Play className="h-5 w-5 text-primary" />
          Continue Watching
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {videos.map((video) => (
            <VideoCard key={video.videoId} video={video} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function VideoCard({ video }: { video: WatchedVideo }): React.JSX.Element {
  const progress = calculateProgress(video.lastPositionSeconds, video.durationSeconds);

  return (
    <Link
      to="/player"
      search={{ videoId: video.videoId, playlistId: undefined, playlistIndex: undefined }}
      className="group w-64 flex-shrink-0"
    >
      <div className="relative overflow-hidden rounded-lg">
        <Thumbnail
          thumbnailPath={video.thumbnailPath}
          thumbnailUrl={video.thumbnailUrl}
          alt={video.title}
          className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
          fallbackIcon={<Video className="h-8 w-8 text-muted-foreground" />}
        />

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
          <div className="scale-0 rounded-full bg-primary p-3 text-primary-foreground transition-transform group-hover:scale-100">
            <Play className="h-6 w-6" fill="currentColor" />
          </div>
        </div>

        {/* Duration badge */}
        {video.durationSeconds && (
          <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
            {formatDuration(video.durationSeconds)}
          </div>
        )}

        {/* Progress bar */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1">
        <h4 className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-primary">
          {video.title}
        </h4>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {video.channelTitle}
        </p>
      </div>
    </Link>
  );
}

const calculateProgress = (position: number | null, duration: number | null): number => {
  if (!position || !duration || duration === 0) return 0;
  return Math.min(100, Math.round((position / duration) * 100));
};

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};
