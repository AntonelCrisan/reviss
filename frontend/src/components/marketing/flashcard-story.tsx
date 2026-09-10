"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

type FlashcardTone = "success" | "warning" | "info" | "danger";

type FlashcardEntry = {
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

type FlashcardTranslator = ReturnType<typeof useTranslations<"marketing.flashcards">>;

function useFlashcards(t: FlashcardTranslator): FlashcardEntry[] {
  return flashcardSlots.map((slot) => ({
    topic: t(`cards.${slot.id}.topic`),
    question:
      "questionImage" in slot ? "" : t(`cards.${slot.id as "1" | "2" | "3"}.question`),
    questionImage: "questionImage" in slot ? slot.questionImage : undefined,
    answer: t(`cards.${slot.id}.answer`),
    tone: slot.tone,
  }));
}

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

type ShuffleState = {
  id: number;
  cardIndex: number;
  direction: 1 | -1;
};

function toTransform(layout: (typeof deskLayouts)[number]) {
  return `translate3d(${layout.x}, ${layout.y}, 0) rotate(${layout.rotate}deg)`;
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

function StaticFlashcards() {
  const t = useTranslations("marketing.flashcards");
  const flashcards = useFlashcards(t);

  return (
    <section id="flashcards" className="border-y border-subtle bg-surface/55">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
          {t("staticEyebrow")}
        </p>
        <h2 className="mt-3 max-w-3xl font-serif text-4xl font-semibold sm:text-5xl">
          {t("staticTitle")}
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {flashcards.map((card) => (
            <article
              key={card.topic}
              className="rounded-3xl border border-subtle bg-surface p-6"
            >
              {card.questionImage ? (
                <div className="mb-4 overflow-hidden rounded-2xl border border-subtle bg-app/60 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.questionImage}
                    alt=""
                    className="w-full object-contain"
                  />
                </div>
              ) : null}
              {card.question ? (
                <h3 className="font-serif text-2xl font-semibold">
                  {card.question}
                </h3>
              ) : null}
              <p className="mt-4 text-sm leading-7 text-muted">{card.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FlashcardStory() {
  const t = useTranslations("marketing.flashcards");
  const flashcards = useFlashcards(t);
  const sectionRef = useRef<HTMLElement>(null);
  const activeIndexRef = useRef(0);
  const shuffleIdRef = useRef(0);
  const shuffleTimerRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shuffle, setShuffle] = useState<ShuffleState | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    let frame = 0;

    const updateProgress = () => {
      const section = sectionRef.current;

      if (!section) {
        return;
      }

      const rect = section.getBoundingClientRect();
      const scrollDistance = Math.max(
        section.offsetHeight - window.innerHeight,
        1,
      );
      const passed = Math.min(Math.max(-rect.top, 0), scrollDistance);
      const nextProgress = passed / scrollDistance;
      const nextIndex = Math.min(
        flashcardSlots.length - 1,
        Math.floor(nextProgress * flashcardSlots.length),
      );

      if (nextIndex !== activeIndexRef.current) {
        const previousIndex = activeIndexRef.current;
        const direction = nextIndex > previousIndex ? 1 : -1;
        const cardIndex = direction === 1 ? previousIndex : nextIndex;

        if (shuffleTimerRef.current) {
          window.clearTimeout(shuffleTimerRef.current);
        }

        shuffleIdRef.current += 1;
        setShuffle({
          id: shuffleIdRef.current,
          cardIndex,
          direction,
        });
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        setShowAnswer(false);

        shuffleTimerRef.current = window.setTimeout(() => {
          setShuffle((current) =>
            current?.cardIndex === cardIndex ? null : current,
          );
        }, 1800);
      }
    };

    const handleScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.cancelAnimationFrame(frame);
      if (shuffleTimerRef.current) {
        window.clearTimeout(shuffleTimerRef.current);
      }
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return <StaticFlashcards />;
  }

  return (
    <section
      ref={sectionRef}
      id="flashcards"
      className="relative h-[480svh] border-y border-subtle bg-surface/55"
    >
      <div className="flashcard-story-viewport sticky top-0 flex min-h-svh items-center overflow-hidden px-5 pb-6 pt-20 sm:px-8 sm:pb-8 sm:pt-24">
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-warning-border/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-16 h-80 w-80 rounded-full bg-success-border/20 blur-3xl" />

        <div className="flashcard-story-layout relative mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:gap-16">
          <div className="flashcard-story-copy">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              {t("eyebrow")}
            </p>
            <h2 className="flashcard-story-heading mt-3 max-w-xl font-serif text-3xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              {t("title")}
            </h2>
            <p className="flashcard-story-description mt-5 hidden max-w-lg text-sm leading-7 text-muted sm:block sm:text-base">
              {t("description")}
            </p>

            <div className="flashcard-story-active mt-6 hidden min-h-24 rounded-2xl border border-subtle bg-app/70 p-4 sm:block">
              <p className="text-sm font-semibold leading-6">{t("hint")}</p>
            </div>
          </div>

          <div className="flashcard-story-deck relative mx-auto w-full max-w-xl">
            {flashcards.map((card, index) => {
              const distance =
                (index - activeIndex + flashcardSlots.length) % flashcardSlots.length;
              const isActive = distance === 0;
              const isShuffling = shuffle?.cardIndex === index;

              return (
                <button
                  key={card.topic}
                  type="button"
                  onClick={() => isActive && setShowAnswer((visible) => !visible)}
                  tabIndex={isActive ? 0 : -1}
                  aria-hidden={!isActive}
                  className="flashcard-desk-card flashcard-face absolute inset-x-3 top-0 rounded-[1.75rem] text-left outline-none transition focus-visible:ring-2 focus-visible:ring-action sm:inset-x-0"
                  style={{
                    zIndex: flashcardSlots.length - distance,
                    transform: toTransform(deskLayouts[distance]),
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

            {shuffle ? (
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
                        : deskLayouts[flashcardSlots.length - 1],
                    ),
                    "--shuffle-end": toTransform(
                      shuffle.direction === 1
                        ? deskLayouts[flashcardSlots.length - 1]
                        : deskLayouts[0],
                    ),
                  } as React.CSSProperties
                }
              >
                <FlashcardContent card={flashcards[shuffle.cardIndex]} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
