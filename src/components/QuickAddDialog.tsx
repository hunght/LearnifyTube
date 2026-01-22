import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { logger } from "@/helpers/logger";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle2, Loader2, Video, List as ListIcon, Users } from "lucide-react";

type QuickAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const isValidUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
};

const extractPlaylistId = (url: string): string | null => {
  try {
    const u = new URL(url);
    return u.searchParams.get("list");
  } catch {
    return null;
  }
};

const isChannelUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("youtube.com")) return false;
    const pathname = u.pathname;
    return (
      /^\/@[^/]+/.test(pathname) ||
      /^\/channel\/[^/]+/.test(pathname) ||
      /^\/c\/[^/]+/.test(pathname) ||
      /^\/user\/[^/]+/.test(pathname)
    );
  } catch {
    return false;
  }
};

const normalizeChannelUrl = (url: string): string => {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("youtube.com")) return url;
    const pathname = u.pathname;
    let basePath = pathname;

    const atMatch = pathname.match(/^\/@([^/]+)/);
    if (atMatch) {
      basePath = `/@${atMatch[1]}`;
    } else if (/^\/channel\/[^/]+/.test(pathname)) {
      const channelMatch = pathname.match(/^\/channel\/([^/]+)/);
      if (channelMatch) {
        basePath = `/channel/${channelMatch[1]}`;
      }
    } else if (/^\/c\/[^/]+/.test(pathname)) {
      const cMatch = pathname.match(/^\/c\/([^/]+)/);
      if (cMatch) {
        basePath = `/c/${cMatch[1]}`;
      }
    } else if (/^\/user\/[^/]+/.test(pathname)) {
      const userMatch = pathname.match(/^\/user\/([^/]+)/);
      if (userMatch) {
        basePath = `/user/${userMatch[1]}`;
      }
    }

    u.pathname = basePath;
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
};

export function QuickAddDialog({ open, onOpenChange }: QuickAddDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");

  // Reset URL when dialog closes
  useEffect(() => {
    if (!open) {
      setUrl("");
    }
  }, [open]);

  const startMutation = useMutation({
    mutationFn: (u: string) => trpcClient.queue.addToQueue.mutate({ urls: [u] }),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
        toast.success(`Download added to queue (${res.downloadIds.length})`);
        onOpenChange(false);
      } else {
        toast.error(res.message ?? "Failed to start download");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add to queue"),
  });

  const addChannelMutation = useMutation({
    mutationFn: (channelUrl: string) =>
      trpcClient.ytdlp.fetchChannelInfo.mutate({ url: channelUrl }),
    onSuccess: (res) => {
      if (res.channel) {
        queryClient.invalidateQueries({ queryKey: ["ytdlp", "channels"] });
        toast.success(`Channel "${res.channel.channelTitle}" added successfully`);
        onOpenChange(false);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add channel"),
  });

  const canStart = useMemo(
    () => isValidUrl(url) && !startMutation.isPending && !addChannelMutation.isPending,
    [url, startMutation.isPending, addChannelMutation.isPending]
  );

  const isPlaylistUrl = useMemo(() => {
    return isValidUrl(url) && extractPlaylistId(url) !== null;
  }, [url]);

  const isChannelUrlMemo = useMemo(() => {
    return isValidUrl(url) && isChannelUrl(url);
  }, [url]);

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValidUrl(url)) {
      toast.error("Please enter a valid URL");
      return;
    }

    if (isChannelUrl(url)) {
      const normalizedUrl = normalizeChannelUrl(url);
      logger.debug("QuickAdd adding channel", { url, normalizedUrl });
      addChannelMutation.mutate(normalizedUrl);
      return;
    }

    const playlistId = extractPlaylistId(url);
    if (playlistId) {
      logger.debug("QuickAdd navigating to playlist", { url, playlistId });
      navigate({ to: "/playlist", search: { playlistId, type: undefined } });
      onOpenChange(false);
      return;
    }

    logger.debug("QuickAdd start download", { url });
    startMutation.mutate(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Add Video
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pr-10"
                inputMode="url"
                autoFocus
              />
              {isValidUrl(url) && (
                <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Paste any YouTube video, playlist, or channel URL
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canStart} className="gap-2">
              {startMutation.isPending || addChannelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : isChannelUrlMemo ? (
                <>
                  <Users className="h-4 w-4" />
                  <span>Add Channel</span>
                </>
              ) : isPlaylistUrl ? (
                <>
                  <ListIcon className="h-4 w-4" />
                  <span>Open Playlist</span>
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" />
                  <span>Download</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
