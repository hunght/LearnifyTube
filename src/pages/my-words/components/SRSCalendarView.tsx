import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Flashcard } from "@/api/db/schema";

interface SRSCalendarViewProps {
  flashcards: Flashcard[];
  studyDates?: number[]; // Timestamps of days when user studied
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function SRSCalendarView({
  flashcards,
  studyDates = [],
}: SRSCalendarViewProps): React.JSX.Element {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Calculate review forecast for each day
  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    // Build a map of date -> review count
    const reviewMap = new Map<string, number>();

    flashcards.forEach((card) => {
      if (!card.nextReviewAt) return;
      const reviewDate = new Date(card.nextReviewAt);
      const dateKey = `${reviewDate.getFullYear()}-${reviewDate.getMonth()}-${reviewDate.getDate()}`;
      reviewMap.set(dateKey, (reviewMap.get(dateKey) ?? 0) + 1);
    });

    // Build a set of study dates
    const studySet = new Set<string>();
    studyDates.forEach((timestamp) => {
      const date = new Date(timestamp);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      studySet.add(dateKey);
    });

    // Generate calendar cells
    const cells: Array<{
      day: number | null;
      dateKey: string;
      reviewCount: number;
      isToday: boolean;
      isPast: boolean;
      isFuture: boolean;
      hasStudied: boolean;
    }> = [];

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    // Add padding for days before the 1st
    for (let i = 0; i < startPadding; i++) {
      cells.push({
        day: null,
        dateKey: "",
        reviewCount: 0,
        isToday: false,
        isPast: true,
        isFuture: false,
        hasStudied: false,
      });
    }

    // Add actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${month}-${day}`;
      const cellDate = new Date(year, month, day);
      const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isFuture = cellDate > today;

      cells.push({
        day,
        dateKey,
        reviewCount: reviewMap.get(dateKey) ?? 0,
        isToday: dateKey === todayKey,
        isPast,
        isFuture,
        hasStudied: studySet.has(dateKey),
      });
    }

    return cells;
  }, [currentMonth, flashcards, studyDates]);

  // Calculate statistics
  const stats = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const todayCell = calendarData.find((c) => c.dateKey === todayKey);

    let weekTotal = 0;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());

    calendarData.forEach((cell) => {
      if (!cell.day) return;
      const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), cell.day);
      if (cellDate >= weekStart && cellDate <= today) {
        weekTotal += cell.reviewCount;
      }
    });

    return {
      todayDue: todayCell?.reviewCount ?? 0,
      weekTotal,
    };
  }, [calendarData, currentMonth]);

  const navigateMonth = (delta: number): void => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const goToToday = (): void => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Get intensity class based on review count
  const getIntensityClass = (count: number, isPast: boolean): string => {
    if (count === 0) return "";
    if (isPast) {
      // Past days - gray tones
      if (count >= 10) return "bg-gray-400 dark:bg-gray-500";
      if (count >= 5) return "bg-gray-300 dark:bg-gray-600";
      return "bg-gray-200 dark:bg-gray-700";
    }
    // Future/today - color based on intensity
    if (count >= 10) return "bg-red-500 text-white";
    if (count >= 5) return "bg-orange-400 text-white";
    if (count >= 3) return "bg-yellow-400";
    return "bg-green-300 dark:bg-green-700";
  };

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-primary" />
            Review Calendar
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <button
              onClick={goToToday}
              className="min-w-[100px] text-center text-xs font-medium hover:text-primary"
              title="Go to today"
            >
              {MONTHS[currentMonth.getMonth()].slice(0, 3)} {currentMonth.getFullYear()}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => navigateMonth(1)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 pt-0">
        {/* Stats Summary - inline with header style */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Flame className="h-3 w-3 text-orange-500" />
            <span>
              <span className="font-semibold text-foreground">{stats.todayDue}</span> due today
            </span>
          </div>
          <span className="text-border">|</span>
          <span>
            <span className="font-semibold text-foreground">{stats.weekTotal}</span> this week
          </span>
        </div>

        {/* Calendar Grid - Compact */}
        <div className="grid grid-cols-7 gap-0.5">
          {/* Day Headers */}
          {DAYS.map((day) => (
            <div
              key={day}
              className="py-0.5 text-center text-[10px] font-medium text-muted-foreground"
            >
              {day.charAt(0)}
            </div>
          ))}

          {/* Calendar Cells - Compact */}
          {calendarData.map((cell, idx) => (
            <div
              key={idx}
              className={cn(
                "relative flex h-6 w-full items-center justify-center rounded text-[11px] transition-colors",
                cell.day === null && "bg-transparent",
                cell.day !== null && "border border-border/50",
                cell.isToday && "ring-1 ring-primary",
                cell.isPast && cell.day !== null && "opacity-50",
                getIntensityClass(cell.reviewCount, cell.isPast)
              )}
              title={
                cell.day
                  ? `${cell.reviewCount} card${cell.reviewCount !== 1 ? "s" : ""} ${cell.isPast ? "were" : ""} due`
                  : undefined
              }
            >
              {cell.day}
              {/* Study indicator */}
              {cell.hasStudied && (
                <div className="absolute -bottom-0.5 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-green-500" />
              )}
              {/* Review count badge */}
              {cell.reviewCount >= 5 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                  {cell.reviewCount > 9 ? "+" : cell.reviewCount}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Legend - More compact */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-0.5">
            <div className="h-2 w-2 rounded-sm bg-green-300 dark:bg-green-700" />
            <span>1-2</span>
          </div>
          <div className="flex items-center gap-0.5">
            <div className="h-2 w-2 rounded-sm bg-yellow-400" />
            <span>3-4</span>
          </div>
          <div className="flex items-center gap-0.5">
            <div className="h-2 w-2 rounded-sm bg-orange-400" />
            <span>5-9</span>
          </div>
          <div className="flex items-center gap-0.5">
            <div className="h-2 w-2 rounded-sm bg-red-500" />
            <span>10+</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
