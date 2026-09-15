"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";

type FlashcardTone = "success" | "warning" | "info" | "danger";

type FlashcardEntry = {
  id: string;
  topic: string;
  question: string;
  questionImage?: string;
  answer: string;
  tone: FlashcardTone;
};

// Card copy lives in messages/*.json under marketing.flashcards.cards; the
// fourth card shows an image instead of a question.
const flashcardSlots = [
  { id: "1", tone: "success" },
  { id: "2", tone: "warning" },
  { id: "3", tone: "info" },
  { id: "4", tone: "danger", questionImage: "/bubble-sort.png" },
] as const;

type FlashcardTranslator = ReturnType<
  typeof useTranslations<"marketing.flashcards">
>;

function useFlashcards(t: FlashcardTranslator): FlashcardEntry[] {
  return flashcardSlots.map((slot) => ({
    id: slot.id,
    topic: t(`cards.${slot.id}.topic`),
    question:
      "questionImage" in slot
        ? ""
        : t(`cards.${slot.id as "1" | "2" | "3"}.question`),
    questionImage: "questionImage" in slot ? slot.questionImage : undefined,
    answer: t(`cards.${slot.id}.answer`),
    tone: slot.tone,
  }));
}

/** Where each card sits in the stack, by how far it is from the top one. */
const deskLayouts = [
  {
    x: "var(--flashcard-x-0, 0px)",
    y: "var(--flashcard-y-0, 8px)",
    rotate: -1.5,
  },
  {
    x: "var(--flashcard-x-1, 48px)",
    y: "var(--flashcard-y-1, 36px)",
    rotate: 5.5,
  },
  {
    x: "var(--flashcard-x-2, -38px)",
    y: "var(--flashcard-y-2, 58px)",
    rotate: -6.5,
  },
  {
    x: "var(--flashcard-x-3, 30px)",
    y: "var(--flashcard-y-3, 84px)",
    rotate: 3.5,
  },
];

type Flashcard = FlashcardEntry;

type ShuffleState =
  | {
      /** One card leaves the pile: the arrows. */
      id: number;
      mode: "move";
      cardIndex: number;
      direction: 1 | -1;
    }
  | {
      /** The whole pile is dealt again: the shuffle button. */
      id: number;
      mode: "mix";
      ghosts: MixGhost[];
    };

type MixGhost = {
  card: Flashcard;
  startDistance: number;
  endDistance: number;
  variant: number;
};

const MIX_DURATION_MS = 920;
// Each card leaves a beat after the one before it, as in the account deck.
const MIX_STAGGER_MS = 35;

/** Every visible card flies to a different slot, then the deck is re-dealt. */
function buildMixGhosts(cards: Flashcard[], activeIndex: number): MixGhost[] {
  const visible = Math.min(cards.length, deskLayouts.length);

  return Array.from({ length: visible }, (_, distance) => ({
    card: cards[(activeIndex + distance) % cards.length],
    startDistance: distance,
    endDistance: (distance * 2 + 1) % visible,
    variant: distance % deskLayouts.length,
  }));
}

function toTransform(layout: (typeof deskLayouts)[number]) {
  return `translate3d(${layout.x}, ${layout.y}, 0) rotate(${layout.rotate}deg)`;
}

function Icon({
  children,
  className = "h-4 w-4",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/**
 * Deal the deck again, never leaving the card on top where it was.
 *
 * A shuffle that happens to put the same question back reads as a button that
 * did nothing, so the top card is swapped with the first different one.
 */
function shuffleDeck(cards: Flashcard[], topCardId: string) {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  if (shuffled.length > 1 && shuffled[0]?.id === topCardId) {
    const firstDifferent = shuffled.findIndex((card) => card.id !== topCardId);
    if (firstDifferent > 0) {
      [shuffled[0], shuffled[firstDifferent]] = [
        shuffled[firstDifferent],
        shuffled[0],
      ];
    }
  }

  return shuffled;
}

function FlashcardFaceContent({
  card,
  side,
}: {
  card: Flashcard;
  side: "question" | "answer";
}) {
  const t = useTranslations("marketing.flashcards");
  const isAnswer = side === "answer";
  const text = isAnswer ? card.answer : card.question;
  const image = isAnswer ? undefined : card.questionImage;

  return (
    <div className="flashcard-card-content h-full">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden">
        {image ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-app/60 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              className="h-full max-h-full w-full max-w-full object-contain"
            />
          </div>
        ) : null}
        {text ? (
          <h3 className="flashcard-card-question font-serif text-2xl font-semibold leading-snug sm:text-3xl">
            {text}
          </h3>
        ) : null}
      </div>

      <div className="flashcard-card-footer absolute inset-x-6 bottom-6 flex items-center border-t border-subtle pt-4 text-xs font-bold text-muted sm:inset-x-8">
        <span className="flashcard-card-action">
          {isAnswer ? t("seeQuestion") : t("seeAnswer")}
        </span>
      </div>
    </div>
  );
}

function FlashcardContent({
  card,
  flipped = false,
}: {
  card: Flashcard;
  flipped?: boolean;
}) {
  return (
    <div
      className="flashcard-flip h-full"
      data-flipped={flipped ? "true" : "false"}
    >
      <div className="flashcard-flip-inner">
        <div className="flashcard-face-side theme-shadow-card rounded-[1.75rem] border border-subtle bg-surface p-6 text-content sm:p-8">
          <FlashcardFaceContent card={card} side="question" />
        </div>
        <div className="flashcard-face-side flashcard-face-side-back theme-shadow-card rounded-[1.75rem] border border-subtle bg-surface p-6 text-content sm:p-8">
          <FlashcardFaceContent card={card} side="answer" />
        </div>
      </div>
    </div>
  );
}

export function FlashcardStory() {
  const t = useTranslations("marketing.flashcards");
  const initialCards = useFlashcards(t);

  const [cards, setCards] = useState(initialCards);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [shuffle, setShuffle] = useState<ShuffleState | null>(null);
  const shuffleIdRef = useRef(0);
  const shuffleTimerRef = useRef<number | null>(null);

  // The deck is rebuilt when the language changes, because the translated
  // strings are the card identity here. Reconciling during render keeps the
  // texts in step without an effect that writes state after paint.
  const [renderedCards, setRenderedCards] = useState(initialCards);
  if (
    renderedCards !== initialCards &&
    renderedCards[0]?.topic !== initialCards[0]?.topic
  ) {
    setRenderedCards(initialCards);
    setCards(initialCards);
    setActiveIndex(0);
    setShowAnswer(false);
  }

  const total = cards.length;

  function clearShuffleTimer() {
    if (shuffleTimerRef.current) {
      window.clearTimeout(shuffleTimerRef.current);
      shuffleTimerRef.current = null;
    }
  }

  function moveCard(step: 1 | -1) {
    if (total <= 1) return;
    clearShuffleTimer();

    const nextIndex = (activeIndex + step + total) % total;
    // Going forward, the card that leaves is the one on top; going back, it is
    // the one arriving from under the pile.
    const leavingIndex = step === 1 ? activeIndex : nextIndex;

    shuffleIdRef.current += 1;
    const id = shuffleIdRef.current;
    setShuffle({ id, mode: "move", cardIndex: leavingIndex, direction: step });
    setActiveIndex(nextIndex);
    setShowAnswer(false);

    shuffleTimerRef.current = window.setTimeout(() => {
      setShuffle((current) => (current?.id === id ? null : current));
      shuffleTimerRef.current = null;
    }, 1800);
  }

  function handleShuffle() {
    if (total <= 1) return;
    clearShuffleTimer();

    // The deck is re-dealt only once the ghosts have landed. Reordering up
    // front would hide the new top card behind its own flying copy, which
    // reads as a button that did nothing.
    const shuffled = shuffleDeck(cards, cards[activeIndex]?.id ?? "");
    const ghosts = buildMixGhosts(cards, activeIndex);

    shuffleIdRef.current += 1;
    const id = shuffleIdRef.current;
    setShuffle({ id, mode: "mix", ghosts });
    setShowAnswer(false);

    shuffleTimerRef.current = window.setTimeout(() => {
      setCards(shuffled);
      setActiveIndex(0);
      setShuffle(null);
      shuffleTimerRef.current = null;
      // Flat, not duration + stagger: the account deck re-deals at exactly this
      // point and the two are meant to look the same.
    }, MIX_DURATION_MS);
  }

  // A card that is flying as a ghost must not also sit in the pile.
  const hiddenCardIds =
    shuffle?.mode === "move"
      ? [cards[shuffle.cardIndex]?.id]
      : shuffle?.mode === "mix"
        ? shuffle.ghosts.map((ghost) => ghost.card.id)
        : [];

  return (
    <section
      id="flashcards"
      className="relative overflow-hidden border-y border-subtle bg-surface/55"
    >
      <div className="flashcard-story-viewport relative px-5 py-16 sm:px-8 sm:py-20">
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-warning-border/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-16 h-80 w-80 rounded-full bg-success-border/20 blur-3xl" />

        <div className="flashcard-story-layout relative mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:gap-16">
          <div className="flashcard-story-copy">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              {t("eyebrow")}
            </p>
            <h2 className="flashcard-story-heading mt-3 max-w-xl font-serif text-3xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              {t("title")}
            </h2>
            <p className="flashcard-story-description mt-5 max-w-lg text-sm leading-7 text-muted sm:text-base">
              {t("description")}
            </p>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="flashcard-story-deck relative mx-auto w-full max-w-xl">
              {cards.map((card, index) => {
                const distance = (index - activeIndex + total) % total;
                const isActive = distance === 0;
                const isShuffling = hiddenCardIds.includes(card.id);

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() =>
                      isActive && setShowAnswer((visible) => !visible)
                    }
                    tabIndex={isActive ? 0 : -1}
                    aria-hidden={!isActive}
                    className="flashcard-desk-card flashcard-face absolute inset-x-3 top-0 rounded-[1.75rem] text-left outline-none transition focus-visible:ring-2 focus-visible:ring-action sm:inset-x-0"
                    style={{
                      zIndex: total - distance,
                      transform: toTransform(
                        deskLayouts[distance] ?? deskLayouts[0],
                      ),
                      visibility: isShuffling ? "hidden" : "visible",
                      pointerEvents: isActive ? "auto" : "none",
                    }}
                  >
                    <FlashcardContent
                      card={card}
                      flipped={showAnswer && isActive}
                    />
                  </button>
                );
              })}

              {shuffle?.mode === "move" ? (
                <div
                  key={shuffle.id}
                  aria-hidden="true"
                  className={`flashcard-shuffle-ghost flashcard-face pointer-events-none absolute inset-x-3 top-0 text-left sm:inset-x-0 ${
                    shuffle.direction === 1
                      ? "flashcard-shuffle-forward"
                      : "flashcard-shuffle-reverse"
                  }`}
                  style={
                    {
                      "--shuffle-start": toTransform(
                        shuffle.direction === 1
                          ? deskLayouts[0]
                          : (deskLayouts[total - 1] ?? deskLayouts[0]),
                      ),
                      "--shuffle-end": toTransform(
                        shuffle.direction === 1
                          ? (deskLayouts[total - 1] ?? deskLayouts[0])
                          : deskLayouts[0],
                      ),
                    } as React.CSSProperties
                  }
                >
                  <FlashcardContent card={cards[shuffle.cardIndex]} />
                </div>
              ) : null}

              {shuffle?.mode === "mix"
                ? shuffle.ghosts.map((ghost, index) => (
                    <div
                      key={`${shuffle.id}-${ghost.card.id}`}
                      aria-hidden="true"
                      className={`flashcard-shuffle-ghost flashcard-shuffle-mix flashcard-shuffle-mix-${ghost.variant} flashcard-face pointer-events-none absolute inset-x-3 top-0 text-left sm:inset-x-0`}
                      style={
                        {
                          "--shuffle-start": toTransform(
                            deskLayouts[ghost.startDistance] ?? deskLayouts[0],
                          ),
                          "--shuffle-end": toTransform(
                            deskLayouts[ghost.endDistance] ?? deskLayouts[0],
                          ),
                          "--shuffle-duration": `${MIX_DURATION_MS}ms`,
                          // The cascade is what the movement reads as: without
                          // it all four cards leave on the same frame and the
                          // pile just flickers.
                          "--shuffle-delay": `${index * MIX_STAGGER_MS}ms`,
                          "--mix-layer": index,
                        } as React.CSSProperties
                      }
                    >
                      <FlashcardContent card={ghost.card} />
                    </div>
                  ))
                : null}
            </div>

            {/* Sits below the stack, which overlaps its own cards by design, so
                the controls need room of their own rather than a corner of it. */}
            <div className="flashcard-story-controls flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => moveCard(-1)}
                  disabled={total <= 1}
                  aria-label={t("previousCard")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-subtle bg-app text-content transition hover:-translate-y-0.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-55 sm:h-12 sm:w-12"
                >
                  <Icon className="h-5 w-5">
                    <path d="M19 12H5M11 5l-7 7 7 7" />
                  </Icon>
                </button>
                <button
                  type="button"
                  onClick={() => moveCard(1)}
                  disabled={total <= 1}
                  aria-label={t("nextCard")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-action text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55 sm:h-12 sm:w-12"
                >
                  <Icon className="h-5 w-5">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </Icon>
                </button>
                <span className="min-w-14 rounded-md border border-subtle bg-app px-3 py-2 text-center text-xs font-bold text-muted">
                  {activeIndex + 1}/{total}
                </span>
              </div>

              <button
                type="button"
                onClick={handleShuffle}
                disabled={total <= 1}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-subtle bg-app px-5 text-xs font-bold text-content transition hover:-translate-y-0.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-55 sm:h-12 sm:text-sm"
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5">
                  <path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </Icon>
                {t("shuffle")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
