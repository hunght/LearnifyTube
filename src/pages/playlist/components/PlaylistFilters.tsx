import React from "react";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = "all" | "downloaded" | "not-downloaded";
export type ViewMode = "grid" | "list";

interface PlaylistFiltersProps {
  filter: FilterOption;
  viewMode: ViewMode;
  totalCount: number;
  downloadedCount: number;
  notDownloadedCount: number;
  onFilterChange: (filter: FilterOption) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export function PlaylistFilters({
  filter,
  viewMode,
  totalCount,
  downloadedCount,
  notDownloadedCount,
  onFilterChange,
  onViewModeChange,
}: PlaylistFiltersProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
        <FilterTab
          active={filter === "all"}
          onClick={() => onFilterChange("all")}
          count={totalCount}
        >
          All
        </FilterTab>
        <FilterTab
          active={filter === "downloaded"}
          onClick={() => onFilterChange("downloaded")}
          count={downloadedCount}
        >
          Saved
        </FilterTab>
        <FilterTab
          active={filter === "not-downloaded"}
          onClick={() => onFilterChange("not-downloaded")}
          count={notDownloadedCount}
        >
          Not Saved
        </FilterTab>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
        <Button
          variant={viewMode === "grid" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onViewModeChange("grid")}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "list" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onViewModeChange("list")}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface FilterTabProps {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}

function FilterTab({ active, onClick, count, children }: FilterTabProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
          active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function PlaylistEmptyState({ filter }: { filter: FilterOption }): React.JSX.Element {
  const messages = {
    all: {
      title: "No videos in this playlist",
      description: "This playlist appears to be empty. Try refreshing to load the latest content.",
    },
    downloaded: {
      title: "No saved videos yet",
      description: "Download videos from this playlist to watch them offline.",
    },
    "not-downloaded": {
      title: "All videos are saved",
      description: "Great! You've downloaded all videos in this playlist.",
    },
  };

  const { title, description } = messages[filter];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <Filter className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
