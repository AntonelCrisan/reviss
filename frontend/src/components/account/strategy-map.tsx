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
  /** Null for the placeholder step shown before the strategies exist. */
  id: string | null;
  title: string;
  description: string;
  completed: boolean;
};

/** How long one milestone stays live while the route drives itself. */
const STEP_MS = 6500;

/** Road geometry, in CSS pixels - the board is measured, never guessed. */
/** Distance between two rows of the serpentine. */
const ROW_GAP = 196;
const PAD_X = 100;
/** Room above the first row: the live pin lifts off the road. */
const PAD_TOP = 88;
/** How far a milestone sits above or below the line of its row. */
const WAVE = 26;
/** Room under the last row for a three-line signpost. */
const LABEL_SPACE = 92;
/** How far a U-turn swings past the end of its row. */
const TURN = 64;
/** Lead-in before the first milestone and run-out after the last. */
const LEAD = 28;
/** Narrowest a milestone slot may get before the road folds to another row. */
const MIN_SLOT = 185;
/** Widest one gets before the road is centred rather than stretched thin. */
const MAX_SLOT = 300;
/** Under this width a signpost cannot sit under its pin and still be read. */
const SIDE_WIDTH = 560;
/** Descending layout: the road runs down the left, signposts beside it. */
const SIDE_X = 52;
const SIDE_WAVE = 16;
const SIDE_GAP = 104;
const SIDE_PAD_Y = 44;

type Point = { x: number; y: number };

type RoadLayout = {
  height: number;
  path: string;
  points: Point[];
  /** "row" folds the road into rows; "side" runs it down the page. */
  layout: "row" | "side";
};

/**
 * The phone layout: one column of milestones with the road snaking down past
 * them. Rows of milestones do not fit a phone - the signpost under a pin has
 * nowhere to go - so on a narrow screen the route descends instead, and each
 * signpost takes the width left beside its pin.
 */
function buildSideRoad(count: number): RoadLayout {
  const round = (value: number) => Math.round(value * 10) / 10;
  const points = Array.from({ length: count }, (_, index) => ({
    x: SIDE_X + (index % 2 === 0 ? -SIDE_WAVE : SIDE_WAVE),
    y: SIDE_PAD_Y + index * SIDE_GAP,
  }));
  const first = points[0];
  const last = points[count - 1];
  let path = `M ${round(first.x)} ${round(first.y - LEAD)}`;

  for (let index = 1; index < count; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const reach = (to.y - from.y) * 0.45;
    path +=
      ` C ${round(from.x)} ${round(from.y + reach)},` +
      ` ${round(to.x)} ${round(to.y - reach)},` +
      ` ${round(to.x)} ${round(to.y)}`;
  }

  path += ` L ${round(last.x)} ${round(last.y + LEAD)}`;

  return {
    height: SIDE_PAD_Y * 2 + (count - 1) * SIDE_GAP,
    path,
    points,
    layout: "side",
  };
}

/**
 * A serpentine: the road swings above and below the line of its row between
 * one milestone and the next, and turns back on itself at the end of a row.
 * Straight runs read as a timeline; the bends read as a route you drive. Rows
 * and slots follow the measured width, so on a narrow screen the road folds
 * into more rows instead of cramming the signposts together.
 */
function buildRoad(count: number, width: number): RoadLayout {
  if (width < SIDE_WIDTH && count > 1) {
    return buildSideRoad(count);
  }

  const round = (value: number) => Math.round(value * 10) / 10;
  const available = Math.max(MIN_SLOT, width - PAD_X * 2);
  // Rows come from how many milestones the width can hold, but the row size is
  // then evened out over them: eight steps five-wide would leave a lone stop
  // hanging off the second row, where four and four reads as a route.
  const capacity = Math.max(2, Math.min(4, Math.floor(available / MIN_SLOT)));
  const rows = Math.ceil(count / capacity);
  const perRow = Math.max(2, Math.ceil(count / rows));
  // Past a point, more width should leave the road centred rather than pull the
  // milestones further and further apart.
  const span = Math.min(available, Math.max(MIN_SLOT, (perRow - 1) * MAX_SLOT));
  const left = (width - span) / 2;
  const right = left + span;
  const rowOf = (index: number) => Math.floor(index / perRow);

  const points = Array.from({ length: count }, (_, index) => {
    const row = rowOf(index);
    const progress = (index % perRow) / (perRow - 1);
    // The wave carries on across the turns, so the road never repeats the
    // same bend twice in a row.
    const lift = index % 2 === 0 ? -WAVE : WAVE;

    return {
      x:
        count === 1
          ? width / 2
          : row % 2 === 0
            ? left + progress * span
            : right - progress * span,
      y: PAD_TOP + row * ROW_GAP + (count === 1 ? 0 : lift),
    };
  });

  const first = points[0];
  const last = points[count - 1];
  const lastDirection = rowOf(count - 1) % 2 === 0 ? 1 : -1;
  let path = `M ${round(first.x - LEAD)} ${round(first.y)}`;

  for (let index = 1; index < count; index += 1) {
    const from = points[index - 1];
    const to = points[index];

    if (rowOf(index) === rowOf(index - 1)) {
      // An S between two milestones: it leaves flat and arrives flat, so the
      // pins stand on level tarmac however deep the swing between them is.
      const reach = (to.x - from.x) * 0.45;
      path +=
        ` C ${round(from.x + reach)} ${round(from.y)},` +
        ` ${round(to.x - reach)} ${round(to.y)},` +
        ` ${round(to.x)} ${round(to.y)}`;
      continue;
    }

    // End of a row: the turn bulges out past the last milestone and comes
    // back into the row below.
    const direction = rowOf(index - 1) % 2 === 0 ? 1 : -1;
    const bulge = TURN + LEAD;
    path +=
      ` C ${round(from.x + direction * bulge)} ${round(from.y)},` +
      ` ${round(to.x + direction * bulge)} ${round(to.y)},` +
      ` ${round(to.x)} ${round(to.y)}`;
  }

  path += ` L ${round(last.x + lastDirection * LEAD)} ${round(last.y)}`;

  return {
    height: PAD_TOP + (rows - 1) * ROW_GAP + WAVE + LABEL_SPACE,
    path,
    points,
    layout: "row",
  };
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
  doneCount,
  isBusy,
  onGo,
  onToggle,
  onClose,
}: {
  steps: StrategyMapStep[];
  index: number;
  /** How many steps at the start of the route are done. */
  doneCount: number;
  isBusy: boolean;
  onGo: (next: number) => void;
  onToggle: (step: StrategyMapStep, completed: boolean) => void;
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
  // The route is walked in order: only the next step can be done, and only
  // the last one done can be undone, so no gap is left behind.
  const isNext = shown === doneCount;
  const isLastDone = shown === doneCount - 1;
  const canToggle = step?.completed ? isLastDone : isNext;
  const lockedHint = step?.completed
    ? t("anuleazaIntaiPasiiUrmatori")
    : t("faiIntaiPasiiAnteriori");

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
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-md border border-success-border bg-success-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-success">
                {t("pasulValueDinLength", { value: shown + 1, length: total })}
              </span>
              {step.completed ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-success-border bg-success px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-on-action">
                  <CheckIcon />
                  {t("pasFacut")}
                </span>
              ) : null}
            </div>
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

        {step.id ? (
          <div className="shrink-0 border-t border-subtle p-4">
            <button
              type="button"
              disabled={!canToggle || isBusy}
              onClick={() => onToggle(step, !step.completed)}
              className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                step.completed
                  ? "border-subtle bg-app text-content hover:bg-surface-hover"
                  : "border-action bg-action text-on-action hover:opacity-90"
              }`}
            >
              <CheckIcon />
              {step.completed ? t("anuleazaPasul") : t("amFacutPasul")}
            </button>
            {canToggle ? null : (
              <p className="mt-2 text-center text-xs font-semibold text-muted">
                {lockedHint}
              </p>
            )}
          </div>
        ) : null}

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

export function StrategyMap({
  steps,
  onToggle,
}: {
  steps: StrategyMapStep[];
  onToggle: (strategyId: string, completed: boolean) => Promise<void>;
}) {
  const t = useTranslations("dashboard");
  const boardRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Steps are done from the start of the route, so their count is the
  // progress along it.
  const doneCount = steps.filter((step) => step.completed).length;
  const [active, setActive] = useState(() =>
    Math.min(doneCount, Math.max(steps.length - 1, 0)),
  );
  const [isSaving, setIsSaving] = useState(false);
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

  const toggle = useCallback(
    async (step: StrategyMapStep, completed: boolean) => {
      if (!step.id || isSaving) {
        return;
      }

      setIsSaving(true);
      try {
        await onToggle(step.id, completed);
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, onToggle],
  );

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
                  style={{
                    strokeDashoffset:
                      1 - Math.max(active, doneCount - 1) / (total - 1),
                  }}
                />
              ) : null}
              <path className="smap-markings" d={road.path} />
            </svg>

            {road.points.map((point, index) => {
              // A done step keeps its check whatever the animation is doing.
              const state = steps[index]?.completed
                ? "done"
                : index === active
                  ? "active"
                  : "idle";

              return (
                <button
                  key={steps[index]?.title ?? index}
                  type="button"
                  data-state={state}
                  data-layout={road.layout}
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
        doneCount={doneCount}
        isBusy={isSaving}
        onGo={open}
        onToggle={toggle}
        onClose={() => setOpenIndex(-1)}
      />
    </>
  );
}
