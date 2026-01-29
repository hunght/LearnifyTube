import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stethoscope, Check, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BinaryStatusProps {
  name: string;
  installed: boolean;
  version: string | null;
  latestVersion?: string | null;
  updateAvailable?: boolean;
  isCheckingUpdate?: boolean;
  onUpdate?: () => void;
  isUpdating?: boolean;
}

function BinaryStatus({
  name,
  installed,
  version,
  latestVersion,
  updateAvailable,
  isCheckingUpdate,
  onUpdate,
  isUpdating,
}: BinaryStatusProps): React.JSX.Element {
  // Determine status display
  const getStatusBadge = (): React.JSX.Element => {
    if (!installed) {
      return (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="h-3 w-3" />
          Not installed
        </span>
      );
    }
    if (updateAvailable) {
      return (
        <span className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          Update available
        </span>
      );
    }
    // Only show "Up to date" if we actually checked for updates (latestVersion is defined)
    if (latestVersion !== undefined) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <Check className="h-3 w-3" />
          Up to date
        </span>
      );
    }
    // Otherwise just show "Installed"
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3 w-3" />
        Installed
      </span>
    );
  };

  // Show button for update or install
  const showActionButton = onUpdate && (updateAvailable || !installed);

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{name}</span>
          {getStatusBadge()}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            Installed: <code className="rounded bg-muted px-1">{version ?? "N/A"}</code>
          </span>
          {latestVersion !== undefined && (
            <span>
              Latest:{" "}
              {isCheckingUpdate ? (
                <Loader2 className="inline h-3 w-3 animate-spin" />
              ) : (
                <code className="rounded bg-muted px-1">{latestVersion ?? "N/A"}</code>
              )}
            </span>
          )}
        </div>
      </div>
      {showActionButton && (
        <Button size="sm" variant="outline" onClick={onUpdate} disabled={isUpdating}>
          {isUpdating ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {installed ? "Updating..." : "Installing..."}
            </>
          ) : (
            <>
              <RefreshCw className="mr-1 h-3 w-3" />
              {installed ? "Update" : "Install"}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export function SystemDoctorCard(): React.JSX.Element {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // yt-dlp queries
  const { data: ytdlpInfo, isLoading: isLoadingYtdlp } = useQuery({
    queryKey: ["ytdlp", "installInfo"],
    queryFn: () => trpcClient.binary.getInstallInfo.query(),
  });

  const { data: ytdlpUpdateInfo, isLoading: isCheckingYtdlpUpdate } = useQuery({
    queryKey: ["ytdlp", "checkForUpdate"],
    queryFn: () => trpcClient.binary.checkForUpdate.query(),
    enabled: !!ytdlpInfo?.installed,
  });

  // ffmpeg query
  const { data: ffmpegInfo, isLoading: isLoadingFfmpeg } = useQuery({
    queryKey: ["ffmpeg", "installInfo"],
    queryFn: () => trpcClient.binary.getFfmpegInstallInfo.query(),
  });

  // yt-dlp update mutation
  const updateYtdlpMutation = useMutation({
    mutationFn: () => trpcClient.binary.downloadLatest.mutate({ force: true }),
    onSuccess: async (result) => {
      if (result.success) {
        toast({
          title: "yt-dlp Updated",
          description: `Updated to version ${result.version}`,
        });
        await queryClient.invalidateQueries({ queryKey: ["ytdlp"] });
      } else {
        toast({
          title: "Update Failed",
          description: result.message,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  // ffmpeg install mutation
  const installFfmpegMutation = useMutation({
    mutationFn: () => trpcClient.binary.downloadFfmpeg.mutate({ force: true }),
    onSuccess: async (result) => {
      if (result.success) {
        toast({
          title: "ffmpeg Installed",
          description: `Installed version ${result.version}`,
        });
        await queryClient.invalidateQueries({ queryKey: ["ffmpeg"] });
      } else {
        toast({
          title: "Installation Failed",
          description: result.message,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Installation Failed",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  const handleRefreshAll = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["ytdlp"] });
    await queryClient.invalidateQueries({ queryKey: ["ffmpeg"] });
  };

  const isLoading = isLoadingYtdlp || isLoadingFfmpeg;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              System Doctor
            </CardTitle>
            <CardDescription>Check the status of required system components</CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={handleRefreshAll} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking system components...
          </div>
        ) : (
          <>
            <BinaryStatus
              name="yt-dlp"
              installed={ytdlpInfo?.installed ?? false}
              version={ytdlpInfo?.version ?? null}
              latestVersion={ytdlpUpdateInfo?.latestVersion}
              updateAvailable={ytdlpUpdateInfo?.updateAvailable}
              isCheckingUpdate={isCheckingYtdlpUpdate}
              onUpdate={() => updateYtdlpMutation.mutate()}
              isUpdating={updateYtdlpMutation.isPending}
            />
            <BinaryStatus
              name="ffmpeg"
              installed={ffmpegInfo?.installed ?? false}
              version={ffmpegInfo?.version ?? null}
              onUpdate={!ffmpegInfo?.installed ? () => installFfmpegMutation.mutate() : undefined}
              isUpdating={installFfmpegMutation.isPending}
            />
            {(!ytdlpInfo?.installed || !ffmpegInfo?.installed) && (
              <p className="text-xs text-muted-foreground">
                Missing components may cause download failures. They will be automatically installed
                on next app restart.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
