import React from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ArrowLeft } from "lucide-react";
import { BackgroundJobsIndicator } from "@/components/BackgroundJobsIndicator";
import { DownloadQueueIndicator } from "@/components/DownloadQueueIndicator";

export function HeaderNav(): React.JSX.Element {
  const router = useRouter();
  const canGoBack = router.history.length > 1;

  const handleBack = (): void => {
    router.history.back();
  };

  return (
    <div className="sticky top-0 z-10 flex w-full shrink-0 items-center justify-between border-b bg-white/70 px-2 py-1.5 backdrop-blur dark:bg-gray-900/70 sm:px-3">
      <div className="flex min-w-0 items-center gap-1">
        <SidebarTrigger className="h-8 w-8" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={!canGoBack}
          className="flex shrink-0 items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <DownloadQueueIndicator />
        <BackgroundJobsIndicator />
      </div>
    </div>
  );
}
