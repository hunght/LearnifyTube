/**
 * BackgroundJobsIndicator
 *
 * Shows a status indicator in the header when background jobs are running.
 * Clicking opens a popover with job details.
 */

import React from "react";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { cn } from "@/lib/utils";
import type { BackgroundJob } from "@/services/background-jobs/types";

function JobStatusIcon({ status }: { status: BackgroundJob["status"] }): React.JSX.Element {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "pending":
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatDuration(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return "";
  const end = completedAt ?? Date.now();
  const durationMs = end - startedAt;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function JobItem({ job }: { job: BackgroundJob }): React.JSX.Element {
  const duration = formatDuration(job.startedAt, job.completedAt);

  return (
    <div className="flex items-start gap-2 py-2">
      <JobStatusIcon status={job.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{job.title}</p>
        {job.error && (
          <p className="truncate text-xs text-red-500" title={job.error}>
            {job.error}
          </p>
        )}
        {duration && !job.error && <p className="text-xs text-muted-foreground">{duration}</p>}
      </div>
    </div>
  );
}

export function BackgroundJobsIndicator(): React.JSX.Element | null {
  const { jobs, runningCount, hasActiveJobs, isPanelOpen, setPanelOpen, clearCompleted } =
    useBackgroundJobs();

  // Don't render if no jobs
  if (jobs.length === 0) {
    return null;
  }

  const completedCount = jobs.filter(
    (j) => j.status === "completed" || j.status === "failed"
  ).length;

  return (
    <Popover open={isPanelOpen} onOpenChange={setPanelOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative flex h-8 w-8 items-center justify-center p-0",
            hasActiveJobs && "animate-pulse"
          )}
          title={hasActiveJobs ? `${runningCount} job(s) running` : "Background jobs"}
        >
          {hasActiveJobs ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {hasActiveJobs && runningCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {runningCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Background Jobs</h4>
            {completedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs"
                onClick={clearCompleted}
              >
                Clear completed
              </Button>
            )}
          </div>

          {hasActiveJobs && (
            <p className="text-xs text-muted-foreground">
              You can navigate away - we&apos;ll notify you when done.
            </p>
          )}

          <div className="max-h-64 divide-y overflow-y-auto">
            {jobs.map((job) => (
              <JobItem key={job.id} job={job} />
            ))}
          </div>

          {jobs.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No background jobs</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
