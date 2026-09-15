"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

/** Index of the answer that is right, matching benefits.quiz.answers. */
const CORRECT_INDEX = 2;
const ANSWER_KEYS = ["1", "2", "3", "4"] as const;
const LETTERS = ["A", "B", "C", "D"] as const;

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

export function QuizPreview() {
  const t = useTranslations("marketing.benefits.quiz");
  const [picked, setPicked] = useState<number | null>(null);

  const hasAnswered = picked !== null;
  const isCorrect = picked === CORRECT_INDEX;

  return (
    <div className="mt-8 rounded-3xl border border-subtle bg-app/70 p-5">
      <p className="inline-flex rounded-md border border-subtle bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {t("prompt")}
      </p>

      <p className="mt-4 font-serif text-lg font-semibold leading-snug text-content sm:text-xl">
        {t("question")}
      </p>

      <div className="mt-5 space-y-2">
        {ANSWER_KEYS.map((key, index) => {
          const isPicked = picked === index;
          const isTheAnswer = index === CORRECT_INDEX;
          // Once answered, the right one is always revealed - that is the whole
          // point of the card - and a wrong pick is marked as well.
          const showAsCorrect = hasAnswered && isTheAnswer;
          const showAsWrong = hasAnswered && isPicked && !isTheAnswer;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setPicked(index)}
              disabled={hasAnswered}
              aria-pressed={isPicked}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-xs font-semibold transition ${
                showAsCorrect
                  ? "border-success-border bg-success-soft text-success"
                  : showAsWrong
                    ? "border-danger-border bg-danger-soft text-danger"
                    : hasAnswered
                      ? "border-subtle bg-surface text-muted/70"
                      : "cursor-pointer border-subtle bg-surface text-muted hover:border-content/20 hover:bg-surface-hover hover:text-content"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-serif text-sm ${
                  showAsCorrect
                    ? "border-success-border"
                    : showAsWrong
                      ? "border-danger-border"
                      : "border-subtle"
                }`}
              >
                {LETTERS[index]}
              </span>
              <span className="min-w-0 flex-1">{t(`answers.${key}`)}</span>
              {showAsCorrect ? (
                <Icon className="h-4 w-4 shrink-0">
                  <path d="m5 12 4 4L19 6" />
                </Icon>
              ) : null}
              {showAsWrong ? (
                <Icon className="h-4 w-4 shrink-0">
                  <path d="M18 6 6 18M6 6l12 12" />
                </Icon>
              ) : null}
            </button>
          );
        })}
      </div>

      {hasAnswered ? (
        <div
          // The in-app quiz tints the whole feedback block by outcome, border
          // included; matching that is most of what makes it recognisable.
          className={`mt-7 border-t pt-5 ${
            isCorrect
              ? "border-success-border text-success"
              : "border-danger-border text-danger"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em]">
            {isCorrect ? t("correctLabel") : t("reviewLabel")}
          </p>
          <h4 className="mt-2 font-serif text-base font-semibold leading-snug text-content">
            {t("explanation")}
          </h4>

          {/* Only a wrong answer earns the follow-up and the source: someone
              who got it right is not sent back over the same ground. */}
          {isCorrect ? null : (
            <>
              <p className="mt-3 text-sm leading-7">{t("followUp")}</p>

              <div className="mt-3 rounded-md border border-subtle bg-app p-3 text-sm">
                <p className="font-semibold text-content">
                  {t("referenceSection")} {t("referenceParagraph")}
                </p>
                <p className="mt-1 leading-6 text-muted">
                  „{t("referenceQuote")}”
                </p>
                {/* Deliberately not a link. In the app this opens the exact
                    paragraph of your own summary; there is no such document
                    behind a marketing page, and a link that goes nowhere is
                    worse than one that is plainly only shown. */}
                <p className="mt-2 inline-flex font-bold text-action underline underline-offset-4">
                  {t("referenceLink")}
                </p>
              </div>
            </>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-md border border-subtle bg-app px-3 py-1.5 text-xs font-bold text-content">
              {t("sourceChip")}
            </span>
            <span className="rounded-md border border-subtle bg-app px-3 py-1.5 text-xs font-bold text-content">
              {t("conceptChip")}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setPicked(null)}
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-xs font-bold text-muted transition hover:bg-surface-hover hover:text-content"
          >
            <Icon className="h-3.5 w-3.5">
              <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
              <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
            </Icon>
            {t("reset")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
