import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface VocabularyDataPoint {
  date: string;
  totalWords: number;
  masteredWords: number;
}

interface VocabularyGrowthChartProps {
  data: VocabularyDataPoint[];
}

export function VocabularyGrowthChart({ data }: VocabularyGrowthChartProps): React.JSX.Element {
  // Get last 30 days of data, interpolating missing days
  const chartData = React.useMemo(() => {
    if (data.length === 0) {
      // Generate empty data for 30 days
      const result: VocabularyDataPoint[] = [];
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        result.push({
          date: date.toISOString().split("T")[0],
          totalWords: 0,
          masteredWords: 0,
        });
      }
      return result;
    }

    // Sort data by date
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    const result: VocabularyDataPoint[] = [];
    const today = new Date();
    const dataMap = new Map(sorted.map((d) => [d.date, d]));

    let lastKnownTotal = 0;
    let lastKnownMastered = 0;

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const existing = dataMap.get(dateStr);
      if (existing) {
        lastKnownTotal = existing.totalWords;
        lastKnownMastered = existing.masteredWords;
        result.push(existing);
      } else {
        result.push({
          date: dateStr,
          totalWords: lastKnownTotal,
          masteredWords: lastKnownMastered,
        });
      }
    }

    return result;
  }, [data]);

  // Calculate stats
  const latestTotal = chartData[chartData.length - 1]?.totalWords ?? 0;
  const earliestTotal = chartData[0]?.totalWords ?? 0;
  const growth = latestTotal - earliestTotal;
  const maxWords = Math.max(...chartData.map((d) => d.totalWords), 1);

  // SVG dimensions
  const width = 100;
  const height = 40;
  const padding = 2;

  // Generate path for total words line
  const totalPath = React.useMemo(() => {
    if (chartData.length === 0) return "";
    const points = chartData.map((d, i) => {
      const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.totalWords / maxWords) * (height - padding * 2);
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
  }, [chartData, maxWords]);

  // Generate path for mastered words line
  const masteredPath = React.useMemo(() => {
    if (chartData.length === 0) return "";
    const points = chartData.map((d, i) => {
      const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.masteredWords / maxWords) * (height - padding * 2);
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
  }, [chartData, maxWords]);

  // Generate area fill for total words
  const areaPath = React.useMemo(() => {
    if (chartData.length === 0) return "";
    const points = chartData.map((d, i) => {
      const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.totalWords / maxWords) * (height - padding * 2);
      return `${x},${y}`;
    });
    const startX = padding;
    const endX =
      padding + ((chartData.length - 1) / (chartData.length - 1)) * (width - padding * 2);
    return `M ${startX},${height - padding} L ${points.join(" L ")} L ${endX},${height - padding} Z`;
  }, [chartData, maxWords]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-green-500" />
          Vocabulary Growth (Last 30 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stats Row */}
        <div className="mb-4 flex justify-between text-sm">
          <div>
            <span className="text-2xl font-bold">{latestTotal}</span>
            <span className="ml-1 text-muted-foreground">total words</span>
          </div>
          <div className="text-right">
            <span
              className={`text-lg font-semibold ${growth >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {growth >= 0 ? "+" : ""}
              {growth}
            </span>
            <span className="ml-1 text-muted-foreground">this month</span>
          </div>
        </div>

        {/* Chart */}
        <div className="h-40 w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full w-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            <line
              x1={padding}
              y1={height / 2}
              x2={width - padding}
              y2={height / 2}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeDasharray="2,2"
            />

            {/* Area fill */}
            <path d={areaPath} fill="url(#vocabGradient)" opacity={0.3} />

            {/* Total words line */}
            <path
              d={totalPath}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={0.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Mastered words line */}
            <path
              d={masteredPath}
              fill="none"
              stroke="hsl(142 76% 36%)"
              strokeWidth={0.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1,1"
            />

            {/* Gradient definition */}
            <defs>
              <linearGradient id="vocabGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-4 bg-primary" />
            <span>Total Words</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-4 border-t border-dashed border-green-600" />
            <span>Mastered</span>
          </div>
        </div>

        {/* Date labels */}
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </CardContent>
    </Card>
  );
}
