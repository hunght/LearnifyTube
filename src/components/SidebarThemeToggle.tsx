import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { toggleTheme, getCurrentTheme } from "@/helpers/theme_helpers";
import { ThemeMode } from "@/lib/types/theme-mode";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SidebarThemeToggleProps = {
  className?: string;
};

export function SidebarThemeToggle({ className }: SidebarThemeToggleProps): React.JSX.Element {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    getCurrentTheme().then((theme) => {
      setCurrentTheme(theme.local || theme.system);
    });
  }, []);

  const handleToggle = async (): Promise<void> => {
    await toggleTheme();
    const theme = await getCurrentTheme();
    setCurrentTheme(theme.local || theme.system);
  };

  const isDark = currentTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      title={mounted ? (isDark ? "Switch to Light Mode" : "Switch to Dark Mode") : "Toggle Theme"}
      className={cn("h-7 w-7 shrink-0", className)}
    >
      {mounted ? (
        isDark ? (
          <Moon className="h-4 w-4 text-primary" />
        ) : (
          <Sun className="h-4 w-4 text-primary" />
        )
      ) : (
        <div className="h-4 w-4" />
      )}
    </Button>
  );
}
