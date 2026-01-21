import React from "react";
import { Progress } from "@/components/ui/progress";

interface VideoProgressIndicatorProps {
  currentTime: number;
  duration: number | null;
  className?: string;
}

export function VideoProgressIndicator({
  currentTime,
  duration,
  className,
}: VideoProgressIndicatorProps): React.JSX.Element | null {
  // Don't render if duration is not available or zero
  if (!duration || duration <= 0) {
    return null;
  }

  const progressPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));
  const isCompleted = progressPercent >= 95; // Consider 95%+ as completed

  // Format time as mm:ss or hh:mm:ss
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Progress
          value={progressPercent}
          className={`h-1.5 flex-1 ${isCompleted ? "[&>div]:bg-green-500" : ""}`}
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        {isCompleted && (
          <span className="shrink-0 text-xs font-medium text-green-600 dark:text-green-400">
            Completed
          </span>
        )}
      </div>
    </div>
  );
}
