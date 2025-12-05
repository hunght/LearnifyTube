import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play } from "lucide-react";
import type { UserPreferences } from "@/lib/types/user-preferences";

interface PlayerTabProps {
  preferences: UserPreferences;
  updatePreferences: (updates: { player?: Partial<UserPreferences["player"]> }) => Promise<void>;
}

export function PlayerTab({ preferences, updatePreferences }: PlayerTabProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Playback Settings
          </CardTitle>
          <CardDescription>Control default video player behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Play Videos</Label>
              <p className="text-sm text-muted-foreground">
                Automatically start playing when video loads
              </p>
            </div>
            <Switch
              checked={preferences.player.autoPlay}
              onCheckedChange={(checked) =>
                updatePreferences({
                  player: { autoPlay: checked },
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Default Playback Speed</Label>
            <Select
              value={preferences.player.defaultSpeed.toString()}
              onValueChange={(value) =>
                updatePreferences({
                  player: { defaultSpeed: parseFloat(value) },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.25">0.25x (Very Slow)</SelectItem>
                <SelectItem value="0.5">0.5x (Slow)</SelectItem>
                <SelectItem value="0.75">0.75x</SelectItem>
                <SelectItem value="1">1.0x (Normal)</SelectItem>
                <SelectItem value="1.25">1.25x</SelectItem>
                <SelectItem value="1.5">1.5x (Fast)</SelectItem>
                <SelectItem value="1.75">1.75x</SelectItem>
                <SelectItem value="2">2.0x (Very Fast)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Default Volume</Label>
              <span className="text-sm text-muted-foreground">
                {preferences.player.defaultVolume}%
              </span>
            </div>
            <Slider
              value={[preferences.player.defaultVolume]}
              onValueChange={([value]) =>
                updatePreferences({
                  player: { defaultVolume: value },
                })
              }
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subtitles</CardTitle>
          <CardDescription>Configure subtitle preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Subtitles</Label>
              <p className="text-sm text-muted-foreground">Display subtitles by default</p>
            </div>
            <Switch
              checked={preferences.player.showSubtitles}
              onCheckedChange={(checked) =>
                updatePreferences({
                  player: { showSubtitles: checked },
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Preferred Subtitle Language</Label>
            <Select
              value={preferences.player.subtitleLanguage}
              onValueChange={(value) =>
                updatePreferences({
                  player: { subtitleLanguage: value },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="it">Italian</SelectItem>
                <SelectItem value="pt">Portuguese</SelectItem>
                <SelectItem value="ja">Japanese</SelectItem>
                <SelectItem value="ko">Korean</SelectItem>
                <SelectItem value="zh">Chinese</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
