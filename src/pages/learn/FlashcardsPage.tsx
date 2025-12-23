
import React, { useState } from "react";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Trash2, Plus, Play, RotateCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { StudyMode } from "./StudyMode";

export default function FlashcardsPage(): React.JSX.Element {
    const [activeTab, setActiveTab] = useState<"overview" | "study">("overview");
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Queries
    const { data: dueCards, isLoading: isLoadingDue } = useQuery({
        queryKey: ["flashcards", "due"],
        queryFn: async () => await trpcClient.flashcards.getDue.query(),
    });

    const { data: allCards, isLoading: isLoadingAll } = useQuery({
        queryKey: ["flashcards", "list"],
        queryFn: async () => await trpcClient.flashcards.list.query(),
    });

    // Mutations
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => await trpcClient.flashcards.delete.mutate({ id }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["flashcards"] });
        },
    });

    const dueCount = dueCards?.length || 0;
    const totalCount = allCards?.length || 0;

    const handleStudyClick = () => {
        // Navigate to study mode or switch tab
        // For now switch tab, later maybe full screen route
        setActiveTab("study");
    };

    return (
        <div className="flex h-full flex-col p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Flashcards</h1>
                    <p className="text-muted-foreground">
                        Master your vocabulary with spaced repetition.
                    </p>
                </div>
                <Button onClick={handleStudyClick} disabled={dueCount === 0} size="lg">
                    <Brain className="mr-2 h-5 w-5" />
                    Study Now ({dueCount})
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Due Reviews</CardTitle>
                        <RotateCw className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{dueCount}</div>
                        <p className="text-xs text-muted-foreground">Cards ready for review</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Decks</CardTitle>
                        <Brain className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1</div>
                        <p className="text-xs text-muted-foreground">Main vocabulary deck</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Cards</CardTitle>
                        <Brain className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalCount}</div>
                        <p className="text-xs text-muted-foreground">Generated from Saved Words</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="study" disabled={dueCount === 0}>
                        Study Mode
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Deck Management</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[400px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Front</TableHead>
                                            <TableHead>Back</TableHead>
                                            <TableHead>Next Review</TableHead>
                                            <TableHead className="w-[100px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allCards?.map((card) => (
                                            <TableRow key={card.id}>
                                                <TableCell className="font-medium">{card.frontContent}</TableCell>
                                                <TableCell>{card.backContent}</TableCell>
                                                <TableCell>
                                                    {card.nextReviewAt ? formatDistanceToNow(new Date(card.nextReviewAt), { addSuffix: true }) : "New"}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => deleteMutation.mutate(card.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {totalCount === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                                    No flashcards yet. Add words from your saved list or while watching!
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="study" className="min-h-[500px]">
                    {activeTab === "study" && dueCards && dueCards.length > 0 ? (
                        <StudyMode
                            cards={dueCards}
                            onComplete={() => {
                                setActiveTab("overview");
                                queryClient.invalidateQueries({ queryKey: ["flashcards"] });
                            }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 rounded-lg border border-dashed text-muted-foreground">
                            <Brain className="h-12 w-12 text-muted-foreground/50" />
                            <div className="space-y-2">
                                <h3 className="text-xl font-semibold">No cards due for review</h3>
                                <p className="text-muted-foreground max-w-sm mx-auto">You're all caught up! Check back later or add more words from your videos.</p>
                            </div>
                            <Button variant="outline" onClick={() => setActiveTab("overview")}>Back to Overview</Button>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
