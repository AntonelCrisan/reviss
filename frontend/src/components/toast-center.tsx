"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type ToastRecord,
  type ToastTone,
  dismissToast,
  getToastsServerSnapshot,
  getToastsSnapshot,
  subscribeToToasts,
} from "@/lib/toast-store";

/** Kept in step with the enter/leave transition on the card. */
const TRANSITION_MS = 200;

type ToneStyle = {
  card: string;
  iconWrap: string;
  progressTrack: string;
  progressFill: string;
  closeButton: string;
};

const toneStyles: Record<ToastTone, ToneStyle> = {
  success: {
    card: "border-success-border bg-success-soft text-success",
    iconWrap: "border-success-border bg-surface/60 text-success",
    progressTrack: "bg-success-border/50",
    progressFill: "bg-success",
    closeButton: "text-success/70 hover:bg-success-border/60 hover:text-success",
  },
  error: {
    card: "border-danger-border bg-danger-soft text-danger",
    iconWrap: "border-danger-border bg-surface/60 text-danger",
    progressTrack: "bg-danger-border/50",
    progressFill: "bg-danger",
    closeButton: "text-danger/70 hover:bg-danger-border/60 hover:text-danger",
  },
  warning: {
    card: "border-warning-border bg-warning-soft text-warning",
    iconWrap: "border-warning-border bg-surface/60 text-warning",
    progressTrack: "bg-warning-border/50",
    progressFill: "bg-warning",
    closeButton: "text-warning/70 hover:bg-warning-border/60 hover:text-warning",
  },
  info: {
    card: "border-info-border bg-info-soft text-info",
    iconWrap: "border-info-border bg-surface/60 text-info",
    progressTrack: "bg-info-border/50",
    progressFill: "bg-info",
    closeButton: "text-info/70 hover:bg-info-border/60 hover:text-info",
  },
};

const toneIconPaths: Record<ToastTone, React.ReactNode> = {
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m8.5 12.5 2.5 2.5 4.5-5"
      />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  warning: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.3 4.3 2.8 17.2A1.8 1.8 0 0 0 4.4 20h15.2a1.8 1.8 0 0 0 1.6-2.8L13.7 4.3a1.8 1.8 0 0 0-3.4 0Z"
      />
      <path strokeLinecap="round" d="M12 9.5v3.5" />
      <path strokeLinecap="round" d="M12 16h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 11v5" />
      <path strokeLinecap="round" d="M12 8h.01" />
    </>
  ),
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  return (
    <svg
      aria-hidden="true"
      className="h-[1.15rem] w-[1.15rem]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      {toneIconPaths[tone]}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ToastCard({ toast }: { toast: ToastRecord }) {
  const t = useTranslations("toasts");
  const { id, tone, title, description, durationMs, revision } = toast;
  const style = toneStyles[tone];
  const isSticky = durationMs === 0;

  const [phase, setPhase] = useState<"enter" | "visible" | "leave">("enter");
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef(durationMs);

  // Two frames before switching to the resting styles: one is not always
  // enough for the browser to paint the "from" state, and the transition is
  // then skipped entirely. Same reasoning as `useOpenCloseTransition`.
  useEffect(() => {
    if (phase !== "enter") return;

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase("visible"));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase]);

  const close = useCallback(() => setPhase("leave"), []);

  // Keep the card in the tree while it animates out, then drop the record.
  useEffect(() => {
    if (phase !== "leave") return;

    const timer = window.setTimeout(() => dismissToast(id), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [id, phase]);

  // A repeat of the same message bumps `revision` rather than stacking a copy,
  // which restarts the countdown here. Declared before the timer effect so the
  // reset lands before the timer is armed again.
  useEffect(() => {
    remainingRef.current = durationMs;
  }, [durationMs, revision]);

  useEffect(() => {
    if (isSticky || isPaused || phase === "leave") return;

    const startedAt = Date.now();
    const timer = window.setTimeout(close, remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      // Bank the time already spent, so pointing at the card pauses the
      // countdown instead of restarting it.
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAt),
      );
    };
  }, [close, isPaused, isSticky, phase, revision]);

  const isResting = phase === "visible";

  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      // The card drops in from above the stack and lifts back out the same way.
      // `data-phase` picks the curve: a long, decelerating entrance, a short
      // accelerating exit. Both live in globals.css next to the progress bar.
      data-phase={phase}
      className={`toast-card theme-shadow-card pointer-events-auto overflow-hidden rounded-xl border ${
        style.card
      } ${
        isResting
          ? "translate-y-0 scale-100 opacity-100"
          : "-translate-y-3 scale-[0.96] opacity-0"
      }`}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span
          className={`mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${style.iconWrap}`}
        >
          <ToneIcon tone={tone} />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-bold leading-5 [overflow-wrap:anywhere]">
            {title}
          </p>
          {description ? (
            <p className="mt-1 text-xs leading-5 opacity-80 [overflow-wrap:anywhere]">
              {description}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label={t("inchideNotificarea")}
          className={`-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${style.closeButton}`}
        >
          <CloseIcon />
        </button>
      </div>

      {isSticky ? null : (
        <div className={`h-[3px] w-full ${style.progressTrack}`}>
          <div
            // Keyed by revision so a repeated message replays the countdown
            // from full instead of continuing the old animation.
            key={revision}
            className={`toast-progress-fill h-full w-full ${style.progressFill}`}
            style={
              {
                "--toast-duration": `${durationMs}ms`,
                animationPlayState:
                  isPaused || phase === "leave" ? "paused" : "running",
              } as React.CSSProperties
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * The single toast viewport, mounted once in the root layout.
 *
 * Right at the top edge, centred from `sm` up and full width on phones, so a
 * card drops in from off-screen and lands over whatever header is there. The
 * whole bottom band is taken: the cookie banner spans it edge to edge, and the
 * AI helper button sits bottom-right on the project pages.
 *
 * Newest card on top (hence `flex-col-reverse`), which also means the card
 * that expires first is the bottom one — so the ordinary countdown never
 * shifts the cards above it.
 */
export function ToastCenter() {
  const toasts = useSyncExternalStore(
    subscribeToToasts,
    getToastsSnapshot,
    getToastsServerSnapshot,
  );

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      // z-[300] clears every layer in the app, modal dialogs (z-[200])
      // included: a message about a failed save has to be readable on top of
      // the dialog that triggered it.
      className="pointer-events-none fixed left-3 right-3 top-3 z-[300] flex flex-col-reverse gap-2.5 sm:left-1/2 sm:right-auto sm:w-[24rem] sm:-translate-x-1/2"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
