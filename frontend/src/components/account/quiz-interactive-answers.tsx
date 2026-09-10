"use client";

import { useTranslations } from "next-intl";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Answer widgets for the question types that are not a list of options.
 *
 * All of them encode their answer as `number[]`, the same shape the choice
 * questions already use, so the quiz state and scoring stay uniform. Each is
 * positional: the value at index i is correct exactly when it equals i.
 *
 * * matching  -- `answer[i]` is the index of the pair joined to left item
 *                `i`, drawn as an arrow between the two columns
 * * ordering  -- `answer` is the sequence of word indices in the student's
 *                order
 * * cloze     -- `answer[i]` is the index of the word placed in gap `i`, or
 *                -1 while the gap is still empty
 *
 * The right column and the word banks are shuffled for display, otherwise the
 * answer would be the order the server happened to send.
 */

/** Deterministic shuffle so a question does not reshuffle on every render. */
export function stableShuffle<T>(items: T[], seed: string): T[] {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    const target = Math.abs(hash) % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

type MatchingProps = {
  questionId: string;
  /** Left-hand items, in their stored order. */
  items: string[];
  /** `pairs[i]` is the correct match for `items[i]`. */
  pairs: string[];
  draftAnswer: number[];
  submittedAnswer?: number[];
  onDraftChange: (answer: number[]) => void;
};

/** One drawn connection, in container coordinates. */
type MatchingLink = {
  itemIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state: "chosen" | "correct" | "wrong";
};

export function QuizMatchingAnswer({
  questionId,
  items,
  pairs,
  draftAnswer,
  submittedAnswer,
  onDraftChange,
}: MatchingProps) {
  const t = useTranslations("quizAnswers");
  const isAnswered = submittedAnswer !== undefined;
  const answer = submittedAnswer ?? draftAnswer;
  const [activeItem, setActiveItem] = useState<number | null>(null);
  const [links, setLinks] = useState<MatchingLink[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pairRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Display order of the right column: indices into `pairs`.
  const shuffledPairIndexes = useMemo(
    () => stableShuffle(pairs.map((_, index) => index), `${questionId}:pairs`),
    [pairs, questionId],
  );

  const assignedPair = (itemIndex: number) => {
    const value = answer[itemIndex];
    return typeof value === "number" && value >= 0 ? value : -1;
  };

  /**
   * Measure the two columns and lay a line between every connected pair.
   *
   * Positions come from the DOM rather than from a fixed row height, so the
   * lines stay attached when a label wraps onto two lines.
   */
  const measureLinks = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect();

    const next: MatchingLink[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const value = answer[itemIndex];
      const pairIndex = typeof value === "number" && value >= 0 ? value : -1;
      if (pairIndex < 0) continue;
      const from = itemRefs.current[itemIndex];
      const to = pairRefs.current[pairIndex];
      if (!from || !to) continue;

      const fromBox = from.getBoundingClientRect();
      const toBox = to.getBoundingClientRect();
      next.push({
        itemIndex,
        x1: fromBox.right - base.left,
        y1: fromBox.top + fromBox.height / 2 - base.top,
        x2: toBox.left - base.left,
        y2: toBox.top + toBox.height / 2 - base.top,
        state: isAnswered
          ? pairIndex === itemIndex
            ? "correct"
            : "wrong"
          : "chosen",
      });
    }
    setLinks(next);
  }, [answer, isAnswered, items.length]);

  useLayoutEffect(() => {
    measureLinks();
  }, [measureLinks]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureLinks());
    observer.observe(container);
    return () => observer.disconnect();
  }, [measureLinks]);

  function connect(itemIndex: number, pairIndex: number) {
    if (isAnswered) return;
    const next: number[] = [];
    for (let index = 0; index < items.length; index += 1) {
      next.push(assignedPair(index));
    }

    // Clicking the pair already joined to this item breaks the link.
    if (next[itemIndex] === pairIndex) {
      next[itemIndex] = -1;
      onDraftChange(next);
      setActiveItem(null);
      return;
    }
    // A pair belongs to one item only, so it is taken from whoever held it.
    for (let index = 0; index < next.length; index += 1) {
      if (next[index] === pairIndex) next[index] = -1;
    }
    next[itemIndex] = pairIndex;
    onDraftChange(next);
    setActiveItem(null);
  }

  function pickItem(itemIndex: number) {
    if (isAnswered) return;
    // Tapping a connected item releases it, ready to be joined again.
    if (assignedPair(itemIndex) >= 0) {
      const next: number[] = [];
      for (let index = 0; index < items.length; index += 1) {
        next.push(index === itemIndex ? -1 : assignedPair(index));
      }
      onDraftChange(next);
      setActiveItem(itemIndex);
      return;
    }
    setActiveItem((current) => (current === itemIndex ? null : itemIndex));
  }

  function pickPair(pairIndex: number) {
    if (isAnswered) return;
    const holder = items.findIndex(
      (_, itemIndex) => assignedPair(itemIndex) === pairIndex,
    );
    // With nothing selected, tapping a joined pair releases it.
    if (activeItem === null) {
      if (holder >= 0) connect(holder, pairIndex);
      return;
    }
    connect(activeItem, pairIndex);
  }

  // Rows whose arrow went to the wrong pair, listed under the grid so the
  // cards themselves stay the same size.
  const wrongRows = isAnswered
    ? items
        .map((_, itemIndex) => itemIndex)
        .filter((itemIndex) => assignedPair(itemIndex) !== itemIndex)
    : [];

  const linkStroke = {
    chosen: "var(--theme-action)",
    correct: "var(--theme-success-text)",
    wrong: "var(--theme-danger-text)",
  } as const;

  return (
    <div className="mt-8">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
        {isAnswered
          ? t("asocierileTale")
          : activeItem === null
            ? t("alegeUnElementDinStanga")
            : t("acumAlegePerecheaDinDreapta")}
      </p>

      {/* One grid rather than two columns: `auto-rows-fr` makes every row
          the same height, so the cards match and the arrows stay level. */}
      <div
        ref={containerRef}
        className="relative mt-3 grid auto-rows-fr grid-cols-2 items-stretch gap-x-12 gap-y-3 sm:gap-x-20"
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            {(["chosen", "correct", "wrong"] as const).map((state) => (
              <marker
                key={state}
                id={`${questionId}-arrow-${state}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill={linkStroke[state]} />
              </marker>
            ))}
          </defs>
          {links.map((link) => (
            <line
              key={`${questionId}-link-${link.itemIndex}`}
              x1={link.x1}
              y1={link.y1}
              x2={link.x2}
              y2={link.y2}
              stroke={linkStroke[link.state]}
              strokeWidth={2}
              strokeLinecap="round"
              markerEnd={`url(#${questionId}-arrow-${link.state})`}
            />
          ))}
        </svg>

        {items.map((item, rowIndex) => {
          const pairIndex = shuffledPairIndexes[rowIndex];
          const assigned = assignedPair(rowIndex);
          const isItemCorrect = assigned === rowIndex;
          const isActive = activeItem === rowIndex;
          const holder = items.findIndex(
            (_, itemIndex) => assignedPair(itemIndex) === pairIndex,
          );
          const isTaken = holder >= 0;
          const isPairCorrect = holder === pairIndex;

          return (
            <Fragment key={`${questionId}-row-${rowIndex}`}>
              <button
                ref={(node) => {
                  itemRefs.current[rowIndex] = node;
                }}
                type="button"
                onClick={() => pickItem(rowIndex)}
                disabled={isAnswered}
                aria-pressed={isActive || assigned >= 0}
                className={`relative z-10 h-full rounded-md border px-3 py-3 text-left text-xs font-bold leading-5 transition ${
                  isAnswered
                    ? isItemCorrect
                      ? "border-success-border bg-success-soft text-success"
                      : "border-danger-border bg-danger-soft text-danger"
                    : isActive
                      ? "border-action bg-action text-on-action"
                      : assigned >= 0
                        ? "border-action bg-action-soft text-content"
                        : "border-subtle bg-surface text-content hover:bg-surface-hover"
                }`}
              >
                {item}
              </button>

              <button
                ref={(node) => {
                  pairRefs.current[pairIndex] = node;
                }}
                type="button"
                onClick={() => pickPair(pairIndex)}
                disabled={isAnswered}
                aria-pressed={isTaken}
                className={`relative z-10 h-full rounded-md border px-3 py-3 text-left text-xs font-bold leading-5 transition ${
                  isAnswered
                    ? isTaken
                      ? isPairCorrect
                        ? "border-success-border bg-success-soft text-success"
                        : "border-danger-border bg-danger-soft text-danger"
                      : "border-subtle bg-surface text-muted"
                    : isTaken
                      ? "border-action bg-action-soft text-content"
                      : activeItem === null
                        ? "border-subtle bg-surface text-content hover:bg-surface-hover"
                        : "border-dashed border-action bg-surface text-content hover:bg-surface-hover"
                }`}
              >
                {pairs[pairIndex]}
              </button>
            </Fragment>
          );
        })}
      </div>

      {isAnswered && wrongRows.length ? (
        <div className="mt-4 space-y-1 rounded-md border border-subtle bg-surface px-4 py-3">
          {wrongRows.map((rowIndex) => (
            <p
              key={`${questionId}-fix-${rowIndex}`}
              className="text-xs leading-6 text-muted"
            >
              {items[rowIndex]}:{" "}
              <strong className="text-content">{pairs[rowIndex]}</strong>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type OrderingProps = {
  questionId: string;
  /** The sentence words, in their correct order. */
  words: string[];
  draftAnswer: number[];
  submittedAnswer?: number[];
  onDraftChange: (answer: number[]) => void;
};

export function QuizOrderingAnswer({
  questionId,
  words,
  draftAnswer,
  submittedAnswer,
  onDraftChange,
}: OrderingProps) {
  const t = useTranslations("quizAnswers");
  const isAnswered = submittedAnswer !== undefined;
  const placed = submittedAnswer ?? draftAnswer;
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const bank = useMemo(
    () => stableShuffle(words.map((_, index) => index), `${questionId}:words`),
    [questionId, words],
  );
  const remaining = bank.filter((wordIndex) => !placed.includes(wordIndex));

  function place(wordIndex: number) {
    if (isAnswered || placed.includes(wordIndex)) return;
    onDraftChange([...placed, wordIndex]);
  }

  function removeAt(slot: number) {
    if (isAnswered) return;
    onDraftChange(placed.filter((_, index) => index !== slot));
  }

  function moveTo(from: number, to: number) {
    if (isAnswered || from === to) return;
    const next = [...placed];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onDraftChange(next);
  }

  return (
    <div className="mt-8 space-y-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
          {t("propozitiaTa")}
        </p>
        <div
          onDragOver={(event) => {
            if (!isAnswered && dragIndex !== null) event.preventDefault();
          }}
          onDrop={() => {
            // Dropped past the last word: move it to the end.
            if (dragIndex !== null) moveTo(dragIndex, placed.length - 1);
            setDragIndex(null);
          }}
          className={`mt-3 flex min-h-20 flex-wrap items-start gap-2 rounded-md border p-4 ${
            isAnswered ? "border-subtle bg-app" : "border-dashed border-subtle bg-app"
          }`}
        >
          {placed.length === 0 ? (
            <p className="text-xs leading-6 text-muted">
              {t("trageSauApasaCuvinteleDe")}
            </p>
          ) : null}

          {placed.map((wordIndex, slot) => {
            // Correct when the word sitting in this slot is the one that
            // belongs there; words are stored in their correct order.
            const isWordCorrect = wordIndex === slot;

            return (
              <button
                key={`${questionId}-slot-${slot}`}
                type="button"
                draggable={!isAnswered}
                onDragStart={() => setDragIndex(slot)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(event) => {
                  if (!isAnswered && dragIndex !== null) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.stopPropagation();
                  if (dragIndex !== null) moveTo(dragIndex, slot);
                  setDragIndex(null);
                }}
                onClick={() => removeAt(slot)}
                disabled={isAnswered}
                title={isAnswered ? undefined : t("apasaPentruAScoateCuvantul")}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  isAnswered
                    ? isWordCorrect
                      ? "border-success-border bg-success-soft text-success"
                      : "border-danger-border bg-danger-soft text-danger"
                    : "cursor-grab border-action bg-action-soft text-content active:cursor-grabbing"
                }`}
              >
                {words[wordIndex]}
              </button>
            );
          })}
        </div>
      </div>

      {!isAnswered ? (
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
            {t("cuvinteDisponibile")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {remaining.length === 0 ? (
              <p className="text-xs leading-6 text-muted">
                {t("aiFolositToateCuvintele")}
              </p>
            ) : null}
            {remaining.map((wordIndex) => (
              <button
                key={`${questionId}-bank-${wordIndex}`}
                type="button"
                draggable
                onDragStart={() => setDragIndex(null)}
                onClick={() => place(wordIndex)}
                className="cursor-grab rounded-md border border-subtle bg-surface px-3 py-2 text-sm font-semibold text-content transition hover:bg-surface-hover active:cursor-grabbing"
              >
                {words[wordIndex]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isAnswered ? (
        <p className="rounded-md border border-subtle bg-surface px-4 py-3 text-xs leading-6 text-muted">
          {t("propozitiaCorecta")}{" "}
          <strong className="text-content">{words.join(" ")}</strong>
        </p>
      ) : null}
    </div>
  );
}

type ClozeProps = {
  questionId: string;
  /** The sentence, split on its gaps: `segments.length === gapCount + 1`. */
  segments: string[];
  /**
   * Every word offered, correct ones first in gap order, then the
   * distractors. So the word belonging in gap `i` sits at index `i`.
   */
  words: string[];
  gapCount: number;
  draftAnswer: number[];
  submittedAnswer?: number[];
  onDraftChange: (answer: number[]) => void;
};

export function QuizClozeAnswer({
  questionId,
  segments,
  words,
  gapCount,
  draftAnswer,
  submittedAnswer,
  onDraftChange,
}: ClozeProps) {
  const t = useTranslations("quizAnswers");
  const isAnswered = submittedAnswer !== undefined;
  const answer = submittedAnswer ?? draftAnswer;
  const [activeGap, setActiveGap] = useState(0);

  const bank = useMemo(
    () => stableShuffle(words.map((_, index) => index), `${questionId}:cloze`),
    [questionId, words],
  );

  function filled(gapIndex: number) {
    const value = answer[gapIndex];
    return typeof value === "number" && value >= 0 ? value : -1;
  }

  /** Put a word in the focused gap, or take it back out. */
  function place(wordIndex: number) {
    if (isAnswered) return;
    const next: number[] = [];
    for (let gap = 0; gap < gapCount; gap += 1) next.push(filled(gap));

    if (next[activeGap] === wordIndex) {
      next[activeGap] = -1;
      onDraftChange(next);
      return;
    }
    // A word can only sit in one gap, so move it rather than duplicate it.
    for (let gap = 0; gap < next.length; gap += 1) {
      if (next[gap] === wordIndex) next[gap] = -1;
    }
    next[activeGap] = wordIndex;
    onDraftChange(next);

    // Jump to the next still-empty gap so several gaps fill in one pass.
    const nextEmpty = next.findIndex((value) => value < 0);
    setActiveGap(nextEmpty >= 0 ? nextEmpty : activeGap);
  }

  function clearGap(gapIndex: number) {
    if (isAnswered) return;
    const next: number[] = [];
    for (let gap = 0; gap < gapCount; gap += 1) next.push(filled(gap));
    next[gapIndex] = -1;
    onDraftChange(next);
    setActiveGap(gapIndex);
  }

  const placedWords = new Set(
    Array.from({ length: gapCount }, (_, gap) => filled(gap)).filter((v) => v >= 0),
  );

  return (
    <div className="mt-8 space-y-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
          {t("propozitia")}
        </p>
        <p className="mt-3 rounded-md border border-subtle bg-app p-4 text-base leading-9 text-content">
          {segments.map((segment, segmentIndex) => {
            const gapIndex = segmentIndex;
            const hasGap = gapIndex < gapCount;
            const placed = hasGap ? filled(gapIndex) : -1;
            // Gap i is correct when it holds the word stored at index i.
            const isGapCorrect = placed === gapIndex;

            return (
              <span key={`${questionId}-seg-${segmentIndex}`}>
                {segment}
                {hasGap ? (
                  <button
                    type="button"
                    onClick={() =>
                      isAnswered
                        ? undefined
                        : placed >= 0
                          ? clearGap(gapIndex)
                          : setActiveGap(gapIndex)
                    }
                    disabled={isAnswered}
                    aria-label={`Golul ${gapIndex + 1}`}
                    className={`mx-1 inline-flex min-w-24 items-center justify-center rounded-md border px-2 py-1 text-sm font-bold align-middle transition ${
                      isAnswered
                        ? isGapCorrect
                          ? "border-success-border bg-success-soft text-success"
                          : "border-danger-border bg-danger-soft text-danger"
                        : placed >= 0
                          ? "border-action bg-action-soft text-content"
                          : activeGap === gapIndex
                            ? "border-action bg-surface text-muted"
                            : "border-dashed border-subtle bg-surface text-muted"
                    }`}
                  >
                    {/* Non-breaking spaces give an empty gap a visible width. */}
                    {placed >= 0 ? words[placed] : " ".repeat(6)}
                  </button>
                ) : null}
              </span>
            );
          })}
        </p>
      </div>

      {!isAnswered ? (
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
            {t("cuvinteDisponibile")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {bank.map((wordIndex) => {
              const isUsed = placedWords.has(wordIndex);
              return (
                <button
                  key={`${questionId}-word-${wordIndex}`}
                  type="button"
                  onClick={() => place(wordIndex)}
                  disabled={isUsed}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    isUsed
                      ? "cursor-not-allowed border-subtle text-muted opacity-40"
                      : "border-subtle bg-surface text-content hover:bg-surface-hover"
                  }`}
                >
                  {words[wordIndex]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isAnswered ? (
        <div className="rounded-md border border-subtle bg-surface px-4 py-3 text-xs leading-6 text-muted">
          {Array.from({ length: gapCount }, (_, gapIndex) => {
            const placed = filled(gapIndex);
            if (placed === gapIndex) return null;
            return (
              <p key={`${questionId}-fix-${gapIndex}`}>
                Golul {gapIndex + 1}:{" "}
                <strong className="text-content">{words[gapIndex]}</strong>
              </p>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
