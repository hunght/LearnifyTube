import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Languages } from "lucide-react";
import type { UserPreferences } from "@/lib/types/user-preferences";

interface LearningTabProps {
  preferences: UserPreferences;
  updatePreferences: (updates: {
    learning?: Partial<UserPreferences["learning"]>;
  }) => Promise<void>;
}

export function LearningTab({
  preferences,
  updatePreferences,
}: LearningTabProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Vocabulary Learning
          </CardTitle>
          <CardDescription>Control how you learn new words while watching</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Pause on New Word</Label>
              <p className="text-sm text-muted-foreground">
                Automatically pause video when you click a new word
              </p>
            </div>
            <Switch
              checked={preferences.learning.pauseOnNewWord}
              onCheckedChange={(checked) =>
                updatePreferences({
                  learning: { pauseOnNewWord: checked },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Highlight Translations</Label>
              <p className="text-sm text-muted-foreground">
                Highlight translated words in subtitles
              </p>
            </div>
            <Switch
              checked={preferences.learning.highlightTranslations}
              onCheckedChange={(checked) =>
                updatePreferences({
                  learning: { highlightTranslations: checked },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Save Words</Label>
              <p className="text-sm text-muted-foreground">
                Automatically save words you click to your vocabulary list
              </p>
            </div>
            <Switch
              checked={preferences.learning.autoSaveWords}
              onCheckedChange={(checked) =>
                updatePreferences({
                  learning: { autoSaveWords: checked },
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
