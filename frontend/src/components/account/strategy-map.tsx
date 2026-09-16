"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "next-intl";
import { useOpenCloseTransition } from "@/components/use-open-close-transition";
import { useScrollLock } from "@/components/use-scroll-lock";

/**
 * The AI writes 4-8 strategies, each a dense "Unde / Actiune / Verificare /
 * Reluare" block. Printed one under the other they read as a wall of text, so
 * the panel draws them as a road instead: a serpentine route with one numbered
 * milestone per strategy, the tarmac filling in behind the step you are on, and
 * the exercise itself kept in a drawer that slides in when a milestone is
 * clicked.
 */
export type StrategyMapStep = {
  title: string;
  description: string;
};

/** How long one milestone stays live while the route drives itself. */
const STEP_MS = 6500;

/** Road geometry, in CSS pixels - the board is measured, never guessed. */
const ROW_GAP = 138;
const PAD_X = 88;
const PAD_Y = 74;
/** How far a U-turn swings past the end of its row. */
const TURN = 56;
/** Lead-in before the first milestone and run-out after the last. */
const LEAD = 28;
/** Narrowest a milestone slot may get before the road folds to another row. */
const MIN_SLOT = 210;
/** Widest one gets before the road is centred rather than stretched thin. */
const MAX_SLOT = 300;

type Point = { x: number; y: number };

type RoadLayout = {
  height: number;
  path: string;
  points: Point[];
};

/**
 * Straight runs joined by rounded U-turns: the shape of every roadmap diagram,
 * and the one layout where a milestone can sit exactly on the tarmac at any
 * width. How many milestones share a row follows the measured width, so the
 * road folds into more rows on a narrow screen instead of cramming.
 */
function buildRoad(count: number, width: number): RoadLayout {
  const round = (value: number) => Math.round(value * 10) / 10;
  const available = Math.max(MIN_SLOT, width - PAD_X * 2);
  // Rows come from how many milestones the width can hold, but the row size is
  // then evened out over them: eight steps five-wide would leave a lone stop
  // hanging off the second row, where four and four reads as a route.
  const capacity = Math.max(2, Math.min(5, Math.floor(available / MIN_SLOT)));
  const rows = Math.ceil(count / capacity);
  const perRow = Math.max(2, Math.ceil(count / rows));
  // Past a point, more width should leave the road centred rather than pull the
  // milestones further and further apart.
  const span = Math.min(available, Math.max(MIN_SLOT, (perRow - 1) * MAX_SLOT));
  const left = (width - span) / 2;
  const right = left + span;

  const points = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / perRow);
    const progress = (index % perRow) / (perRow - 1);

    return {
      x:
        count === 1
          ? width / 2
          : row % 2 === 0
            ? left + progress * span
            : right - progress * span,
      y: PAD_Y + row * ROW_GAP,
    };
  });

  let path = `M ${round(points[0].x - LEAD)} ${PAD_Y}`;

  for (let row = 0; row < rows; row += 1) {
    const y = PAD_Y + row * ROW_GAP;
    const forward = row % 2 === 0;
    const direction = forward ? 1 : -1;
    const isLastRow = row === rows - 1;
    const lastInRow = Math.min(count, (row + 1) * perRow) - 1;
    const runEnd = isLastRow
      ? points[lastInRow].x + direction * LEAD
      : forward
        ? right
        : left;

    path += ` L ${round(runEnd)} ${y}`;

    if (!isLastRow) {
      // The turn bulges outward into the side padding and drops a full row.
      const bulge = round(runEnd + direction * TURN);
      path += ` C ${bulge} ${y}, ${bulge} ${y + ROW_GAP}, ${round(runEnd)} ${y + ROW_GAP}`;
    }
  }

  return { height: PAD_Y * 2 + (rows - 1) * ROW_GAP, path, points };
}

type StrategyField = {
  label: string;
  text: string;
};

/**
 * The generated description is a run-on of "Label: text." segments. Splitting
 * it back apart lets the drawer lay the parts out as separate rows, which is
 * the difference between a paragraph and something you can act on. The labels
 * are whatever capitalised word the model used, so this works for every
 * generation language; anything it cannot parse falls through as plain text.
 */
function parseStrategyFields(description: string): StrategyField[] {
  // A label is a capitalised word at a sentence boundary followed by a colon.
  // The boundary is what keeps a colon inside a quoted section title from
  // being read as a new field. French writes "Label : text", hence the space.
  const pattern = /(?:^|[.;!?\n])[ \t]*(\p{Lu}[\p{L}]{1,14})[ \t]*:[ \t]+/gu;
  const fields: StrategyField[] = [];
  const trim = (text: string) => text.trim().replace(/\.$/, "");
  let pendingLabel: string | null = null;
  let textStart = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(description)) !== null) {
    const segment = trim(description.slice(textStart, match.index));

    if (segment) {
      fields.push({ label: pendingLabel ?? "", text: segment });
    }

    pendingLabel = match[1];
    textStart = pattern.lastIndex;
  }

  if (pendingLabel === null) {
    return [];
  }

  const tail = trim(description.slice(textStart));

  if (tail) {
    fields.push({ label: pendingLabel, text: tail });
  }

  // A single parsed field is just the paragraph with a word cut off the front.
  return fields.length > 1 ? fields : [];
}

function ArrowIcon({ back = false }: { back?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={back ? "M15 19 8 12l7-7" : "m9 5 7 7-7 7"}
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

/** The strategy itself, slid in from the left edge over the dashboard. */
function StrategyDrawer({
  steps,
  index,
  onGo,
  onClose,
}: {
  steps: StrategyMapStep[];
  index: number;
  onGo: (next: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard");
  const { isMounted, isVisible } = useOpenCloseTransition(index >= 0, 320);
  // Held for the slide-out too, so the scrollbar does not come back and jog the
  // page sideways while the drawer is still on screen.
  useScrollLock(isMounted);
  // The drawer animates out after `index` is cleared, so the step it was
  // showing has to survive those frames instead of blanking out mid-slide.
  const [shown, setShown] = useState(Math.max(index, 0));

  if (index >= 0 && index !== shown) {
    setShown(index);
  }

  const step = steps[shown];
  const total = steps.length;

  useEffect(() => {
    if (index < 0) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, onClose]);

  const fields = useMemo(
    () => parseStrategyFields(step?.description ?? ""),
    [step?.description],
  );

  if (!isMounted || !step) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      className="fixed inset-0 z-[200]"
    >
      <button
        type="button"
        aria-label={t("inchide")}
        data-open={isVisible}
        className="smap-scrim absolute inset-0 cursor-default bg-black/50"
        onClick={onClose}
      />

      <section
        data-open={isVisible}
        className="smap-drawer absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-subtle bg-surface text-content shadow-2xl shadow-black/30"
      >
        <header className="shrink-0 border-b border-subtle p-6">
          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex rounded-md border border-success-border bg-success-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-success">
              {t("pasulValueDinLength", { value: shown + 1, length: total })}
            </span>
            <button
              type="button"
              aria-label={t("inchide")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-subtle text-muted transition hover:bg-surface-hover hover:text-content"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>

          <h2 className="mt-4 font-serif text-2xl font-semibold leading-tight sm:text-3xl">
            {step.title}
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {fields.length ? (
            <dl className="space-y-3">
              {fields.map((field) => (
                <div
                  key={`${field.label}-${field.text.slice(0, 24)}`}
                  className="rounded-lg border border-subtle bg-app p-4"
                >
                  {field.label ? (
                    <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">
                      {field.label}
                    </dt>
                  ) : null}
                  <dd className="mt-1 text-sm leading-6 text-content">
                    {field.text}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm leading-7 text-muted">{step.description}</p>
          )}
        </div>

        {total > 1 ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-subtle p-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-subtle px-3 py-2 text-xs font-bold text-muted transition hover:bg-surface-hover hover:text-content"
              onClick={() => onGo((shown - 1 + total) % total)}
            >
              <ArrowIcon back />
              {t("pasulAnterior")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-subtle px-3 py-2 text-xs font-bold text-muted transition hover:bg-surface-hover hover:text-content"
              onClick={() => onGo((shown + 1) % total)}
            >
              {t("pasulUrmator")}
              <ArrowIcon />
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}

export function StrategyMap({ steps }: { steps: StrategyMapStep[] }) {
  const t = useTranslations("dashboard");
  const boardRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const [openIndex, setOpenIndex] = useState(-1);
  // Off until the board is on screen and motion is allowed. Until then the road
  // renders complete and still, which is also what the server sends.
  const [isPlaying, setIsPlaying] = useState(false);
  // The moment the reader opens a milestone they are driving, not watching.
  const [isDriving, setIsDriving] = useState(false);

  const total = steps.length;

  useEffect(() => {
    const element = boardRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = boardRef.current;

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
    if (!isPlaying || isDriving || openIndex >= 0 || total < 2) {
      return;
    }

    const timer = window.setInterval(
      () => setActive((previous) => (previous + 1) % total),
      STEP_MS,
    );

    return () => window.clearInterval(timer);
  }, [isDriving, isPlaying, openIndex, total]);

  const road = useMemo(
    () => (width > 0 ? buildRoad(total, width) : null),
    [total, width],
  );

  const open = useCallback((index: number) => {
    setIsDriving(true);
    setActive(index);
    setOpenIndex(index);
  }, []);

  if (total === 0) {
    return null;
  }

  return (
    <>
      <div
        ref={boardRef}
        className="smap-board"
        data-static={!isPlaying}
        style={road ? { height: `${road.height}px` } : undefined}
      >
        {road ? (
          <>
            <svg
              aria-hidden="true"
              className="smap-road"
              viewBox={`0 0 ${Math.round(width)} ${road.height}`}
              width={Math.round(width)}
              height={road.height}
            >
              <path className="smap-kerb" d={road.path} pathLength={1} />
              <path className="smap-tarmac" d={road.path} pathLength={1} />
              {total > 1 ? (
                <path
                  className="smap-driven"
                  d={road.path}
                  pathLength={1}
                  // pathLength is normalised to 1, so the offset is simply the
                  // share of the road still ahead of the live milestone.
                  style={{ strokeDashoffset: 1 - active / (total - 1) }}
                />
              ) : null}
              <path className="smap-markings" d={road.path} />
            </svg>

            {road.points.map((point, index) => {
              const state =
                index === active ? "active" : index < active ? "done" : "idle";

              return (
                <button
                  key={steps[index]?.title ?? index}
                  type="button"
                  data-state={state}
                  className="smap-stop"
                  style={
                    {
                      left: `${point.x}px`,
                      top: `${point.y}px`,
                      "--smap-delay": `${index * 90}ms`,
                    } as CSSProperties
                  }
                  onClick={() => open(index)}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse" && openIndex < 0) {
                      setActive(index);
                    }
                  }}
                  aria-current={index === active}
                >
                  <span className="smap-pin">
                    <span className="smap-pin-face">
                      {state === "done" ? <CheckIcon /> : index + 1}
                    </span>
                  </span>
                  <span className="smap-stop-label">
                    {steps[index]?.title ?? ""}
                  </span>
                </button>
              );
            })}
          </>
        ) : null}
      </div>

      <p className="mt-3 text-xs font-semibold text-muted">
        {t("alegeOStatieCaSa")}
      </p>

      <StrategyDrawer
        steps={steps}
        index={openIndex}
        onGo={open}
        onClose={() => setOpenIndex(-1)}
      />
    </>
  );
}
