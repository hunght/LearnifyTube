import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, GraduationCap, Layers, BookmarkCheck } from "lucide-react";
import { StudyMode } from "@/pages/learn/StudyMode";
import { SavedWordsTab } from "./components/SavedWordsTab";
import { FlashcardsTab } from "./components/FlashcardsTab";

export default function MyWordsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [isStudyMode, setIsStudyMode] = useState(false);

  // Fetch due flashcards for study (used for header button)
  const {
    data: dueCards,
    isFetching: isDueCardsFetching,
    refetch: refetchDueCards,
  } = useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: async () => await trpcClient.flashcards.getDue.query(),
  });

  const dueCount = dueCards?.length || 0;

  const handleRefresh = (): void => {
    queryClient.invalidateQueries({ queryKey: ["saved-words"] });
    queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    refetchDueCards();
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
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
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsStudyMode(true)}
              disabled={dueCount === 0}
              size="sm"
              className="flex items-center gap-2"
            >
              <GraduationCap className="h-4 w-4" />
              Study Now {dueCount > 0 && `(${dueCount})`}
            </Button>
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
        </div>

        {/* Saved Words Tab */}
        <TabsContent value="saved" className="space-y-4">
          <SavedWordsTab />
        </TabsContent>

        {/* Flashcards Tab */}
        <TabsContent value="flashcards" className="space-y-6">
          <FlashcardsTab onRequestStudy={() => setIsStudyMode(true)} />
        </TabsContent>
      </Tabs>

      {/* Study Mode Dialog */}
      <Dialog open={isStudyMode} onOpenChange={setIsStudyMode}>
        <DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Flashcard Study
            </DialogTitle>
          </DialogHeader>
          {dueCards && dueCards.length > 0 ? (
            <StudyMode
              cards={dueCards}
              onComplete={() => {
                setIsStudyMode(false);
                queryClient.invalidateQueries({ queryKey: ["flashcards"] });
              }}
            />
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
    </div>
  );
}
