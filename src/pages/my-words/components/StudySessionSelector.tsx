import React from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  BookOpen,
  Library,
  Sparkles,
  RotateCcw,
  GraduationCap,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { Flashcard } from "@/api/db/schema";

export type StudySessionType = "quick" | "standard" | "full" | "new_only" | "review_only";

interface SessionOption {
  type: StudySessionType;
  title: string;
  description: string;
  icon: React.ReactNode;
  cardLimit: number;
  color: string;
}

const sessionOptions: SessionOption[] = [
  {
    type: "quick",
    title: "Quick Review",
    description: "A fast 10-card session for when you're short on time",
    icon: <Zap className="h-5 w-5" />,
    cardLimit: 10,
    color: "text-yellow-500",
  },
  {
    type: "standard",
    title: "Standard Review",
    description: "Balanced 25-card session for daily practice",
    icon: <BookOpen className="h-5 w-5" />,
    cardLimit: 25,
    color: "text-blue-500",
  },
  {
    type: "full",
    title: "Full Review",
    description: "Review all due cards in one session",
    icon: <Library className="h-5 w-5" />,
    cardLimit: 100,
    color: "text-purple-500",
  },
  {
    type: "new_only",
    title: "New Cards Only",
    description: "Focus on learning new vocabulary",
    icon: <Sparkles className="h-5 w-5" />,
    cardLimit: 20,
    color: "text-green-500",
  },
  {
    type: "review_only",
    title: "Review Only",
    description: "Practice cards you've seen before",
    icon: <RotateCcw className="h-5 w-5" />,
    cardLimit: 20,
    color: "text-orange-500",
  },
];

interface StudySessionSelectorProps {
  onSelectSession: (sessionType: StudySessionType, cards: Flashcard[]) => void;
  onCancel: () => void;
}

export function StudySessionSelector({
  onSelectSession,
  onCancel,
}: StudySessionSelectorProps): React.JSX.Element {
  // Fetch counts for each session type
  const dueCardsQuery = useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: async () => trpcClient.flashcards.getDue.query(),
  });

  const allDueCards = dueCardsQuery.data ?? [];
  const newCards = allDueCards.filter((c) => (c.reviewCount ?? 0) === 0);
  const reviewCards = allDueCards.filter((c) => (c.reviewCount ?? 0) > 0);

  // Calculate available cards for each session type
  const getAvailableCount = (type: StudySessionType): number => {
    switch (type) {
      case "quick":
        return Math.min(10, allDueCards.length);
      case "standard":
        return Math.min(25, allDueCards.length);
      case "full":
        return allDueCards.length;
      case "new_only":
        return Math.min(20, newCards.length);
      case "review_only":
        return Math.min(20, reviewCards.length);
      default:
        return 0;
    }
  };

  const handleSelectSession = async (option: SessionOption): Promise<void> => {
    const count = getAvailableCount(option.type);
    if (count === 0) return;

    try {
      const result = await trpcClient.flashcards.getStudySession.query({
        sessionType: option.type,
      });
      onSelectSession(option.type, result.cards);
    } catch {
      // Fallback to due cards if query fails
      const cards =
        option.type === "new_only"
          ? newCards.slice(0, option.cardLimit)
          : option.type === "review_only"
            ? reviewCards.slice(0, option.cardLimit)
            : allDueCards.slice(0, option.cardLimit);
      onSelectSession(option.type, cards);
    }
  };

  if (dueCardsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (allDueCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
        <div className="rounded-full bg-muted p-4">
          <GraduationCap className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-semibold">All Caught Up!</h3>
          <p className="text-muted-foreground">No cards due for review at the moment.</p>
        </div>
        <Button onClick={onCancel} variant="outline">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="flex items-center justify-center gap-4 rounded-lg bg-muted/50 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            <span className="font-semibold">{allDueCards.length}</span> cards due
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-green-500" />
          <span className="text-sm">
            <span className="font-semibold">{newCards.length}</span> new
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-orange-500" />
          <span className="text-sm">
            <span className="font-semibold">{reviewCards.length}</span> review
          </span>
        </div>
      </div>

      {/* Session Options */}
      <div className="grid gap-3">
        {sessionOptions.map((option) => {
          const availableCount = getAvailableCount(option.type);
          const isDisabled = availableCount === 0;

          return (
            <Card
              key={option.type}
              className={`cursor-pointer transition-all ${
                isDisabled
                  ? "cursor-not-allowed opacity-50"
                  : "hover:border-primary hover:shadow-md"
              }`}
              onClick={() => !isDisabled && handleSelectSession(option)}
            >
              <CardHeader className="flex flex-row items-center gap-4 space-y-0 p-4">
                <div className={`rounded-lg bg-muted p-2 ${option.color}`}>{option.icon}</div>
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {option.title}
                    <Badge variant="secondary" className="text-xs">
                      {availableCount} cards
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-sm">{option.description}</CardDescription>
                </div>
                {!isDisabled && (
                  <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                )}
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Cancel Button */}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
