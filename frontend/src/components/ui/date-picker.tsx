"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  choosePlacement,
  isSameDay,
  monthGrid,
  parseDay,
  startOfDay,
  toISODay,
  weekdayInitials,
} from "@/lib/calendar";
import { useOpenCloseTransition } from "@/components/use-open-close-transition";

type DatePickerProps = {
  /** ISO calendar date, "YYYY-MM-DD", or "" for empty. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Submits with the surrounding form, through a hidden input. */
  name?: string;
  id?: string;
  required?: boolean;
  invalid?: boolean;
  locale?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
  triggerClassName?: string;
};

// Height, padding and weight are deliberately absent: callers override them,
// and Tailwind resolves a duplicated utility by CSS order rather than by the
// order written in the attribute, so keeping both here would make which one
// wins unpredictable.
const TRIGGER_BASE =
  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg " +
  "border bg-app text-left text-content outline-none transition " +
  "focus:border-action focus:ring-4 focus:ring-action-soft " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const TRIGGER_DEFAULT = "h-12 px-4 text-sm font-bold";

// The panel is a fixed size, so where it fits can be decided by measuring
// the trigger alone, before anything is rendered.
const PANEL_WIDTH = 304; // 19rem
const PANEL_HEIGHT = 380;
const VIEWPORT_GUTTER = 16;

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "prev" | "next" }) {
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
        d={direction === "prev" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"}
      />
    </svg>
  );
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  placeholder = "Alege o dată",
  name,
  id,
  required = false,
  invalid = false,
  locale = "ro-RO",
  className = "",
  triggerClassName = TRIGGER_DEFAULT,
  ...aria
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const panelId = `${id ?? generatedId}-calendar`;
  const { isMounted, isVisible } = useOpenCloseTransition(isOpen);

  const selected = useMemo(() => parseDay(value), [value]);
  const minDay = useMemo(() => (min ? parseDay(min) : null), [min]);
  const maxDay = useMemo(() => (max ? parseDay(max) : null), [max]);
  const today = useMemo(() => startOfDay(new Date()), []);

  // Which month the grid shows. It follows the selection while the panel is
  // closed, so reopening always lands on the chosen date rather than wherever
  // the reader browsed to last time.
  const [visibleMonth, setVisibleMonth] = useState(
    () => selected ?? today,
  );
  const [focusedDay, setFocusedDay] = useState<Date | null>(null);
  const [placement, setPlacement] = useState({ right: false, above: false });

  const labels = useMemo(
    () => ({
      weekdays: weekdayInitials(locale),
      month: new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }),
      full: new Intl.DateTimeFormat(locale, { dateStyle: "long" }),
      trigger: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    }),
    [locale],
  );

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const days = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);
  const cursor = focusedDay ?? selected ?? today;

  function isOutOfRange(day: Date): boolean {
    if (minDay && day < minDay) return true;
    if (maxDay && day > maxDay) return true;
    return false;
  }

  function open() {
    if (disabled) return;

    // Measured here rather than after the panel renders: the trigger's box is
    // already known, the panel's size is fixed, and doing it in the click
    // keeps the first painted frame in the right place instead of letting the
    // calendar appear off-screen and jump back.
    const box = containerRef.current?.getBoundingClientRect();
    if (box) {
      setPlacement(
        choosePlacement(
          box,
          { width: window.innerWidth, height: window.innerHeight },
          {
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
            gutter: VIEWPORT_GUTTER,
          },
        ),
      );
    }

    const anchor = selected ?? today;
    setVisibleMonth(anchor);
    setFocusedDay(anchor);
    setIsOpen(true);
  }

  function choose(day: Date) {
    if (isOutOfRange(day)) return;
    onChange(toISODay(day));
    setIsOpen(false);
  }

  function shiftMonth(step: number) {
    setVisibleMonth((current) => addMonths(current, step));
  }

  function moveCursor(step: number) {
    const next = addDays(cursor, step);
    setFocusedDay(next);
    setVisibleMonth(next);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      if (isOpen) event.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }

    if (!isOpen) {
      if (["Enter", " ", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }

    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    if (event.key in steps) {
      event.preventDefault();
      moveCursor(steps[event.key]);
      return;
    }

    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const next = addMonths(cursor, event.key === "PageUp" ? -1 : 1);
      setFocusedDay(next);
      setVisibleMonth(next);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(cursor);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {name ? (
        <input type="hidden" name={name} value={value} required={required} />
      ) : null}

      <button
        type="button"
        id={id}
        disabled={disabled}
        // combobox rather than button, so the expanded state and the invalid
        // state are both announced; ARIA allows a dialog as its popup.
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-invalid={invalid || undefined}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={handleKeyDown}
        className={`${TRIGGER_BASE} ${triggerClassName} ${
          invalid ? "border-danger-border" : "border-subtle"
        }`}
      >
        <span className={`truncate ${selected ? "" : "text-muted"}`}>
          {selected ? labels.trigger.format(selected) : placeholder}
        </span>
        <CalendarIcon />
      </button>

      {isMounted ? (
        <div
          role="dialog"
          id={panelId}
          aria-label={aria["aria-label"] ?? placeholder}
          className={`absolute z-50 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-subtle bg-surface p-3 shadow-2xl shadow-black/10 transition dark:shadow-black/35 ${
            placement.right ? "right-0 origin-top-right" : "left-0 origin-top-left"
          } ${
            placement.above
              ? "bottom-[calc(100%+0.5rem)]"
              : "top-[calc(100%+0.5rem)]"
          } ${
            isVisible
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-95 opacity-0"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Luna anterioară"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-subtle bg-app text-muted transition hover:bg-surface-hover hover:text-content"
            >
              <ArrowIcon direction="prev" />
            </button>
            <p className="text-sm font-black capitalize text-content">
              {labels.month.format(visibleMonth)}
            </p>
            <button
              type="button"
              aria-label="Luna următoare"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => shiftMonth(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-subtle bg-app text-muted transition hover:bg-surface-hover hover:text-content"
            >
              <ArrowIcon direction="next" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {labels.weekdays.map((weekday) => (
              <span
                key={weekday}
                className="py-1 text-center text-[10px] font-black uppercase tracking-[0.1em] text-muted"
              >
                {weekday}
              </span>
            ))}

            {days.map((day) => {
              const outsideMonth = day.getMonth() !== visibleMonth.getMonth();
              const isSelected = selected !== null && isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              const blocked = isOutOfRange(day);
              const isCursor = isSameDay(day, cursor);

              return (
                <button
                  key={toISODay(day)}
                  type="button"
                  disabled={blocked}
                  aria-label={labels.full.format(day)}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(day)}
                  className={`h-9 rounded-md text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-25 ${
                    isSelected
                      ? "bg-action text-on-action"
                      : isCursor && isVisible
                        ? "bg-surface-hover text-content ring-1 ring-action"
                        : outsideMonth
                          ? "text-muted/45 hover:bg-surface-hover"
                          : "text-content hover:bg-surface-hover"
                  } ${
                    isToday && !isSelected
                      ? "underline decoration-action decoration-2 underline-offset-4"
                      : ""
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-subtle pt-3">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(today)}
              disabled={isOutOfRange(today)}
              className="rounded-md px-3 py-1.5 text-xs font-black text-muted transition hover:bg-surface-hover hover:text-content disabled:opacity-40"
            >
              Astăzi
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              disabled={!value}
              className="rounded-md px-3 py-1.5 text-xs font-black text-muted transition hover:bg-surface-hover hover:text-content disabled:opacity-40"
            >
              Șterge
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
