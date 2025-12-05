import { AboutSection } from "@/pages/settings-page/components/AboutSection";
import { CustomizationSection } from "@/pages/settings-page/components/CustomizationSection";

export default function SettingsPage(): React.JSX.Element {

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-foreground">Settings</h1>
      <p className="mt-2 text-muted-foreground">Configure your application settings</p>

      <CustomizationSection />

      <AboutSection />
    </div>
  );
}
