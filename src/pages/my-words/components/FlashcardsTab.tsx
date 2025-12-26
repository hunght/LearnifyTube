import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, Brain, TrendingUp, GraduationCap } from "lucide-react";

export function FlashcardsTab({
  onRequestStudy,
}: {
  onRequestStudy: () => void;
}): React.JSX.Element {
  const [viewingCategory, setViewingCategory] = useState<
    "due" | "new" | "learning" | "graduated" | null
  >(null);

  // Helper to strip markdown/brackets for clean display
  const PlatformFreeText = (text: string): string => {
    return text.replace(/\[|\]/g, "");
  };

  // Fetch due flashcards for study (used for count)
  const { data: dueCards } = useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: async () => await trpcClient.flashcards.getDue.query(),
  });

  const { data: allFlashcards } = useQuery({
    queryKey: ["flashcards", "list"],
    queryFn: async () => await trpcClient.flashcards.list.query(),
  });

  const dueCount = dueCards?.length || 0;

  // Calculate learning stats
  const learningStats = React.useMemo(() => {
    if (!allFlashcards) return { new: 0, learning: 0, graduated: 0 };
    return allFlashcards.reduce(
      (acc, card) => {
        if (card.reviewCount === 0) acc.new++;
        else if ((card.interval ?? 0) > 21) acc.graduated++;
        else acc.learning++;
        return acc;
      },
      { new: 0, learning: 0, graduated: 0 }
    );
  }, [allFlashcards]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setViewingCategory("due")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cards Due</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dueCount}</div>
            <p className="text-xs text-muted-foreground">Ready for review</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setViewingCategory("new")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Cards</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{learningStats.new}</div>
            <p className="text-xs text-muted-foreground">Not studied yet</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setViewingCategory("learning")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Learning</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{learningStats.learning}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setViewingCategory("graduated")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Graduated</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{learningStats.graduated}</div>
            <p className="text-xs text-muted-foreground">Mastered (&gt;21 days)</p>
          </CardContent>
        </Card>
      </div>

      {/* Cards List Dialog */}
      <Dialog open={!!viewingCategory} onOpenChange={(open) => !open && setViewingCategory(null)}>
        <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {viewingCategory === "due"
                ? "Cards Due for Review"
                : viewingCategory === "new"
                  ? "New Cards"
                  : viewingCategory === "learning"
                    ? "Words in Learning"
                    : "Graduated Words"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-3 overflow-y-auto pr-2">
            {allFlashcards
              ?.filter((card) => {
                if (viewingCategory === "due") {
                  return card.nextReviewAt && new Date(card.nextReviewAt) <= new Date();
                }
                if (viewingCategory === "new") return (card.reviewCount ?? 0) === 0;
                if (viewingCategory === "graduated") return (card.interval ?? 0) > 21;
                if (viewingCategory === "learning")
                  return (card.reviewCount ?? 0) > 0 && (card.interval ?? 0) <= 21;
                return false;
              })
              .map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{card.frontContent}</p>
                    <p className="line-clamp-1 text-sm text-muted-foreground">
                      {PlatformFreeText(card.backContent)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Interval: {card.interval}d</div>
                    <div>Reviews: {card.reviewCount}</div>
                    {viewingCategory === "due" && (
                      <div className="mt-1 inline-block rounded bg-destructive/10 px-2 py-0.5 text-destructive">
                        Due
                      </div>
                    )}
                  </div>
                </div>
              ))}
            {(!allFlashcards ||
              allFlashcards.filter((card) => {
                if (viewingCategory === "due") {
                  return card.nextReviewAt && new Date(card.nextReviewAt) <= new Date();
                }
                if (viewingCategory === "new") return (card.reviewCount ?? 0) === 0;
                if (viewingCategory === "graduated") return (card.interval ?? 0) > 21;
                if (viewingCategory === "learning")
                  return (card.reviewCount ?? 0) > 0 && (card.interval ?? 0) <= 21;
                return false;
              }).length === 0) && (
              <div className="py-8 text-center text-muted-foreground">
                No cards in this category.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-primary/10 p-4">
          <GraduationCap className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Time to Study!</h2>
        <p className="mb-6 max-w-sm text-muted-foreground">
          You have {dueCount} cards due for review today. Regular practice is the key to long-term
          memory retention.
        </p>
        <Button size="lg" onClick={onRequestStudy} disabled={dueCount === 0} className="px-8">
          start session {dueCount > 0 && `(${dueCount})`}
        </Button>
      </Card>

      {/* Optional: Add a list of decks or recent cards here in the future */}
    </div>
  );
}
