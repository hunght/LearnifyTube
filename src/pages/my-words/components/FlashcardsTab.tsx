import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Clock,
  Brain,
  TrendingUp,
  GraduationCap,
  Trash2,
  FileQuestion,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Flashcard } from "@/api/db/schema";
import { cn } from "@/lib/utils";
import { SRSProgressChart } from "./SRSProgressChart";
import { SRSCalendarView } from "./SRSCalendarView";

export function FlashcardsTab({
  onRequestStudy,
}: {
  onRequestStudy: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const [viewingCategory, setViewingCategory] = useState<
    "due" | "new" | "learning" | "graduated" | null
  >(null);
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [editForm, setEditForm] = useState({ frontContent: "", backContent: "" });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await trpcClient.flashcards.delete.mutate({ id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flashcards", "list"] });
      queryClient.invalidateQueries({ queryKey: ["flashcards", "due"] });
      toast.success("Card deleted");
    },
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error("Failed to delete card");
    },
  });

  // Update mutation - uses the flashcards.update endpoint added to the router
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; frontContent: string; backContent: string }) => {
      return await trpcClient.flashcards.update.mutate(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flashcards", "list"] });
      queryClient.invalidateQueries({ queryKey: ["flashcards", "due"] });
      toast.success("Card updated");
      setEditingCard(null);
    },
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error("Failed to update card");
    },
  });

  const handleDelete = (id: string, e: React.MouseEvent): void => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this card?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleFlipCard = (cardId: string): void => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const handleEditCard = (card: Flashcard, e: React.MouseEvent): void => {
    e.stopPropagation();
    setEditingCard(card);
    setEditForm({
      frontContent: card.frontContent,
      backContent: card.backContent,
    });
  };

  const handleSaveEdit = (): void => {
    if (!editingCard) return;
    updateMutation.mutate({
      id: editingCard.id,
      frontContent: editForm.frontContent,
      backContent: editForm.backContent,
    });
  };

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

      {/* SRS Progress Visualization */}
      {allFlashcards && allFlashcards.length > 0 && <SRSProgressChart flashcards={allFlashcards} />}

      {/* Review Calendar */}
      {allFlashcards && allFlashcards.length > 0 && <SRSCalendarView flashcards={allFlashcards} />}

      {/* Cards List Dialog */}
      <Dialog open={!!viewingCategory} onOpenChange={(open) => !open && setViewingCategory(null)}>
        <DialogContent className="flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden">
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
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                .map((card) => {
                  const isFlipped = flippedCards.has(card.id);
                  return (
                    <div
                      key={card.id}
                      className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                      onClick={() => handleFlipCard(card.id)}
                    >
                      {/* Card Content - Flip Container */}
                      <div className="relative min-h-[180px] w-full">
                        {/* Front Side */}
                        <div
                          className={cn(
                            "absolute inset-0 flex flex-col items-center justify-center p-4 transition-all duration-300",
                            isFlipped ? "pointer-events-none opacity-0" : "opacity-100"
                          )}
                        >
                          {/* Type Badge */}
                          {card.cardType !== "basic" && (
                            <span className="absolute left-2 top-2 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                              {card.cardType}
                            </span>
                          )}

                          {/* Front Content */}
                          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                            {card.cardType === "cloze" ? (
                              <FileQuestion className="h-6 w-6 text-muted-foreground/50" />
                            ) : (
                              <Brain className="h-6 w-6 text-muted-foreground/50" />
                            )}
                            <p className="text-center text-lg font-medium leading-snug">
                              {card.cardType === "cloze" && card.clozeContent
                                ? card.clozeContent.replace(/{{c1::(.*?)}}/g, "[...]")
                                : card.frontContent}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Tap to reveal answer
                            </p>
                          </div>
                        </div>

                        {/* Back Side */}
                        <div
                          className={cn(
                            "absolute inset-0 flex flex-col items-center justify-center bg-primary/5 p-4 transition-all duration-300 dark:bg-primary/10",
                            isFlipped ? "opacity-100" : "pointer-events-none opacity-0"
                          )}
                        >
                          {/* Flip indicator */}
                          <RotateCcw className="absolute right-2 top-2 h-4 w-4 text-muted-foreground/50" />

                          {/* Back Content */}
                          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                            <p className="text-center text-sm text-muted-foreground">
                              {card.frontContent}
                            </p>
                            <div className="h-[1px] w-16 bg-border" />
                            <p className="text-center text-lg font-bold text-primary">
                              {PlatformFreeText(card.backContent)}
                            </p>
                            {card.contextText && (
                              <p className="mt-2 text-center text-xs italic text-muted-foreground">
                                "{card.contextText}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Footer / Meta */}
                      <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
                        <div className="flex gap-2">
                          <span>Int: {card.interval}d</span>
                          <span>Rev: {card.reviewCount}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {viewingCategory === "due" && (
                            <div className="font-bold text-destructive">DUE</div>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary"
                            onClick={(e) => handleEditCard(card, e)}
                            title="Edit card"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDelete(card.id, e)}
                            title="Delete card"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
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

      {/* Edit Card Dialog */}
      <Dialog open={!!editingCard} onOpenChange={(open) => !open && setEditingCard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Flashcard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="frontContent">Front (Question)</Label>
              <Input
                id="frontContent"
                value={editForm.frontContent}
                onChange={(e) => setEditForm((prev) => ({ ...prev, frontContent: e.target.value }))}
                placeholder="Enter the question or word"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backContent">Back (Answer)</Label>
              <Textarea
                id="backContent"
                value={editForm.backContent}
                onChange={(e) => setEditForm((prev) => ({ ...prev, backContent: e.target.value }))}
                placeholder="Enter the answer or definition"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCard(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
