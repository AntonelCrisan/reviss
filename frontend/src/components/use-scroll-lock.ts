"use client";

import { useEffect } from "react";

/**
 * Freezes the page behind an overlay.
 *
 * Hiding the body overflow also takes the scrollbar away, which would shift the
 * whole layout sideways for as long as the overlay is open, so the gap it
 * leaves is paid back as padding and nothing moves. Both values are restored to
 * whatever the page actually had rather than to a hardcoded default, so opening
 * one overlay from inside another cannot strand the page unlocked.
 */
export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    // Measured before the scrollbar is hidden, or there is nothing to measure.
    const gap = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";

    if (gap > 0) {
      body.style.paddingRight = `${gap}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [isLocked]);
}
