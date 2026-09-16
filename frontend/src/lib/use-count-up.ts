"use client";

import { useEffect, useState } from "react";

/** Default ramp for a counting number, in milliseconds. */
export const COUNT_DURATION = 750;

/** Eased progress, tagged with the cycle it was measured in. */
type CountProgress = { cycle: number; progress: number };

/**
 * Counts from 0 up to `target`. The eased progress is the only state - the
 * number itself is derived - so a cycle that has not reached its counting stage
 * reads as zero without anything having to reset it. `isReeling` marks a paused
 * reel (reduced motion, or the card scrolled out of view), which always shows
 * the finished number.
 */
export function useCountUp(
  target: number,
  isReeling: boolean,
  isRunning: boolean,
  delay: number,
  /** Bumped on every restart, so last cycle's progress is not reused. */
  cycle: number,
  duration = COUNT_DURATION,
) {
  const [counted, setCounted] = useState<CountProgress>({
    cycle: -1,
    progress: 0,
  });

  useEffect(() => {
    if (!isReeling || !isRunning) {
      return;
    }

    let frame = 0;
    let startedAt = 0;

    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (!startedAt) {
          startedAt = now;
        }

        const elapsed = Math.min(1, (now - startedAt) / duration);
        setCounted({ cycle, progress: 1 - (1 - elapsed) ** 3 });

        if (elapsed < 1) {
          frame = requestAnimationFrame(step);
        }
      };

      frame = requestAnimationFrame(step);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [cycle, delay, duration, isReeling, isRunning]);

  if (!isReeling) {
    return target;
  }

  return Math.round(target * (counted.cycle === cycle ? counted.progress : 0));
}
