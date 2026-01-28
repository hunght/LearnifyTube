import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/ui/page-container";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw,
  Search,
  Plus,
  FolderHeart,
  LayoutGrid,
  LayoutList,
  MoreVertical,
  Pencil,
  Trash2,
  Video,
  Heart,
} from "lucide-react";
import Thumbnail from "@/components/Thumbnail";
import { CustomPlaylistCard } from "@/components/playlists/CustomPlaylistCard";
import { CreatePlaylistDialog } from "@/components/playlists/CreatePlaylistDialog";
import { EditPlaylistDialog } from "@/components/playlists/EditPlaylistDialog";
import { FavoritesSection } from "./components/FavoritesSection";

type ViewMode = "list" | "grid";

export default function MyPlaylistsPage(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeTab, setActiveTab] = useState<"playlists" | "favorites">("playlists");

  const customPlaylistsQuery = useQuery({
    queryKey: ["customPlaylists", "all"],
    queryFn: () => trpcClient.customPlaylists.listAll.query(),
    refetchOnWindowFocus: false,
  });

  const filteredPlaylists = useMemo(() => {
    if (!customPlaylistsQuery.data) return [];
    if (!searchQuery.trim()) return customPlaylistsQuery.data;

    const query = searchQuery.toLowerCase();
    return customPlaylistsQuery.data.filter(
      (playlist) =>
        playlist.name.toLowerCase().includes(query) ||
        playlist.description?.toLowerCase().includes(query)
    );
  }, [customPlaylistsQuery.data, searchQuery]);

  const handleRefresh = (): void => {
    customPlaylistsQuery.refetch();
  };

  const isLoading = customPlaylistsQuery.isLoading;
  const isRefetching = customPlaylistsQuery.isRefetching;

  return (
    <PageContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold sm:text-3xl">My Lists</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={activeTab === "playlists" ? "Search lists..." : "Search favorites..."}
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
          <div className="flex items-center rounded-md border">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          {activeTab === "playlists" && (
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create List
            </Button>
          )}
          <Button
            onClick={handleRefresh}
            disabled={isRefetching}
            size="sm"
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "playlists" || value === "favorites") {
                setActiveTab(value);
                setSearchQuery("");
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="playlists" className="gap-2">
                <FolderHeart className="h-4 w-4" />
                My Playlists
                {filteredPlaylists.length > 0 && ` (${filteredPlaylists.length})`}
              </TabsTrigger>
              <TabsTrigger value="favorites" className="gap-2">
                <Heart className="h-4 w-4" />
                Favorites
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {activeTab === "playlists" ? (
            isLoading ? (
              <LoadingSkeleton viewMode={viewMode} />
            ) : filteredPlaylists.length > 0 ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredPlaylists.map((playlist) => (
                    <CustomPlaylistCard key={playlist.id} playlist={playlist} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPlaylists.map((playlist) => (
                    <PlaylistListItem key={playlist.id} playlist={playlist} />
                  ))}
                </div>
              )
            ) : searchQuery ? (
              <div className="py-8 text-center text-muted-foreground">
                No lists found matching "{searchQuery}"
              </div>
            ) : (
              <EmptyState onCreateClick={() => setShowCreateDialog(true)} />
            )
          ) : (
            <FavoritesSection viewMode={viewMode} searchQuery={searchQuery} />
          )}
        </CardContent>
      </Card>

      <CreatePlaylistDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </PageContainer>
  );
}

function LoadingSkeleton({ viewMode }: { viewMode: ViewMode }): React.JSX.Element {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <div className="aspect-video w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border p-3">
          <div className="h-16 w-28 animate-pulse rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-12 w-12 animate-pulse rounded bg-muted" />
            <div className="h-12 w-12 animate-pulse rounded bg-muted" />
            <div className="h-12 w-12 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }): React.JSX.Element {
  return (
    <div className="py-8 text-center text-muted-foreground">
      <FolderHeart className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
      <p>No lists yet.</p>
      <p className="text-sm">Create one to start organizing your videos.</p>
      <Button onClick={onCreateClick} className="mt-4 gap-2">
        <Plus className="h-4 w-4" />
        Create List
      </Button>
    </div>
  );
}

type PlaylistListItemProps = {
  playlist: Awaited<ReturnType<typeof trpcClient.customPlaylists.listAll.query>>[number];
};

function PlaylistListItem({ playlist }: PlaylistListItemProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => trpcClient.customPlaylists.delete.mutate({ playlistId: playlist.id }),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["customPlaylists"] });
        toast.success(`List "${playlist.name}" deleted`);
      } else if ("message" in res) {
        toast.error(res.message ?? "Failed to delete list");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete list"),
  });

  const handleDelete = (): void => {
    deleteMutation.mutate();
    setShowDeleteDialog(false);
  };

  const progress =
    playlist.itemCount && playlist.currentVideoIndex
      ? Math.round((playlist.currentVideoIndex / playlist.itemCount) * 100)
      : 0;

  return (
    <>
      <div className="group flex items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/50">
        {/* Main thumbnail */}
        <Link
          to="/playlist"
          search={{ playlistId: playlist.id, type: "custom" }}
          className="relative h-16 w-28 shrink-0 overflow-hidden rounded"
        >
          <Thumbnail
            thumbnailPath={playlist.thumbnailPath}
            thumbnailUrl={playlist.thumbnailUrl}
            alt={playlist.name}
            className="h-full w-full object-cover"
            fallbackIcon={<FolderHeart className="h-6 w-6 text-muted-foreground" />}
          />
          {progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          )}
        </Link>

        {/* Info */}
        <Link
          to="/playlist"
          search={{ playlistId: playlist.id, type: "custom" }}
          className="min-w-0 flex-1"
        >
          <h3 className="truncate font-medium">{playlist.name}</h3>
          <p className="text-sm text-muted-foreground">
            {playlist.itemCount ?? 0} videos
            {progress > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {progress}%
              </Badge>
            )}
          </p>
        </Link>

        {/* Preview thumbnails */}
        <div className="hidden items-center gap-1 sm:flex">
          {playlist.previewThumbnails.slice(0, 3).map((thumb, idx) => (
            <div
              key={thumb.videoId}
              className="relative h-12 w-20 overflow-hidden rounded bg-muted"
              title={thumb.title}
            >
              <Thumbnail
                thumbnailPath={thumb.thumbnailPath}
                thumbnailUrl={thumb.thumbnailUrl}
                alt={thumb.title}
                className="h-full w-full object-cover"
                fallbackIcon={<Video className="h-4 w-4 text-muted-foreground" />}
              />
              {idx === 2 && (playlist.itemCount ?? 0) > 3 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
                  +{(playlist.itemCount ?? 0) - 3}
                </div>
              )}
            </div>
          ))}
          {playlist.previewThumbnails.length === 0 && (
            <div className="flex h-12 w-20 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
              No videos
            </div>
          )}
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EditPlaylistDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        playlistId={playlist.id}
        initialName={playlist.name}
        initialDescription={playlist.description}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{playlist.name}"? This action cannot be undone. The
              videos will not be deleted, only removed from this list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
