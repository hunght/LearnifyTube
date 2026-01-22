import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer } from "@/components/ui/page-container";
import {
  RefreshCw,
  GraduationCap,
  Layers,
  BookmarkCheck,
  Zap,
  BookOpen,
  Library,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { StudyMode } from "@/pages/learn/StudyMode";
import { SavedWordsTab } from "./components/SavedWordsTab";
import { FlashcardsTab } from "./components/FlashcardsTab";
import type { Flashcard } from "@/api/db/schema";

type StudySessionType = "quick" | "standard" | "full" | "new_only" | "review_only";

interface QuickAction {
  type: StudySessionType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  limit: number;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    type: "quick",
    title: "Quick",
    description: "10 cards",
    icon: Zap,
    color: "text-yellow-500 bg-yellow-500/10",
    limit: 10,
  },
  {
    type: "standard",
    title: "Standard",
    description: "25 cards",
    icon: BookOpen,
    color: "text-blue-500 bg-blue-500/10",
    limit: 25,
  },
  {
    type: "full",
    title: "Full",
    description: "All due",
    icon: Library,
    color: "text-purple-500 bg-purple-500/10",
    limit: 100,
  },
  {
    type: "new_only",
    title: "New",
    description: "New cards",
    icon: Sparkles,
    color: "text-green-500 bg-green-500/10",
    limit: 20,
  },
  {
    type: "review_only",
    title: "Review",
    description: "Seen cards",
    icon: RotateCcw,
    color: "text-orange-500 bg-orange-500/10",
    limit: 20,
  },
];

export default function MyWordsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [studyCards, setStudyCards] = useState<Flashcard[]>([]);
  const [sessionType, setSessionType] = useState<StudySessionType | null>(null);

  // Fetch due flashcards for study
  const {
    data: dueCards,
    isFetching: isDueCardsFetching,
    refetch: refetchDueCards,
  } = useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: async () => await trpcClient.flashcards.getDue.query(),
  });

  const allDueCards = dueCards ?? [];
  const newCards = allDueCards.filter((c) => (c.reviewCount ?? 0) === 0);
  const reviewCards = allDueCards.filter((c) => (c.reviewCount ?? 0) > 0);

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

  const handleRefresh = (): void => {
    queryClient.invalidateQueries({ queryKey: ["saved-words"] });
    queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    refetchDueCards();
  };

  const handleStartSession = async (type: StudySessionType): Promise<void> => {
    const count = getAvailableCount(type);
    if (count === 0) return;

    try {
      const result = await trpcClient.flashcards.getStudySession.query({
        sessionType: type,
      });
      setSessionType(type);
      setStudyCards(result.cards);
      setIsStudyMode(true);
    } catch {
      // Fallback
      const action = QUICK_ACTIONS.find((a) => a.type === type);
      const limit = action?.limit ?? 10;
      const cards =
        type === "new_only"
          ? newCards.slice(0, limit)
          : type === "review_only"
            ? reviewCards.slice(0, limit)
            : allDueCards.slice(0, limit);
      setSessionType(type);
      setStudyCards(cards);
      setIsStudyMode(true);
    }
  };

  const handleStudyComplete = (): void => {
    setIsStudyMode(false);
    setStudyCards([]);
    setSessionType(null);
    queryClient.invalidateQueries({ queryKey: ["flashcards"] });
  };

  const getSessionTitle = (): string => {
    switch (sessionType) {
      case "quick":
        return "Quick Review";
      case "standard":
        return "Standard Review";
      case "full":
        return "Full Review";
      case "new_only":
        return "New Cards";
      case "review_only":
        return "Review Session";
      default:
        return "Flashcard Study";
    }
  };

  return (
    <PageContainer>
      {/* Quick Actions Section */}
      <Card className="mb-6 border-0 bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Stats */}
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Study Session</h2>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{allDueCards.length}</span> due
                </span>
                <span className="text-border">·</span>
                <span>
                  <span className="font-medium text-green-600">{newCards.length}</span> new
                </span>
                <span className="text-border">·</span>
                <span>
                  <span className="font-medium text-orange-600">{reviewCards.length}</span> review
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => {
              const count = getAvailableCount(action.type);
              const isDisabled = count === 0;
              const Icon = action.icon;

              return (
                <button
                  key={action.type}
                  onClick={() => handleStartSession(action.type)}
                  disabled={isDisabled}
                  className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-all hover:border-primary hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                    isDisabled ? "" : "hover:scale-[1.02] active:scale-[0.98]"
                  }`}
                >
                  <div className={`rounded-md p-1 ${action.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="leading-tight">{action.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {count > 0 ? `${count} cards` : "None"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="flashcards" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="flashcards" className="gap-2">
              <Layers className="h-4 w-4" />
              Flashcards
            </TabsTrigger>
            <TabsTrigger value="saved" className="gap-2">
              <BookmarkCheck className="h-4 w-4" />
              Saved Words
            </TabsTrigger>
          </TabsList>
          <Button
            onClick={handleRefresh}
            disabled={isDueCardsFetching}
            size="sm"
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isDueCardsFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Saved Words Tab */}
        <TabsContent value="saved" className="space-y-4">
          <SavedWordsTab />
        </TabsContent>

        {/* Flashcards Tab */}
        <TabsContent value="flashcards" className="space-y-6">
          <FlashcardsTab onRequestStudy={() => handleStartSession("standard")} />
        </TabsContent>
      </Tabs>

      {/* Study Mode Dialog */}
      <Dialog open={isStudyMode} onOpenChange={setIsStudyMode}>
        <DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              {getSessionTitle()}
            </DialogTitle>
          </DialogHeader>
          {studyCards.length > 0 ? (
            <StudyMode cards={studyCards} onComplete={handleStudyComplete} />
          ) : (
            <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center text-muted-foreground">
              <div className="rounded-full bg-muted p-4">
                <GraduationCap className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-foreground">All Caught Up!</h3>
                <p>No cards due for review at the moment.</p>
              </div>
              <Button onClick={() => setIsStudyMode(false)} variant="outline">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
