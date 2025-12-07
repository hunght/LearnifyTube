import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { UserPreferences, SidebarItem } from "@/lib/types/user-preferences";

const SIDEBAR_ITEMS: { id: SidebarItem; label: string; description: string }[] = [
  { id: "dashboard", label: "Dashboard", description: "Overview and quick stats" },
  { id: "channels", label: "Channels", description: "Browse YouTube channels" },
  { id: "playlists", label: "Playlists", description: "Manage playlists" },
  { id: "subscriptions", label: "Subscriptions", description: "Your subscribed channels" },
  { id: "history", label: "History", description: "Watch history" },
  { id: "my-words", label: "My Words", description: "Saved vocabulary" },
  { id: "storage", label: "Storage", description: "Manage downloaded videos" },
  { id: "logs", label: "Logs", description: "Debug logs (dev mode)" },
  { id: "settings", label: "Settings", description: "App configuration" },
];

interface SidebarTabProps {
  preferences: UserPreferences;
  updatePreferences: (updates: { sidebar?: Partial<UserPreferences["sidebar"]> }) => Promise<void>;
}

export function SidebarTab({ preferences, updatePreferences }: SidebarTabProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Visible Menu Items</CardTitle>
          <CardDescription>
            Choose which pages appear in your sidebar. Hide features you don't use to keep your
            workspace clean.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {SIDEBAR_ITEMS.map((item) => {
            const isVisible = preferences.sidebar.visibleItems.includes(item.id);
            const isSettings = item.id === "settings";

            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-border p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">{item.label}</Label>
                    {isSettings && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                <Switch
                  checked={isVisible}
                  disabled={isSettings}
                  onCheckedChange={(checked) => {
                    const newVisibleItems = checked
                      ? [...preferences.sidebar.visibleItems, item.id]
                      : preferences.sidebar.visibleItems.filter((id) => id !== item.id);

                    updatePreferences({
                      sidebar: { visibleItems: newVisibleItems },
                    });
                  }}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sidebar Behavior</CardTitle>
          <CardDescription>Control how the sidebar appears and behaves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Collapsed by Default</Label>
              <p className="text-sm text-muted-foreground">
                Start with sidebar in collapsed icon-only mode
              </p>
            </div>
            <Switch
              checked={preferences.sidebar.collapsed}
              onCheckedChange={(checked) =>
                updatePreferences({
                  sidebar: { collapsed: checked },
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
