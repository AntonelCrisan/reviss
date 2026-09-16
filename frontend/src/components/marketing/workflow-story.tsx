"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { STUDY_PACK } from "@/lib/study-pack";
import { useCountUp } from "@/lib/use-count-up";

/**
 * The section tells one story in five chapters: a course goes in, the AI reads
 * it, a pack comes out, it gets practised, and the progress shows. It plays
 * itself through end to end and never waits on the reader; the chapter list
 * beside the stage is a desktop-only table of contents that can be jumped to,
 * and phones get the stage on its own.
 */
const CHAPTERS = ["1", "2", "3", "4", "5"] as const;
/** How long one chapter holds the stage. Must match `--story-step` in CSS. */
const CHAPTER_MS = 3600;
/** Where the progress scene lands. */
const MASTERED_PERCENT = 82;

function Icon({
  children,
  className = "h-4 w-4",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const CheckMark = () => (
  <Icon className="h-3.5 w-3.5">
    <path d="m5 12 4 4L19 6" />
  </Icon>
);

const ClockMark = () => (
  <Icon className="h-3 w-3">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

const SparkMark = () => (
  <Icon className="h-4 w-4">
    <path d="M12 3.5 13.45 8a4 4 0 0 0 2.55 2.55L20.5 12 16 13.45A4 4 0 0 0 13.45 16L12 20.5 10.55 16A4 4 0 0 0 8 13.45L3.5 12 8 10.55A4 4 0 0 0 10.55 8L12 3.5Z" />
  </Icon>
);

/** The two files the story uploads, and how far each one gets. */
const UPLOAD_FILES = [
  { name: "Celula_capitolul_3.pdf", delay: 500, duration: 1000 },
  { name: "Notite_curs.pdf", delay: 800, duration: 1300 },
] as const;

/**
 * Chapter 1: the raw course. The drop zone and the file rows are the ones from
 * the app's upload panel, so the first thing a visitor sees on the stage is the
 * screen they would actually land on.
 */
function UploadScene({
  pages,
  readTime,
  uploading,
  addMaterials,
  dropHint,
  chooseFiles,
}: {
  pages: string;
  readTime: string;
  uploading: string;
  addMaterials: string;
  dropHint: string;
  chooseFiles: string;
}) {
  return (
    <div className="story-scene-body gap-2.5">
      <div className="story-drop">
        <span className="story-drop-icon">
          <Icon className="h-4 w-4">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </Icon>
        </span>
        <span className="min-w-0 flex-1">
          <span className="story-drop-title">{addMaterials}</span>
          <span className="story-drop-hint">{dropHint}</span>
        </span>
        <span className="story-drop-action">{chooseFiles}</span>
      </div>

      <div className="story-pages">
        {[2, 1, 0].map((depth) => (
          <span
            key={depth}
            className="story-page"
            style={{ "--page-depth": depth } as React.CSSProperties}
          >
            {depth === 0 ? (
              <>
                <span className="story-page-tag">PDF</span>
                <span className="story-page-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </>
            ) : null}
          </span>
        ))}
      </div>

      <div className="story-files">
        {UPLOAD_FILES.map((file, index) => (
          <span
            key={file.name}
            className="story-file"
            style={
              {
                "--file-delay": `${300 + index * 220}ms`,
                "--file-bar-delay": `${file.delay}ms`,
                "--file-bar-duration": `${file.duration}ms`,
                // The tick lands the moment that file's own bar is full.
                "--file-check-delay": `${file.delay + file.duration}ms`,
              } as React.CSSProperties
            }
          >
            <span className="story-file-tag">PDF</span>
            <span className="min-w-0 flex-1">
              <span className="story-file-name">{file.name}</span>
              <span className="story-file-bar">
                <i />
              </span>
            </span>
            <span className="story-file-check">
              <CheckMark />
            </span>
          </span>
        ))}
      </div>

      <div className="mt-auto space-y-2">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-surface px-2.5 py-1 text-[10px] font-bold text-muted">
            {pages}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-warning-border bg-warning-soft px-2.5 py-1 text-[10px] font-bold text-warning">
            <ClockMark />
            {readTime}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            {uploading}
          </p>
          <span className="story-upload mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-hover">
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Chapter 2: the AI sweeps the page, marks what matters, names the concepts. */
function ReadScene({
  reading,
  keyIdeas,
  concepts,
}: {
  reading: string;
  keyIdeas: string;
  concepts: readonly string[];
}) {
  // Widths of the page's text lines; the marked ones are what the AI keeps.
  const lines = [
    100, 92, 78, 96, 84, 90, 64, 98, 86, 94, 72, 88, 96, 68,
  ];
  const marked = new Set([2, 5, 9, 12]);

  return (
    <div className="story-scene-body">
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="story-sheet">
          {lines.map((width, index) => (
            <i
              key={`${width}-${index}`}
              className="story-line"
              data-marked={marked.has(index)}
              style={
                {
                  "--line-delay": `${index * 60}ms`,
                  "--line-width": `${width}%`,
                } as React.CSSProperties
              }
            />
          ))}
          <span className="story-scan" />
        </div>

        <div className="flex w-[42%] min-w-0 flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            {keyIdeas}
          </p>
          <div className="story-concepts">
            {concepts.map((concept, index) => (
              <span
                key={concept}
                className="story-concept"
                style={
                  {
                    "--concept-delay": `${600 + index * 170}ms`,
                  } as React.CSSProperties
                }
              >
                <SparkMark />
                <span className="min-w-0 truncate">{concept}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="story-caption mt-3">{reading}</p>
    </div>
  );
}

/** Chapter 3: the pack lands - the same numbers the hero card quotes. */
function PackScene({ tiles, label }: { tiles: readonly [string, string][]; label: string }) {
  return (
    <div className="story-scene-body">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
          {label}
        </p>
        <span className="story-spark text-muted">
          <SparkMark />
        </span>
      </div>

      <div className="mt-4 grid flex-1 grid-cols-2 gap-3">
        {tiles.map(([value, name], index) => (
          <div
            key={name}
            className="story-tile flex flex-col justify-center rounded-2xl border border-subtle bg-app/60 p-4"
            style={{ "--tile-delay": `${index * 160}ms` } as React.CSSProperties}
          >
            <p className="font-serif text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-[11px] text-muted">{name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A/B/C, the same lettering the quiz section further down the page uses. */
const LETTERS = ["A", "B", "C"] as const;

/**
 * Chapter 4: a card is flipped, then a question is answered. Both halves are
 * built to the design they have elsewhere on the page - the flashcard deck and
 * the quiz card - so what the stage shows is what the product looks like.
 */
function PracticeScene({
  front,
  back,
  seeAnswer,
  seeQuestion,
  prompt,
  question,
  answers,
  correctLabel,
}: {
  front: string;
  back: string;
  seeAnswer: string;
  seeQuestion: string;
  prompt: string;
  question: string;
  answers: readonly string[];
  correctLabel: string;
}) {
  return (
    <div className="story-scene-body gap-3">
      <div className="story-flip">
        <div className="story-flip-inner">
          <span className="story-face">
            <span className="story-face-text">{front}</span>
            <span className="story-face-foot">{seeAnswer}</span>
          </span>
          <span className="story-face story-face-back">
            <span className="story-face-text">{back}</span>
            <span className="story-face-foot">{seeQuestion}</span>
          </span>
        </div>
      </div>

      <div className="story-quiz rounded-2xl border border-subtle bg-app/70 p-4">
        <span className="inline-flex rounded-md border border-subtle bg-surface px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted">
          {prompt}
        </span>
        <p className="mt-2.5 font-serif text-sm font-semibold leading-snug text-content">
          {question}
        </p>

        <div className="mt-3 space-y-1.5">
          {answers.map((answer, index) => (
            <span
              key={answer}
              className="story-answer"
              data-correct={index === 1}
              style={
                {
                  "--answer-delay": `${1450 + index * 80}ms`,
                } as React.CSSProperties
              }
            >
              <span className="story-answer-letter">{LETTERS[index]}</span>
              <span className="min-w-0 flex-1">{answer}</span>
              <span className="story-answer-check">
                <CheckMark />
              </span>
            </span>
          ))}
        </div>

        <p className="story-correct mt-3 border-t border-success-border pt-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-success">
          {correctLabel}
        </p>
      </div>
    </div>
  );
}

/** Quiz scores over time, the shape the trend chart in the app draws. */
const TREND_SCORES = [42, 55, 50, 68, 74, 88];
/** Attempts per weekday, Monday first; the busiest day is picked out. */
const WEEKDAY_ACTIVITY = [2, 4, 1, 5, 3, 0, 2];
/** Day initials, hardcoded the same way the progress tab does it. */
const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"] as const;
/** The readiness score the app's gauge marks as ready for the exam. */
const READINESS_TARGET = 80;

/**
 * Chapter 5: the progress tab in miniature - the readiness KPI, the score
 * trend, the weekday activity and the readiness gauge, each built the way the
 * real panel builds it, so the payoff of the story is the actual screen.
 */
function ProgressScene({
  percent,
  labels,
  review,
}: {
  percent: number;
  labels: {
    readiness: string;
    quizzes: string;
    attempts: string;
    evolution: string;
    activeDays: string;
    examReadiness: string;
    ready: string;
  };
  review: string;
}) {
  const plotLeft = 26;
  const plotRight = 308;
  const plotTop = 10;
  const plotHeight = 58;
  const points = TREND_SCORES.map((score, index) => ({
    x: plotLeft + ((plotRight - plotLeft) * index) / (TREND_SCORES.length - 1),
    y: plotTop + plotHeight * (1 - score / 100),
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const baseline = plotTop + plotHeight;
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;

  // Same maths as the gauge in the app: the target sits on the arc itself.
  const targetAngle = Math.PI * (1 - READINESS_TARGET / 100);
  const targetX = 60 + Math.cos(targetAngle) * 50;
  const targetY = 60 - Math.sin(targetAngle) * 50;
  const busiestDay = Math.max(...WEEKDAY_ACTIVITY);

  return (
    <div className="story-scene-body gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="story-kpi story-kpi-strong">
          <p className="story-kpi-label">{labels.readiness}</p>
          <p className="story-kpi-value">{percent}%</p>
          <span className="story-kpi-bar">
            <i />
          </span>
        </div>
        <div className="story-kpi">
          <p className="story-kpi-label">{labels.quizzes}</p>
          <p className="story-kpi-value">{STUDY_PACK.quizzes}</p>
          <p className="story-kpi-foot">12 {labels.attempts}</p>
        </div>
      </div>

      <div className="story-panel story-grow">
        <p className="story-panel-title">{labels.evolution}</p>
        <svg className="story-trend" viewBox="0 0 320 86" aria-hidden="true">
          <defs>
            <linearGradient id="story-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--theme-success-text)"
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor="var(--theme-success-text)"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          {[0, 50, 100].map((line) => {
            const y = plotTop + plotHeight * (1 - line / 100);

            return (
              <g key={line}>
                <line
                  x1={plotLeft}
                  x2={plotRight}
                  y1={y}
                  y2={y}
                  stroke="var(--theme-border)"
                  strokeDasharray={line === 0 ? "0" : "4 6"}
                  strokeWidth={1}
                />
                <text
                  x={plotLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--theme-muted)"
                  fontSize="8"
                  fontWeight="700"
                >
                  {line}%
                </text>
              </g>
            );
          })}

          <path className="story-trend-area" d={areaPath} fill="url(#story-trend-fill)" />
          <path
            className="story-trend-line"
            d={linePath}
            pathLength={1}
            fill="none"
            stroke="var(--theme-success-text)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, index) => (
            <circle
              key={point.x}
              className="story-trend-dot"
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? 3.4 : 2.2}
              fill="var(--theme-surface)"
              stroke="var(--theme-success-text)"
              strokeWidth={2}
              style={
                {
                  "--dot-delay": `${700 + index * 70}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </svg>
      </div>

      <div className="story-grow grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2.5">
        <div className="story-panel">
          <p className="story-panel-title">{labels.activeDays}</p>
          <div className="story-weeks">
            {WEEKDAY_ACTIVITY.map((count, index) => (
              <span key={WEEKDAY_LABELS[index] + index} className="story-week">
                <i
                  data-top={count === busiestDay}
                  data-empty={count === 0}
                  style={
                    {
                      "--week-height": `${count ? Math.max(14, (count / busiestDay) * 100) : 8}%`,
                      "--week-delay": `${index * 90}ms`,
                    } as React.CSSProperties
                  }
                />
                <em>{WEEKDAY_LABELS[index]}</em>
              </span>
            ))}
          </div>
        </div>

        <div className="story-panel">
          <p className="story-panel-title">{labels.examReadiness}</p>
          <div className="story-gauge">
            <svg viewBox="0 0 120 68" aria-hidden="true">
              <path
                d="M 10 60 A 50 50 0 0 1 110 60"
                fill="none"
                stroke="var(--theme-border)"
                strokeWidth={9}
                strokeLinecap="round"
              />
              <path
                className="story-gauge-value"
                d="M 10 60 A 50 50 0 0 1 110 60"
                fill="none"
                stroke="var(--theme-success-text)"
                strokeWidth={9}
                strokeLinecap="round"
                pathLength={100}
              />
              <circle
                cx={targetX}
                cy={targetY}
                r={3}
                fill="var(--theme-surface)"
                stroke="var(--theme-content)"
                strokeWidth={1.5}
              />
            </svg>
            <span className="story-gauge-readout">
              <b>{percent}%</b>
              <em>{labels.ready}</em>
            </span>
          </div>
        </div>
      </div>

      <div className="story-review flex items-center gap-2 rounded-xl border border-info-border bg-info-soft p-2.5 text-info">
        <ClockMark />
        <p className="text-[10px] font-bold">{review}</p>
      </div>
    </div>
  );
}

export function WorkflowStory() {
  const t = useTranslations("marketing.workflow");
  const tScene = useTranslations("marketing.workflow.scene");
  const tPreview = useTranslations("marketing.preview");
  const tFlashcards = useTranslations("marketing.flashcards");
  const quizLabels = useTranslations("marketing.benefits.quiz");
  // Two chapters show real app screens, so they borrow their real labels.
  const tDashboard = useTranslations("dashboard");

  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Counts every chapter change, so a chapter replays its counting numbers when
  // the loop comes back around to it.
  const [visit, setVisit] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const element = rootRef.current;

    if (!element) {
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = (isVisible: boolean) =>
      setIsPlaying(isVisible && !motionQuery.matches);

    const observer = new IntersectionObserver(
      ([entry]) => sync(entry.isIntersecting),
      { threshold: 0.25 },
    );
    const onMotionChange = () =>
      sync(element.getBoundingClientRect().top < window.innerHeight);

    observer.observe(element);
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    // A timeout rather than an interval: picking a chapter by hand restarts it,
    // so a chosen chapter always gets its full turn on the stage.
    const timer = window.setTimeout(() => {
      setActive((previous) => (previous + 1) % CHAPTERS.length);
      setVisit((previous) => previous + 1);
    }, CHAPTER_MS);

    return () => window.clearTimeout(timer);
  }, [active, isPlaying, visit]);

  const percent = useCountUp(
    MASTERED_PERCENT,
    isPlaying,
    active === 4,
    250,
    visit,
    900,
  );

  const packTiles = [
    [tPreview("summaryValue"), tPreview("summary")],
    [String(STUDY_PACK.flashcards), tPreview("flashcards")],
    [String(STUDY_PACK.quizzes), tPreview("quizzes")],
    [String(STUDY_PACK.strategies), tPreview("strategies")],
  ] as [string, string][];

  const scenes = [
    <UploadScene
      key="upload"
      pages={tPreview("pages")}
      readTime={tScene("readTime")}
      uploading={tPreview("statusUploading")}
      addMaterials={tDashboard("adaugaMaterialele")}
      dropHint={tDashboard("trageFisiereAiciSauApasa")}
      chooseFiles={tDashboard("alegeFisiere")}
    />,
    <ReadScene
      key="read"
      reading={tScene("reading")}
      keyIdeas={tScene("keyIdeas")}
      concepts={[
        tScene("concept1"),
        tScene("concept2"),
        tScene("concept3"),
        tScene("concept4"),
        tScene("concept5"),
        tScene("concept6"),
      ]}
    />,
    <PackScene key="pack" tiles={packTiles} label={tPreview("generated")} />,
    <PracticeScene
      key="practice"
      front={tScene("cardFront")}
      back={tScene("cardBack")}
      seeAnswer={tFlashcards("seeAnswer")}
      seeQuestion={tFlashcards("seeQuestion")}
      prompt={quizLabels("prompt")}
      question={tScene("quizQuestion")}
      answers={[
        tScene("quizAnswer1"),
        tScene("quizAnswer2"),
        tScene("quizAnswer3"),
      ]}
      correctLabel={quizLabels("correctLabel")}
    />,
    <ProgressScene
      key="progress"
      percent={isPlaying ? percent : MASTERED_PERCENT}
      labels={{
        readiness: tDashboard("scorDePregatire"),
        quizzes: tDashboard("quizUri"),
        attempts: tDashboard("incercari"),
        evolution: tDashboard("evolutiaScorurilor"),
        activeDays: tDashboard("zileActive"),
        examReadiness: tDashboard("pregatirePentruExamen"),
        ready: tDashboard("pregatit"),
      }}
      review={tScene("review")}
    />,
  ];

  return (
    <div
      ref={rootRef}
      data-static={!isPlaying}
      className="story mt-14 grid gap-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-10"
    >
      <ol className="story-chapters order-2 lg:order-1">
        {CHAPTERS.map((id, index) => {
          const state = !isPlaying
            ? "done"
            : index === active
              ? "active"
              : index < active
                ? "done"
                : "idle";

          return (
            <li key={id}>
              <button
                type="button"
                data-state={state}
                aria-current={index === active ? "step" : undefined}
                onClick={() => {
                  setActive(index);
                  setVisit((previous) => previous + 1);
                }}
                className="story-chapter"
              >
                <span className="story-number">{`0${index + 1}`}</span>
                <span className="story-chapter-body">
                  <span className="story-chapter-title">
                    {t(`chapters.${id}.title`)}
                  </span>
                  <span className="story-chapter-text">
                    {t(`chapters.${id}.text`)}
                  </span>
                </span>
                <span className="story-rail" aria-hidden="true">
                  <i />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="story-stage order-1 lg:order-2">
        <div className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-3.5">
          <p className="text-xs font-bold">{tPreview("course")}</p>
          <span className="story-stage-chip">
            {t(`chapters.${CHAPTERS[active]}.title`)}
          </span>
        </div>

        <div className="story-screen">
          {scenes.map((scene, index) => (
            <div
              key={scene.key}
              className="story-scene"
              data-active={index === active}
              aria-hidden={index !== active}
            >
              {scene}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
