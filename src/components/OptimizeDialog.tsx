import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wand2, HardDrive, TrendingDown, AlertCircle } from "lucide-react";
import { ESTIMATED_COMPRESSION_RATIO } from "@/services/optimization-queue/config";

type TargetResolution = "original" | "1080p" | "720p" | "480p";

interface VideoToOptimize {
  videoId: string;
  title: string;
  fileSizeBytes: number | null;
}

interface OptimizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videos: VideoToOptimize[];
  onConfirm: (resolution: TargetResolution) => void;
  isLoading?: boolean;
  ffmpegAvailable?: boolean;
}

const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const resolutionOptions: Array<{ value: TargetResolution; label: string; description: string }> = [
  {
    value: "original",
    label: "Keep Original Resolution",
    description: "Re-encode to H.264 without changing resolution (~30% size reduction)",
  },
  {
    value: "1080p",
    label: "1080p (Full HD)",
    description: "Downscale to 1080p (~50% size reduction)",
  },
  {
    value: "720p",
    label: "720p (HD)",
    description: "Downscale to 720p (~65% size reduction)",
  },
  {
    value: "480p",
    label: "480p (SD)",
    description: "Downscale to 480p (~80% size reduction)",
  },
];

export function OptimizeDialog({
  open,
  onOpenChange,
  videos,
  onConfirm,
  isLoading = false,
  ffmpegAvailable = true,
}: OptimizeDialogProps): React.JSX.Element {
  const [selectedResolution, setSelectedResolution] = useState<TargetResolution>("720p");

  const totalSize = useMemo(() => {
    return videos.reduce((sum, v) => sum + (v.fileSizeBytes || 0), 0);
  }, [videos]);

  const estimatedSize = useMemo(() => {
    const ratio = ESTIMATED_COMPRESSION_RATIO[selectedResolution];
    return Math.round(totalSize * ratio);
  }, [totalSize, selectedResolution]);

  const estimatedSavings = totalSize - estimatedSize;
  const savingsPercent = totalSize > 0 ? Math.round((1 - estimatedSize / totalSize) * 100) : 0;

  const handleConfirm = (): void => {
    onConfirm(selectedResolution);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Optimize Video{videos.length > 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Convert {videos.length === 1 ? "this video" : `${videos.length} videos`} to H.264/MP4
            format for reduced storage size.
          </DialogDescription>
        </DialogHeader>

        {!ffmpegAvailable && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-destructive">FFmpeg not available</p>
              <p className="text-muted-foreground">
                Video optimization requires FFmpeg. Please install it first.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Video summary */}
          <div className="rounded-md bg-muted p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {videos.length === 1 ? "Video" : "Videos"}:
              </span>
              <span className="font-medium">{videos.length}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5" />
                Current Size:
              </span>
              <span className="font-medium">{formatBytes(totalSize)}</span>
            </div>
          </div>

          {/* Resolution selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Resolution</label>
            <Select
              value={selectedResolution}
              onValueChange={(value) => {
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                setSelectedResolution(value as TargetResolution);
              }}
              disabled={!ffmpegAvailable}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select resolution" />
              </SelectTrigger>
              <SelectContent>
                {resolutionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Estimated savings */}
          <div className="rounded-md border border-green-500/20 bg-green-500/10 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <TrendingDown className="h-4 w-4" />
                Estimated Size:
              </span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {formatBytes(estimatedSize)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Estimated Savings:</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {formatBytes(estimatedSavings)} ({savingsPercent}%)
              </span>
            </div>
          </div>

          {/* Warning about single video title */}
          {videos.length === 1 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Video:</span> {videos[0].title}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !ffmpegAvailable || videos.length === 0}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Starting...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Optimize
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
