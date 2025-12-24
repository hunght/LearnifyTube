import * as React from "react";
import { useAtom, useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  rightSidebarOpenAtom,
  rightSidebarContentAtom,
  annotationsSidebarDataAtom,
} from "@/context/rightSidebar";
import { DownloadQueueSidebar } from "@/components/DownloadQueueSidebar";
import { AnnotationsSidebar } from "@/components/AnnotationsSidebar";
import { AISummarySidebar } from "@/components/AISummarySidebar";
import { QuizSidebar } from "@/components/QuizSidebar";
import { Sparkles, StickyNote, Brain } from "lucide-react";

export function AppRightSidebar({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element | null {
  const [open, setOpen] = useAtom(rightSidebarOpenAtom);
  const [content, setContent] = useAtom(rightSidebarContentAtom);
  const annotationsData = useAtomValue(annotationsSidebarDataAtom);
  const isMobile = useIsMobile();

  if (!open) return null;

  // When we have video data (annotations mode or ai-summary), show tabbed interface
  const showVideoSidebar =
    annotationsData &&
    (content === "annotations" || content === "ai-summary" || content === "quiz");

  const sidebarContent = (
    <div className="flex h-full flex-col p-2">
      {showVideoSidebar ? (
        <>
          {/* Tab navigation for video-related sidebars */}
          <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setContent("annotations")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                content === "annotations"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              )}
            >
              <StickyNote className="h-4 w-4" />
              Notes
            </button>
            <button
              onClick={() => setContent("ai-summary")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                content === "ai-summary"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              )}
            >
              <Sparkles className="h-4 w-4" />
              AI Summary
            </button>
            <button
              onClick={() => setContent("quiz")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                content === "quiz"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              )}
            >
              <Brain className="h-4 w-4" />
              Quiz
            </button>
          </div>

          {/* Content based on active tab */}
          {content === "annotations" ? (
            <AnnotationsSidebar
              videoId={annotationsData.videoId}
              videoRef={annotationsData.videoRef}
              videoTitle={annotationsData.videoTitle}
              currentTime={annotationsData.currentTime}
            />
          ) : content === "ai-summary" ? (
            <AISummarySidebar
              videoId={annotationsData.videoId}
              videoRef={annotationsData.videoRef}
              videoTitle={annotationsData.videoTitle}
              videoDescription={annotationsData.videoDescription}
            />
          ) : content === "quiz" ? (
            <QuizSidebar
              videoId={annotationsData.videoId}
              videoRef={annotationsData.videoRef}
              videoTitle={annotationsData.videoTitle}
            />
          ) : null}
        </>
      ) : (
        <DownloadQueueSidebar />
      )}
    </div>
  );

  // On mobile, show as overlay sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            "w-[85vw] max-w-md border-l border-primary/20 bg-white/95 p-0 backdrop-blur-sm dark:border-primary/10 dark:bg-gray-900/95",
            className
          )}
        >
          {sidebarContent}
        </SheetContent>
      </Sheet>
    );
  }

  // On desktop, show as resizable panel
  return (
    <ResizablePanel
      side="right"
      defaultWidth={320}
      minWidth={250}
      maxWidth={500}
      className={cn(
        "border-l border-primary/20 bg-white/80 backdrop-blur-sm dark:border-primary/10 dark:bg-gray-900/80",
        className
      )}
      {...props}
    >
      {sidebarContent}
    </ResizablePanel>
  );
}
