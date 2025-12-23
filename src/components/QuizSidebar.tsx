import React, { useState } from "react";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Brain,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Award,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface QuizSidebarProps {
  videoId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoTitle?: string;
}

type QuizState = "setup" | "loading" | "active" | "results";
type QuizType = "multiple_choice" | "true_false" | "fill_blank";
type Difficulty = "easy" | "medium" | "hard";

interface Question {
  id: number;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

interface QuizData {
  questions: Question[];
}

const DIFFICULTY_LEVELS: Difficulty[] = ["easy", "medium", "hard"];

const isDifficulty = (value: string): value is Difficulty => {
  return DIFFICULTY_LEVELS.some((level) => level === value);
};

const quizDataSchema = z.object({
  questions: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      question: z.string(),
      options: z.array(z.string()).optional(),
      correctAnswer: z.string(),
      explanation: z.string().optional(),
    })
  ),
});

const isQuizData = (data: unknown): data is QuizData => {
  const parsed = quizDataSchema.safeParse(data);
  return parsed.success;
};

export function QuizSidebar({
  videoId,
  videoRef: _videoRef,
  videoTitle,
}: QuizSidebarProps): React.JSX.Element {
  const [state, setState] = useState<QuizState>("setup");

  // Setup State
  const [quizType, setQuizType] = useState<QuizType>("multiple_choice");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [numQuestions, setNumQuestions] = useState<number>(5);

  // Active Quiz State
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);

  // Results State
  const [score, setScore] = useState(0);

  const { toast } = useToast();

  // Generate Quiz Mutation
  const generateQuizMutation = useMutation({
    mutationFn: async () => {
      return await trpcClient.ai.generateQuiz.mutate({
        videoId,
        type: quizType,
        difficulty,
        numQuestions,
      });
    },
    onSuccess: (data) => {
      if (data.success && "quiz" in data && isQuizData(data.quiz)) {
        if ("cached" in data && data.cached) {
          toast({
            title: "Loaded cached quiz",
            description: "Using a previously generated quiz for these settings.",
          });
        }
        setQuizData(data.quiz);
        setState("active");
        setCurrentQuestionIndex(0);
        setUserAnswers({});
        setShowExplanation(false);
      } else {
        const errorMessage =
          !data.success && "error" in data && typeof data.error === "string"
            ? data.error
            : "Unknown error";
        toast({
          title: "Error generating quiz",
          description: errorMessage,
          variant: "destructive",
        });
        setState("setup");
      }
    },
    onError: (error) => {
      toast({
        title: "Error generating quiz",
        description: error.message,
        variant: "destructive",
      });
      setState("setup");
    },
  });

  // Save Results Mutation
  const saveResultsMutation = useMutation({
    mutationFn: async () => {
      if (!quizData) return;
      return await trpcClient.ai.saveQuizResult.mutate({
        videoId,
        quizType,
        score,
        totalQuestions: quizData.questions.length,
        answers: userAnswers,
      });
    },
  });

  const handleStartQuiz = (): void => {
    setState("loading");
    generateQuizMutation.mutate();
  };

  const handleAnswer = (answer: string): void => {
    if (showExplanation) return; // Prevent changing answer after reveal
    setUserAnswers((prev) => ({ ...prev, [currentQuestionIndex]: answer }));
  };

  const checkAnswer = (): void => {
    setShowExplanation(true);
  };

  const nextQuestion = (): void => {
    if (!quizData) return;

    if (currentQuestionIndex < quizData.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setShowExplanation(false);
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = (): void => {
    if (!quizData) return;

    // Calculate Score
    let correctCount = 0;
    quizData.questions.forEach((q, idx) => {
      const userAnswer = userAnswers[idx];
      // Simple string comparison (case insensitive for fill blank)
      if (userAnswer && userAnswer.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()) {
        correctCount++;
      }
    });

    setScore(correctCount);
    setState("results");

    // Save to DB
    saveResultsMutation.mutate();
  };

  const resetQuiz = (): void => {
    setState("setup");
    setQuizData(null);
    setUserAnswers({});
    setScore(0);
  };

  // --------------------------------------------------------------------------
  // Render Helpers
  // --------------------------------------------------------------------------

  const renderSetup = (): React.JSX.Element => (
    <div className="space-y-6 pt-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Quiz Type</Label>
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant={quizType === "multiple_choice" ? "default" : "outline"}
              onClick={() => setQuizType("multiple_choice")}
              className="justify-start"
            >
              <Brain className="mr-2 h-4 w-4" /> Multiple Choice
            </Button>
            <Button
              variant={quizType === "true_false" ? "default" : "outline"}
              onClick={() => setQuizType("true_false")}
              className="justify-start"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> True / False
            </Button>
            <Button
              variant={quizType === "fill_blank" ? "default" : "outline"}
              onClick={() => setQuizType("fill_blank")}
              className="justify-start"
            >
              <HelpCircle className="mr-2 h-4 w-4" /> Fill in the Blank
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Difficulty</Label>
          <Select
            value={difficulty}
            onValueChange={(v) => {
              if (isDifficulty(v)) {
                setDifficulty(v);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy (Surface level)</SelectItem>
              <SelectItem value="medium">Medium (Comprehension)</SelectItem>
              <SelectItem value="hard">Hard (Analysis)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Number of Questions: {numQuestions}</Label>
          <input
            type="range"
            min="3"
            max="15"
            value={numQuestions}
            onChange={(e) => setNumQuestions(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>3</span>
            <span>15</span>
          </div>
        </div>
      </div>

      <Button onClick={handleStartQuiz} className="w-full" size="lg">
        Generate Quiz <Brain className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );

  const renderLoading = (): React.JSX.Element => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <h3 className="mt-4 text-lg font-semibold">Generating Quiz...</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        AI is analyzing the transcript to create questions.
      </p>
    </div>
  );

  const renderActiveQuiz = (): React.JSX.Element | null => {
    if (!quizData) return null;
    const question = quizData.questions[currentQuestionIndex];
    if (!question) return null;

    const hasAnswered = userAnswers[currentQuestionIndex] !== undefined;
    const isCorrect =
      userAnswers[currentQuestionIndex]?.toLowerCase().trim() ===
      question.correctAnswer.toLowerCase().trim();

    return (
      <div className="space-y-6 pt-2">
        {/* Progress */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Question {currentQuestionIndex + 1} of {quizData.questions.length}
          </span>
          <span>
            {Math.round((currentQuestionIndex / quizData.questions.length) * 100)}% Complete
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(currentQuestionIndex / quizData.questions.length) * 100}%` }}
          />
        </div>

        {/* Question Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base leading-relaxed">{question.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {quizType === "multiple_choice" && question.options && (
              <RadioGroup
                value={userAnswers[currentQuestionIndex] || ""}
                onValueChange={handleAnswer}
                disabled={showExplanation}
              >
                {question.options.map((option, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex cursor-pointer items-center space-x-2 rounded-lg border p-3 transition-colors hover:bg-accent",
                      userAnswers[currentQuestionIndex] === option && "border-primary bg-primary/5",
                      showExplanation &&
                        option === question.correctAnswer &&
                        "border-green-500 bg-green-500/10",
                      showExplanation &&
                        userAnswers[currentQuestionIndex] === option &&
                        option !== question.correctAnswer &&
                        "border-destructive bg-destructive/10"
                    )}
                  >
                    <RadioGroupItem value={option} id={`opt-${idx}`} />
                    <Label htmlFor={`opt-${idx}`} className="flex-1 cursor-pointer">
                      {option}
                    </Label>
                    {showExplanation && option === question.correctAnswer && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {showExplanation &&
                      userAnswers[currentQuestionIndex] === option &&
                      option !== question.correctAnswer && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                  </div>
                ))}
              </RadioGroup>
            )}

            {quizType === "true_false" && (
              <RadioGroup
                value={userAnswers[currentQuestionIndex] || ""}
                onValueChange={handleAnswer}
                disabled={showExplanation}
              >
                <div
                  className={cn(
                    "flex cursor-pointer items-center space-x-2 rounded-lg border p-3 transition-colors hover:bg-accent",
                    userAnswers[currentQuestionIndex] === "True" && "border-primary bg-primary/5",
                    showExplanation &&
                      "True" === question.correctAnswer &&
                      "border-green-500 bg-green-500/10",
                    showExplanation &&
                      userAnswers[currentQuestionIndex] === "True" &&
                      "True" !== question.correctAnswer &&
                      "border-destructive bg-destructive/10"
                  )}
                >
                  <RadioGroupItem value="True" id="opt-true" />
                  <Label htmlFor="opt-true" className="flex-1 cursor-pointer">
                    True
                  </Label>
                </div>
                <div
                  className={cn(
                    "flex cursor-pointer items-center space-x-2 rounded-lg border p-3 transition-colors hover:bg-accent",
                    userAnswers[currentQuestionIndex] === "False" && "border-primary bg-primary/5",
                    showExplanation &&
                      "False" === question.correctAnswer &&
                      "border-green-500 bg-green-500/10",
                    showExplanation &&
                      userAnswers[currentQuestionIndex] === "False" &&
                      "False" !== question.correctAnswer &&
                      "border-destructive bg-destructive/10"
                  )}
                >
                  <RadioGroupItem value="False" id="opt-false" />
                  <Label htmlFor="opt-false" className="flex-1 cursor-pointer">
                    False
                  </Label>
                </div>
              </RadioGroup>
            )}

            {quizType === "fill_blank" && (
              <div className="space-y-2">
                <Input
                  value={userAnswers[currentQuestionIndex] || ""}
                  onChange={(e) => handleAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  disabled={showExplanation}
                  className={cn(
                    showExplanation && isCorrect && "border-green-500 bg-green-500/10",
                    showExplanation && !isCorrect && "border-destructive bg-destructive/10"
                  )}
                />
                {showExplanation && !isCorrect && (
                  <p className="text-sm font-medium text-green-600">
                    Correct Answer: {question.correctAnswer}
                  </p>
                )}
              </div>
            )}

            {showExplanation && question.explanation && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <span className="font-semibold">Explanation:</span> {question.explanation}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            {!showExplanation ? (
              <Button onClick={checkAnswer} disabled={!hasAnswered}>
                Check Answer
              </Button>
            ) : (
              <Button onClick={nextQuestion}>
                {currentQuestionIndex < quizData.questions.length - 1
                  ? "Next Question"
                  : "Finish Quiz"}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    );
  };

  const renderResults = (): React.JSX.Element | null => {
    if (!quizData) return null;
    const percentage = Math.round((score / quizData.questions.length) * 100);

    return (
      <div className="space-y-6 pt-4 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-6">
            <Award
              className={cn(
                "h-16 w-16",
                percentage >= 70 ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-2xl font-bold">Quiz Complete!</h3>
          <p className="text-muted-foreground">
            You scored {score} out of {quizData.questions.length}
          </p>
          <div className="text-4xl font-extrabold text-primary">{percentage}%</div>
        </div>

        <div className="grid grid-cols-1 gap-2 text-left">
          <h4 className="mb-2 mt-4 text-sm font-semibold">Review</h4>
          {quizData.questions.map((q, idx) => {
            const userAnswer = userAnswers[idx];
            const isCorrect =
              userAnswer?.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();
            return (
              <div
                key={idx}
                className={cn(
                  "rounded border p-2 text-xs",
                  isCorrect ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                )}
              >
                <p className="font-medium text-foreground">
                  {idx + 1}. {q.question}
                </p>
                <p className={cn("mt-1", isCorrect ? "text-green-700" : "text-red-700")}>
                  {isCorrect ? "Correct" : `Your answer: ${userAnswer || "(skipped)"}`}
                </p>
                {!isCorrect && <p className="text-green-700">Correct: {q.correctAnswer}</p>}
              </div>
            );
          })}
        </div>

        <Button onClick={resetQuiz} className="w-full" size="lg">
          <RefreshCw className="mr-2 h-4 w-4" /> Try Another Quiz
        </Button>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">AI Quiz Generator</h2>
      </div>

      {videoTitle && (
        <p className="mb-4 line-clamp-1 text-sm text-muted-foreground" title={videoTitle}>
          {videoTitle}
        </p>
      )}

      <ScrollArea className="flex-1 px-1">
        {state === "setup" && renderSetup()}
        {state === "loading" && renderLoading()}
        {state === "active" && renderActiveQuiz()}
        {state === "results" && renderResults()}
      </ScrollArea>
    </div>
  );
}
