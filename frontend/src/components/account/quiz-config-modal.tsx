"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type {
  QuizComplexity,
  QuizGenerationConfig,
  QuizQuestionType,
} from "@/lib/projects-api";

type QuizConfigModalProps = {
  /** Upper bound from the account's plan. */
  maxQuestions: number;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (config: QuizGenerationConfig) => void;
};

const COMPLEXITIES: QuizComplexity[] = ["low", "medium", "high", "exam"];

const QUESTION_TYPES: QuizQuestionType[] = [
  "single_choice",
  "multiple_choice",
  "matching",
  "ordering",
  "cloze",
];

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

/**
 * Collects the configuration for one quiz before spending an AI call.
 *
 * Quizzes are generated one at a time now: asking the model for every
 * difficulty at once made the questions weaker and the output costly.
 */
export function QuizConfigModal({
  maxQuestions,
  isSubmitting,
  onCancel,
  onConfirm,
}: QuizConfigModalProps) {
  const t = useTranslations("quizConfig");
  const cap = Math.max(1, maxQuestions);
  const [complexity, setComplexity] = useState<QuizComplexity>("medium");
  const [questionTypes, setQuestionTypes] = useState<QuizQuestionType[]>([
    "single_choice",
  ]);
  const [questionCount, setQuestionCount] = useState(() =>
    Math.min(cap, Math.max(1, Math.min(10, cap))),
  );

  // Every chosen type needs at least one question, so the floor moves with the
  // selection rather than being a fixed 1.
  const minQuestions = Math.max(1, questionTypes.length);
  const effectiveCount = Math.min(cap, Math.max(minQuestions, questionCount));
  const canSubmit = questionTypes.length > 0 && cap >= minQuestions;

  function toggleType(value: QuizQuestionType) {
    setQuestionTypes((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-config-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 py-8"
    >
      <section className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-md border border-subtle bg-surface text-content shadow-2xl shadow-black/30">
        <div className="shrink-0 border-b border-subtle p-6">
          <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            {t("quizNou")}
          </p>
          <h2
            id="quiz-config-title"
            className="mt-4 font-serif text-2xl font-semibold leading-tight sm:text-3xl"
          >
            {t("configureazaQuizul")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {t("generamUnSingurQuiz")}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-6">
          <fieldset>
            <legend className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
              {t("dificultate")}
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {COMPLEXITIES.map((option) => {
                const isActive = complexity === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setComplexity(option)}
                    disabled={isSubmitting}
                    aria-pressed={isActive}
                    className={`rounded-md border px-4 py-3 text-left transition disabled:cursor-wait ${
                      isActive
                        ? "border-action bg-action-soft"
                        : "border-subtle hover:bg-surface-hover"
                    }`}
                  >
                    <span className="block text-sm font-bold">
                      {t(`complexity.${option}.label`)}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">
                      {t(`complexity.${option}.detail`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
              {t("tipuriDeIntrebari")}
            </legend>
            <div className="mt-3 space-y-2">
              {QUESTION_TYPES.map((option) => {
                const isChecked = questionTypes.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleType(option)}
                    disabled={isSubmitting}
                    aria-pressed={isChecked}
                    className={`flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left transition disabled:cursor-wait ${
                      isChecked
                        ? "border-action bg-action-soft"
                        : "border-subtle hover:bg-surface-hover"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        isChecked
                          ? "border-action bg-action text-on-action"
                          : "border-subtle"
                      }`}
                    >
                      {isChecked ? <CheckIcon /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">
                        {t(`types.${option}.label`)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted">
                        {t(`types.${option}.detail`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {questionTypes.length === 0 ? (
              <p className="mt-3 text-xs font-bold text-danger">
                {t("alegeCelPutinUnTip")}
              </p>
            ) : null}
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
              {t("numarDeIntrebari")}
            </legend>
            <div className="mt-3 flex items-center gap-4">
              <input
                type="range"
                min={minQuestions}
                max={cap}
                step={1}
                value={effectiveCount}
                disabled={isSubmitting || cap <= minQuestions}
                onChange={(event) =>
                  setQuestionCount(Number(event.target.value))
                }
                className="h-2 w-full cursor-pointer appearance-none rounded-md bg-surface-hover accent-action disabled:cursor-not-allowed"
                aria-label={t("numarDeIntrebari")}
              />
              <span className="min-w-14 rounded-md border border-subtle bg-app px-3 py-2 text-center text-sm font-black">
                {effectiveCount}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">
              {t("planulPermiteMaximum", { cap })}
              {questionTypes.length > 1
                ? ` ${t("tipurileAleseSeImpart", { count: questionTypes.length })}`
                : ""}
            </p>
          </fieldset>
        </div>

        <div className="shrink-0 border-t border-subtle p-6">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="cursor-pointer rounded-md border border-subtle px-5 py-3 text-sm font-black transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
            >
              {t("renunta")}
            </button>
            <button
              type="button"
              onClick={() =>
                onConfirm({
                  complexity,
                  questionCount: effectiveCount,
                  questionTypes,
                })
              }
              disabled={isSubmitting || !canSubmit}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? t("seGenereaza") : t("genereazaQuizul")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
