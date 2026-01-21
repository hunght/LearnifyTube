import React, { useState, useMemo } from "react";
import {
  Home,
  Clapperboard,
  History,
  Users,
  List,
  Brain,
  BarChart3,
  HardDrive,
  ScrollText,
  Settings,
} from "lucide-react";
import { Link, useMatches } from "@tanstack/react-router";
import { logger } from "@/helpers/logger";
import { cn } from "@/lib/utils";
import { useAtomValue } from "jotai";
import { sidebarPreferencesAtom } from "@/atoms/sidebar-atoms";
import type { SidebarItem } from "@/lib/types/user-preferences";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SidebarThemeToggle } from "@/components/SidebarThemeToggle";
import { MinimizedPlayer } from "@/components/MinimizedPlayer";

// Check if we're in development mode
// In Electron renderer, check window.location - if it's http(s)://, we're in dev mode
const isDevelopment = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  // If loading from http://localhost (dev server), we're in development
  const href = window.location.href;
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return true;
  }

  // Fallback: check for Electron Forge dev server URL global
  // @ts-ignore - MAIN_WINDOW_VITE_DEV_SERVER_URL is a global defined by Electron Forge
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "undefined" && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return true;
  }

  // Last fallback: if NODE_ENV is not explicitly production, assume development
  return process.env.NODE_ENV !== "production";
};

// Sidebar item type
type SidebarItemConfig = {
  id: SidebarItem;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  url: string;
};

// Sidebar groups configuration
const SIDEBAR_GROUPS: Array<{
  label: string;
  items: SidebarItemConfig[];
}> = [
  {
    label: "LEARN",
    items: [
      { id: "home", title: "Home", icon: Home, url: "/" },
      { id: "my-words", title: "Flashcards", icon: Brain, url: "/my-words" },
      { id: "analytics", title: "Analytics", icon: BarChart3, url: "/analytics" },
      { id: "history", title: "History", icon: History, url: "/history" },
    ],
  },
  {
    label: "LIBRARY",
    items: [
      { id: "channels", title: "Channels", icon: Users, url: "/channels" },
      { id: "playlists", title: "Playlists", icon: List, url: "/playlists" },
      { id: "subscriptions", title: "Subscriptions", icon: Clapperboard, url: "/subscriptions" },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { id: "storage", title: "Storage", icon: HardDrive, url: "/storage" },
      { id: "settings", title: "Settings", icon: Settings, url: "/settings" },
      { id: "logs", title: "Logs", icon: ScrollText, url: "/app-debug-logs" },
    ],
  },
];

export function AppSidebar({
  className,
  ...props
}: React.ComponentProps<typeof Sidebar>): React.JSX.Element {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const matches = useMatches();
  const currentPath = useMemo(() => matches[matches.length - 1]?.pathname ?? "/", [matches]);

  // Load user preferences from atom
  const sidebarPreferences = useAtomValue(sidebarPreferencesAtom);

  // Filter groups and items based on user preferences
  const filteredGroups = useMemo(() => {
    return SIDEBAR_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        // Always hide logs if not in dev mode
        if (item.id === "logs" && !isDevelopment()) {
          return false;
        }
        // Special logic: Flashcards visibility is tied to "my-words" preference
        if (item.id === "flashcards") {
          return sidebarPreferences.visibleItems.includes("my-words");
        }
        // Home is always visible (maps to dashboard in preferences)
        if (item.id === "home") {
          return (
            sidebarPreferences.visibleItems.includes("home") ||
            sidebarPreferences.visibleItems.includes("dashboard")
          );
        }
        return sidebarPreferences.visibleItems.includes(item.id);
      }),
    })).filter((group) => group.items.length > 0);
  }, [sidebarPreferences.visibleItems]);

  return (
    <Sidebar
      collapsible="icon"
      className={cn("border-r border-border bg-sidebar", className)}
      {...props}
    >
      <SidebarHeader className="px-3 py-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">LearnifyTube</span>
          <SidebarThemeToggle variant="icon" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === item.url || activeItem === item.title}
                    tooltip={item.title}
                    className={cn(
                      "gap-2 text-muted-foreground transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      (currentPath === item.url || activeItem === item.title) &&
                        "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    )}
                  >
                    <Link
                      to={item.url}
                      onClick={() => {
                        logger.debug("Sidebar navigation", {
                          from: currentPath,
                          to: item.url,
                          title: item.title,
                          source: "AppSidebar",
                        });
                        setActiveItem(item.title);
                      }}
                    >
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <MinimizedPlayer />
      </SidebarFooter>

      <SidebarRail className="border-primary/20 dark:border-primary/10" />
    </Sidebar>
  );
}
