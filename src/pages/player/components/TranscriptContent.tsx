import React, { useRef, useCallback } from "react";
import { TranscriptWord } from "./TranscriptWord";
import { logger } from "@/helpers/logger";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptContentProps {
  segments: TranscriptSegment[];
  activeSegIndex: number | null;
  fontFamily: "system" | "serif" | "mono";
  fontSize: number;
  showInlineTranslations: boolean;
  hoveredWord: string | null;
  translationMap: Map<string, { translatedText: string; targetLang: string; queryCount: number }>;
  onMouseDown?: () => void;
  onMouseUp?: (e?: React.MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onWordMouseEnter: (word: string) => void;
  onWordMouseLeave: () => void;
  isSelecting: boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
  segRefs?: React.MutableRefObject<Array<HTMLParagraphElement | null>>;
  secondarySegments?: TranscriptSegment[];
}

export function TranscriptContent({
  segments,
  activeSegIndex,
  fontFamily,
  fontSize,
  showInlineTranslations,
  hoveredWord,
  translationMap,
  onMouseDown,
  onMouseUp,
  onKeyDown,
  onWordMouseEnter,
  onWordMouseLeave,
  isSelecting,
  containerRef,
  segRefs,
  secondarySegments,
}: TranscriptContentProps): React.JSX.Element {
  // Log props changes
  React.useEffect(() => {
    logger.debug("[TranscriptContent] Props received", {
      segmentsLength: segments.length,
      activeSegIndex,
      hasContainerRef: !!containerRef,
      hasSegRefs: !!segRefs,
      secondarySegmentsLength: secondarySegments?.length ?? 0,
    });
  }, [segments.length, activeSegIndex, containerRef, segRefs, secondarySegments?.length]);

  const internalContainerRef = useRef<HTMLDivElement>(null);
  const internalSegRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  const finalContainerRef = containerRef || internalContainerRef;
  const finalSegRefs = segRefs || internalSegRefs;

  // Get font family CSS string
  const getFontFamily = (): string => {
    if (fontFamily === "serif") {
      return "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
    } else if (fontFamily === "mono") {
      return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    }
    return "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'";
  };

  // Get translation for a word (O(1) lookup)
  const getTranslationForWord = useCallback(
    (word: string) => {
      if (!showInlineTranslations || translationMap.size === 0) return null;

      const cleanWord = word.toLowerCase().trim();
      let translation = translationMap.get(cleanWord);

      // If not found, try without punctuation
      if (!translation) {
        const noPunctuation = word
          .replace(/[.,!?;:'"()\[\]{}]/g, "")
          .toLowerCase()
          .trim();
        translation = translationMap.get(noPunctuation);
      }

      return translation;
    },
    [translationMap, showInlineTranslations]
  );

  // Render text with individual word highlighting and inline translations
  const renderTextWithWords = (text: string): React.JSX.Element => {
    logger.debug("[TranscriptContent] renderTextWithWords called", {
      inputText: text,
      inputTextLength: text.length,
    });

    // Split text into words while preserving punctuation
    const words = text.split(/(\s+)/); // Preserve spaces

    logger.debug("[TranscriptContent] renderTextWithWords split result", {
      wordsCount: words.length,
      words: words.slice(0, 10), // First 10 words for debugging
    });

    return (
      <span className="inline-flex flex-wrap items-start gap-x-1">
        {words.map((word, idx) => {
          const isHovered = hoveredWord === word && word.trim().length > 0;
          const translation = getTranslationForWord(word);
          const hasTranslation = !!translation;

          return (
            <TranscriptWord
              key={idx}
              word={word}
              isHovered={isHovered}
              hasTranslation={hasTranslation}
              translation={translation}
              showInlineTranslations={showInlineTranslations}
              onMouseEnter={() => word.trim() && onWordMouseEnter(word)}
              onMouseLeave={onWordMouseLeave}
            />
          );
        })}
      </span>
    );
  };

  return (
    <>
      <style>
        {`
          .transcript-text::selection {
            background-color: rgba(59, 130, 246, 0.3);
            color: inherit;
          }
        `}
      </style>

      <div className="relative">
        <div
          className="relative flex h-[150px] items-end justify-center overflow-hidden rounded-lg border bg-gradient-to-br from-background to-muted/20 p-6 shadow-sm"
          ref={finalContainerRef}
          onMouseDown={segments.length > 0 ? onMouseDown : undefined}
          onMouseUp={segments.length > 0 ? onMouseUp : undefined}
          onKeyDown={segments.length > 0 ? onKeyDown : undefined}
          tabIndex={segments.length > 0 ? 0 : undefined}
          style={{
            userSelect: segments.length > 0 ? "text" : "none",
            cursor: isSelecting ? "text" : "default",
          }}
        >
          <div className="w-full space-y-1 pb-4 text-center">
            {/* Determine which segment to show - use activeSegIndex or fallback to first segment */}
            {(() => {
              logger.debug("[TranscriptContent] Rendering transcript", {
                activeSegIndex,
                segmentsLength: segments.length,
                hasSegments: segments.length > 0,
              });

              const displayIndex =
                activeSegIndex !== null ? activeSegIndex : segments.length > 0 ? 0 : null;

              logger.debug("[TranscriptContent] Display index calculation", {
                displayIndex,
                activeSegIndex,
                segmentsLength: segments.length,
                willRender: displayIndex !== null && segments[displayIndex] !== undefined,
              });

              if (displayIndex === null) {
                logger.warn("[TranscriptContent] displayIndex is null, not rendering", {
                  activeSegIndex,
                  segmentsLength: segments.length,
                });
                return null;
              }

              if (!segments[displayIndex]) {
                logger.warn("[TranscriptContent] Segment at displayIndex does not exist", {
                  displayIndex,
                  segmentsLength: segments.length,
                  availableIndices: segments.map((_, i) => i),
                });
                return null;
              }

              const segmentToRender = segments[displayIndex];
              logger.info("[TranscriptContent] RENDERING SEGMENT TO UI", {
                displayIndex,
                segmentStart: segmentToRender.start,
                segmentEnd: segmentToRender.end,
                rawText: segmentToRender.text,
                rawTextLength: segmentToRender.text.length,
                rawTextFull: segmentToRender.text, // Full text without truncation
                // Show what will be rendered
                willRenderPrevious2: displayIndex > 1 && segments[displayIndex - 2],
                willRenderPrevious1: displayIndex > 0 && segments[displayIndex - 1],
                previous2Text:
                  displayIndex > 1 && segments[displayIndex - 2]
                    ? segments[displayIndex - 2].text
                    : null,
                previous1Text:
                  displayIndex > 0 && segments[displayIndex - 1]
                    ? segments[displayIndex - 1].text
                    : null,
                currentText: segmentToRender.text,
              });

              return (
                <>
                  {/* Show previous 2 lines in faded color for context */}
                  {displayIndex > 1 && segments[displayIndex - 2] && (
                    <div
                      className="transcript-text cursor-text px-4 text-foreground/30"
                      style={{
                        fontFamily: getFontFamily(),
                        fontSize: `${fontSize - 2}px`,
                        lineHeight: showInlineTranslations ? "1.8" : "1.5",
                        minHeight: showInlineTranslations ? "2em" : "auto",
                      }}
                    >
                      {renderTextWithWords(segments[displayIndex - 2].text)}
                    </div>
                  )}
                  {/* Show previous line in lighter color */}
                  {displayIndex > 0 && segments[displayIndex - 1] && (
                    <div
                      className="transcript-text cursor-text px-4 text-foreground/50"
                      style={{
                        fontFamily: getFontFamily(),
                        fontSize: `${fontSize - 1}px`,
                        lineHeight: showInlineTranslations ? "1.8" : "1.5",
                        minHeight: showInlineTranslations ? "2em" : "auto",
                      }}
                    >
                      {renderTextWithWords(segments[displayIndex - 1].text)}
                    </div>
                  )}
                  {/* Show current line (active) */}
                  {segments[displayIndex] && (
                    <div
                      ref={(el) => {
                        if (el) finalSegRefs.current[displayIndex] = el;
                      }}
                      className="transcript-text cursor-text px-4 font-semibold leading-relaxed text-foreground"
                      style={{
                        fontFamily: getFontFamily(),
                        fontSize: `${fontSize}px`,
                        lineHeight: showInlineTranslations ? "1.9" : "1.6",
                        minHeight: showInlineTranslations ? "2.2em" : "auto",
                      }}
                      data-start={segments[displayIndex].start}
                      data-end={segments[displayIndex].end}
                    >
                      {renderTextWithWords(segments[displayIndex].text)}

                      {/* Secondary Subtitle */}
                      {secondarySegments && secondarySegments.length > 0 && (
                        <div
                          className="mt-2 font-normal text-muted-foreground"
                          style={{ fontSize: `${Math.max(12, fontSize - 2)}px` }}
                        >
                          {(() => {
                            const currentStart = segments[displayIndex].start;
                            const currentEnd = segments[displayIndex].end;
                            const match = secondarySegments.find(
                              (s) =>
                                (s.start <= currentEnd && s.end >= currentStart) || // Overlap
                                (s.start >= currentStart && s.start < currentEnd) // Starts within
                            );
                            return match ? match.text : null;
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-8 rounded-t-lg bg-gradient-to-b from-background to-transparent" />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 rounded-b-lg bg-gradient-to-t from-background to-transparent" />
        </div>
      </div>
    </>
  );
}
