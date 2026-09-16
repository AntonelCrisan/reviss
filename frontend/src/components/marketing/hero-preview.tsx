"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/brand-logo";
import { STUDY_PACK } from "@/lib/study-pack";
import { useCountUp } from "@/lib/use-count-up";

/**
 * The hero card plays a short reel: the PDF uploads, the text is extracted, the
 * study pack is generated, then the session plan lands. It loops so a visitor
 * who lands mid-cycle still sees the whole story.
 */
const STAGES = ["upload", "process", "generate", "ready"] as const;
type Stage = (typeof STAGES)[number];

/** Milliseconds from the start of a cycle to the moment each stage begins. */
const STAGE_START: Record<Stage, number> = {
  upload: 0,
  process: 1900,
  generate: 3300,
  ready: 5100,
};
/** The finished card is held for the rest of this window before restarting. */
const CYCLE_LENGTH = 9600;
const UPLOAD_DURATION = 1600;

function stageIndex(stage: Stage) {
  return STAGES.indexOf(stage);
}

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5 13.45 8a4 4 0 0 0 2.55 2.55L20.5 12 16 13.45A4 4 0 0 0 13.45 16L12 20.5 10.55 16A4 4 0 0 0 8 13.45L3.5 12 8 10.55A4 4 0 0 0 10.55 8L12 3.5Z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3 w-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function HeroPreview() {
  const t = useTranslations("marketing.preview");
  const rootRef = useRef<HTMLDivElement>(null);
  // Server-rendered as the finished card, so visitors without JS - and anyone
  // who asked for less motion - get the state the reel ends on.
  const [stage, setStage] = useState<Stage>("ready");
  const [cycle, setCycle] = useState(0);
  const [isReeling, setIsReeling] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const element = rootRef.current;

    if (!element) {
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isVisible = false;
    let timers: number[] = [];

    const stop = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
    };

    const startCycle = () => {
      // Both updates land in one commit, so the jump back to the empty card is
      // painted with transitions off rather than playing the reel backwards.
      setIsResetting(true);
      setStage("upload");
      setCycle((previous) => previous + 1);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setIsResetting(false)),
      );

      timers = STAGES.slice(1).map((next) =>
        window.setTimeout(() => setStage(next), STAGE_START[next]),
      );
      timers.push(window.setTimeout(startCycle, CYCLE_LENGTH));
    };

    const sync = () => {
      if (isVisible && !motionQuery.matches) {
        if (timers.length === 0) {
          setIsReeling(true);
          startCycle();
        }

        return;
      }

      stop();
      setIsReeling(false);
      setStage("ready");
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.25 },
    );

    observer.observe(element);
    motionQuery.addEventListener("change", sync);

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener("change", sync);
      stop();
    };
  }, []);

  const currentIndex = stageIndex(stage);
  const hasUploaded = currentIndex >= stageIndex("process");
  const isGenerating = currentIndex >= stageIndex("generate");

  const uploadPercent = useCountUp(
    100,
    isReeling,
    isReeling,
    0,
    cycle,
    UPLOAD_DURATION,
  );

  // The summary value is authored as "6 min" and friends, so only the leading
  // number counts up and whatever unit the locale uses rides along untouched.
  const summaryValue = t("summaryValue");
  const summaryMatch = /^(\d+)(.*)$/.exec(summaryValue);
  const summaryNumber = Number(summaryMatch?.[1] ?? 0);
  const summarySuffix = summaryMatch?.[2] ?? "";

  const stats = [
    {
      key: "summary",
      label: t("summary"),
      value: useCountUp(summaryNumber, isReeling, isGenerating, 0, cycle),
      suffix: summarySuffix,
      fallback: summaryValue,
    },
    {
      key: "flashcards",
      label: t("flashcards"),
      value: useCountUp(STUDY_PACK.flashcards, isReeling, isGenerating, 130, cycle),
      suffix: "",
      fallback: String(STUDY_PACK.flashcards),
    },
    {
      key: "quizzes",
      label: t("quizzes"),
      value: useCountUp(STUDY_PACK.quizzes, isReeling, isGenerating, 260, cycle),
      suffix: "",
      fallback: String(STUDY_PACK.quizzes),
    },
    {
      key: "strategies",
      label: t("strategies"),
      value: useCountUp(STUDY_PACK.strategies, isReeling, isGenerating, 390, cycle),
      suffix: "",
      fallback: String(STUDY_PACK.strategies),
    },
  ];

  const status = {
    upload: { label: t("statusUploading"), tone: "neutral" },
    process: { label: t("statusProcessing"), tone: "info" },
    generate: { label: t("statusGenerating"), tone: "info" },
    ready: { label: t("ready"), tone: "success" },
  }[stage];

  const statusClassName =
    status.tone === "success"
      ? "border-success-border bg-success-soft text-success"
      : status.tone === "info"
        ? "border-info-border bg-info-soft text-info"
        : "border-subtle bg-surface-hover text-muted";

  return (
    <div
      ref={rootRef}
      data-stage={stage}
      data-resetting={isResetting}
      className="hero-reel relative mx-auto w-full max-w-xl"
    >
      <div className="absolute -inset-4 rotate-2 rounded-[2.25rem] border border-subtle/70 bg-action-soft/55" />
      <div className="theme-shadow relative overflow-hidden rounded-[2rem] border border-subtle bg-surface p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-subtle pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-action text-on-action">
              <BrandLogo
                variant="mark"
                className="text-on-action"
                logoClassName="h-5 w-5"
              />
            </span>
            <div>
              <p className="text-xs font-bold">{t("course")}</p>
              <p className="mt-0.5 text-[10px] text-muted">{t("processed")}</p>
            </div>
          </div>
          {/* Re-keyed so each stage label plays its own entrance. The reel is
              decorative and loops forever, so it is not announced. */}
          <span
            key={stage}
            className={`hero-reel-status shrink-0 rounded-md border px-3 py-1 text-[10px] font-bold ${statusClassName}`}
          >
            {status.label}
          </span>
        </div>

        <div className="grid gap-4 py-5 sm:grid-cols-[0.85fr_1.15fr]">
          <div className="hero-reel-panel relative overflow-hidden rounded-2xl border border-subtle bg-app/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted">
              {t("uploaded")}
            </p>
            <div className="hero-reel-file mt-4 flex items-center gap-3 rounded-xl border border-subtle bg-surface p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
                PDF
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">
                  Celula_capitolul_3.pdf
                </p>
                <p className="mt-1 text-[10px] tabular-nums text-muted">
                  {isReeling && !hasUploaded ? `${uploadPercent}%` : t("pages")}
                </p>
              </div>
              <span className="hero-reel-file-check flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <CheckIcon />
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-hover">
              <div
                className="hero-reel-bar h-full rounded-full bg-action"
                style={{ width: `${isReeling ? uploadPercent : 100}%` }}
              />
            </div>
            <div className="mt-4 space-y-2">
              {[92, 78, 64].map((width, index) => (
                <div
                  key={width}
                  className="hero-reel-line h-2 rounded-full bg-surface-hover"
                  style={
                    {
                      "--line-width": `${width}%`,
                      "--line-delay": `${index * 170}ms`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-subtle bg-app/70 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted">
                {t("generated")}
              </p>
              <span className="hero-reel-spark flex">
                <SparkIcon />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {stats.map((stat, index) => (
                <div
                  key={stat.key}
                  className="hero-reel-tile rounded-xl border border-subtle bg-surface p-3"
                  style={
                    { "--tile-delay": `${index * 130}ms` } as React.CSSProperties
                  }
                >
                  <p className="text-lg font-bold tabular-nums">
                    {isReeling ? `${stat.value}${stat.suffix}` : stat.fallback}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hero-reel-next rounded-2xl border border-info-border bg-info-soft p-4 text-info">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold">{t("nextSession")}</p>
              <p className="mt-1 text-[10px] opacity-80">
                {t("nextSessionDetail", {
                  flashcards: STUDY_PACK.flashcards,
                  quizzes: STUDY_PACK.quizzes,
                })}
              </p>
            </div>
            <span className="rounded-md bg-info px-3 py-2 text-[10px] font-bold text-info-soft">
              {t("nextSessionTime")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
