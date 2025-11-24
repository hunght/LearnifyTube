import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "@radix-ui/react-icons";

import { setTheme, getCurrentTheme } from "../../helpers/theme_helpers";
import { ThemeMode } from "@/lib/types/theme-mode";
import { Button } from "@/components/ui/button";

import { AboutSection } from "@/pages/settings-page/components/AboutSection";
import { LanguagePreferencesSection } from "@/pages/settings-page/components/LanguagePreferencesSection";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { trpcClient } from "@/utils/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage(): React.JSX.Element {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>("light");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get database path
  const { data: dbInfo } = useQuery({
    queryKey: ["database", "path"],
    queryFn: () => trpcClient.utils.getDatabasePath.query(),
  });

  // Get download path
  const { data: downloadPathInfo } = useQuery({
    queryKey: ["preferences", "downloadPath"],
    queryFn: () => trpcClient.preferences.getDownloadPath.query(),
  });

  const ensureLatestDownloadFolderAccess = async (): Promise<void> => {
    const latest = await trpcClient.preferences.getDownloadPath.query();
    await ensureDirectoryAccessMutation.mutateAsync(latest.downloadPath);
  };

  // Mutation to update download path
  const updateDownloadPathMutation = useMutation({
    mutationFn: async (downloadPath: string | null) => {
      return await trpcClient.preferences.updateDownloadPath.mutate({ downloadPath });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["preferences", "downloadPath"] });
      toast({
        title: "Download Path Updated",
        description: "Your download folder path has been updated.",
      });
      await ensureLatestDownloadFolderAccess();
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  const ensureDirectoryAccessMutation = useMutation({
    mutationFn: async (directoryPath?: string | null) => {
      if (!directoryPath) return null;
      return await trpcClient.preferences.ensureDownloadDirectoryAccess.mutate({
        directoryPath,
      });
    },
    onSuccess: (result) => {
      if (!result) return;
      if (result.success) {
        toast({
          title: "Folder access granted",
          description: `LearnifyTube can now read ${result.downloadPath}.`,
        });
      } else if (!result.cancelled) {
        toast({
          title: "Folder access was not granted",
          description: result.message ?? "Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Unable to request access",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    getCurrentTheme().then((theme) => {
      setCurrentTheme(theme.local || theme.system);
    });
  }, []);

  const handleThemeChange = async (theme: ThemeMode): Promise<void> => {
    await setTheme(theme);
    setCurrentTheme(theme);
  };

  const handleRevealDatabase = async (): Promise<void> => {
    if (dbInfo?.path) {
      // On macOS, shell.showItemInFolder would be better, but we can use openPath for the parent directory
      await trpcClient.utils.openFolder.mutate({ folderPath: dbInfo.directory });
    }
  };

  const handleOpenDownloadFolder = async (): Promise<void> => {
    if (downloadPathInfo?.downloadPath) {
      await trpcClient.utils.openFolder.mutate({ folderPath: downloadPathInfo.downloadPath });
    }
  };

  const handleChangeDownloadFolder = async (): Promise<void> => {
    const result = await trpcClient.utils.selectFolder.mutate({
      defaultPath: downloadPathInfo?.downloadPath,
    });

    if (result.success && "folderPath" in result) {
      await updateDownloadPathMutation.mutateAsync(result.folderPath);
    } else if (result.success === false && "cancelled" in result && result.cancelled) {
      // User cancelled, do nothing
    } else if (result.success === false && "error" in result) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleResetToDefault = async (): Promise<void> => {
    await updateDownloadPathMutation.mutateAsync(null);
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-foreground">Settings</h1>
      <p className="mt-2 text-muted-foreground">Configure your application settings</p>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Customize your application appearance</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Button
            variant={currentTheme === "light" ? "default" : "outline"}
            size="icon"
            onClick={() => handleThemeChange("light")}
          >
            <SunIcon className="h-4 w-4" />
          </Button>
          <Button
            variant={currentTheme === "dark" ? "default" : "outline"}
            size="icon"
            onClick={() => handleThemeChange("dark")}
          >
            <MoonIcon className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>View database location and information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dbInfo ? (
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Database Path</Label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-xs">
                    {dbInfo.path}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRevealDatabase}
                    disabled={!dbInfo.exists}
                  >
                    Open in Finder
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className={dbInfo.exists ? "text-green-600" : "text-red-600"}>
                    {dbInfo.exists ? "✓ Found" : "✗ Not Found"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Size:</span>{" "}
                  <span>{(dbInfo.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading database information...</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Download Folder</CardTitle>
          <CardDescription>Manage where downloaded videos are saved</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {downloadPathInfo ? (
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">
                  Current Download Folder
                  {downloadPathInfo.isDefault && (
                    <span className="ml-2 text-xs text-muted-foreground">(Default)</span>
                  )}
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-xs">
                    {downloadPathInfo.downloadPath}
                  </code>
                  <Button size="sm" variant="outline" onClick={handleOpenDownloadFolder}>
                    Open Folder
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleChangeDownloadFolder}>
                  Change Folder
                </Button>
                {!downloadPathInfo.isDefault && (
                  <Button size="sm" variant="outline" onClick={handleResetToDefault}>
                    Reset to Default
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Loading download folder information...
            </div>
          )}
        </CardContent>
      </Card>

      <LanguagePreferencesSection />

      <AboutSection />
    </div>
  );
}
