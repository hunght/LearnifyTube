import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingScreenProps {
  message: string;
}

export const LoadingScreen = ({ message }: LoadingScreenProps): React.JSX.Element => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground duration-300 animate-in fade-in">
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg p-8 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <h2 className="text-xl font-semibold">Initializing</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};
