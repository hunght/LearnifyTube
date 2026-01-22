import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchDownloadBarProps {
  selectedCount: number;
  totalNotDownloaded: number;
  isDownloading: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDownload: () => void;
  isAllSelected: boolean;
}

export function BatchDownloadBar({
  selectedCount,
  totalNotDownloaded,
  isDownloading,
  onSelectAll,
  onClearSelection,
  onDownload,
  isAllSelected,
}: BatchDownloadBarProps): React.JSX.Element | null {
  if (totalNotDownloaded === 0) {
    return null;
  }

  const hasSelection = selectedCount > 0;

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center justify-between gap-4 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur transition-all duration-300",
        hasSelection && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="select-all-batch"
            checked={isAllSelected && selectedCount > 0}
            onCheckedChange={onSelectAll}
            className="h-5 w-5"
          />
          <label htmlFor="select-all-batch" className="cursor-pointer text-sm font-medium">
            Select all
          </label>
        </div>
        <div className="hidden h-5 w-px bg-border sm:block" />
        <p className="text-sm text-muted-foreground">
          {selectedCount > 0 ? (
            <>
              <span className="font-semibold text-foreground">{selectedCount}</span> of{" "}
              {totalNotDownloaded} selected
            </>
          ) : (
            <>{totalNotDownloaded} videos available to download</>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {hasSelection && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="gap-1.5 text-muted-foreground"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        )}
        <Button
          size="sm"
          onClick={onDownload}
          disabled={!hasSelection || isDownloading}
          className="gap-2"
        >
          {isDownloading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">Adding...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
              {hasSelection && <span>({selectedCount})</span>}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
