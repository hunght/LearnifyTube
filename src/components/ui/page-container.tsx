import React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Use max-width constraint for very wide screens */
  maxWidth?: boolean;
}

/**
 * Responsive page container that adapts to available space.
 * Use this instead of `container mx-auto` to properly handle sidebar layouts.
 */
export function PageContainer({
  children,
  maxWidth = true,
  className,
  ...props
}: PageContainerProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "w-full space-y-6 px-4 py-4 pb-8 sm:px-6 lg:px-8",
        maxWidth && "mx-auto max-w-7xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
