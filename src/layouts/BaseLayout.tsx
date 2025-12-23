import React from "react";
import { Toaster } from "@/components/ui/toaster";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppRightSidebar } from "@/components/app-right-sidebar";
import DragWindowRegion from "@/components/DragWindowRegion";
import { HeaderNav } from "@/components/HeaderNav";

type CSSPropertiesWithVars = React.CSSProperties & Record<`--${string}`, string>;

export default function BaseLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const sidebarStyle: CSSPropertiesWithVars = {
    "--header-height": "2.5rem",
  };

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen flex-col">
        {/* Drag region for frameless window */}
        <div className="h-[--header-height] shrink-0">
          <DragWindowRegion title="LearnifyTube" />
        </div>

        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />

          <main className="flex-1 overflow-auto bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10">
            <HeaderNav />
            {children}
          </main>

          <AppRightSidebar />
          <Toaster />
        </div>
      </div>
    </SidebarProvider>
  );
}
