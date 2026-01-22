import React, { useState, useRef, useCallback, useEffect, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";

interface ResizablePanelProps extends React.ComponentProps<"div"> {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  side?: "left" | "right";
  onWidthChange?: (width: number) => void;
}

export const ResizablePanel = React.forwardRef<HTMLDivElement, ResizablePanelProps>(
  (
    {
      defaultWidth = 300,
      minWidth = 200,
      maxWidth = 600,
      side = "right",
      className,
      children,
      onWidthChange,
      ...props
    },
    ref
  ) => {
    const [width, setWidth] = useState(defaultWidth);
    const [isResizing, setIsResizing] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => panelRef.current!);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
    }, []);

    useEffect(() => {
      if (!isResizing) return;

      const handleMouseMove = (e: MouseEvent) => {
        if (!panelRef.current) return;

        const container = panelRef.current.parentElement;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        let newWidth: number;

        if (side === "right") {
          newWidth = containerRect.right - e.clientX;
        } else {
          newWidth = e.clientX - containerRect.left;
        }

        // Constrain width
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        setWidth(newWidth);
        onWidthChange?.(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }, [isResizing, side, minWidth, maxWidth, onWidthChange]);

    return (
      <div
        ref={panelRef}
        className={cn("relative flex shrink-0 flex-col overflow-hidden", className)}
        style={{ width: `${width}px`, maxWidth: `${maxWidth}px` }}
        {...props}
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute inset-y-0 z-30 w-1 cursor-col-resize transition-colors hover:bg-primary/30",
            side === "right" ? "left-0" : "right-0",
            isResizing && "bg-primary/50"
          )}
        >
          <div className="absolute inset-y-0 -left-1 w-3" />
        </div>

        {children}
      </div>
    );
  }
);

ResizablePanel.displayName = "ResizablePanel";
