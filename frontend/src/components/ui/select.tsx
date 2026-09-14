"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { choosePlacement } from "@/lib/calendar";
import { useOpenCloseTransition } from "@/components/use-open-close-transition";

export type SelectOption = {
  value: string;
  label: string;
  /** Second line under the label, for anything the label cannot carry. */
  description?: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown when nothing is selected yet. */
  placeholder?: string;
  disabled?: boolean;
  /** Submits with the surrounding form, through a hidden input. */
  name?: string;
  id?: string;
  required?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  /** Wrapper classes, for width and placement. */
  className?: string;
  /** Trigger classes, so callers keep their own height and weight. */
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

// The list is capped at max-h-64, so its tallest possible height is known
// and the panel can be placed before it is measured. Width is not checked:
// the panel spans the trigger, so it can never be wider than it.
const PANEL_MAX_HEIGHT = 272;
const VIEWPORT_GUTTER = 16;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 text-muted transition ${
        open ? "rotate-180" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.4"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Alege...",
  disabled = false,
  name,
  id,
  required = false,
  invalid = false,
  className = "",
  triggerClassName = TRIGGER_DEFAULT,
  ...aria
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [openAbove, setOpenAbove] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef({ term: "", at: 0 });
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;

  const { isMounted, isVisible } = useOpenCloseTransition(isOpen);
  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const selectableIndexes = useMemo(
    () =>
      options.reduce<number[]>((all, option, index) => {
        if (!option.disabled) all.push(index);
        return all;
      }, []),
    [options],
  );

  // Close on a click elsewhere or on Escape, exactly like the native control.
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

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!isVisible || activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isVisible]);

  function open(startAt?: number) {
    if (disabled) return;

    // Decided in the click, while the trigger's box is already known, so the
    // list never paints below the fold and then jumps above it.
    const box = containerRef.current?.getBoundingClientRect();
    if (box) {
      setOpenAbove(
        choosePlacement(
          box,
          { width: window.innerWidth, height: window.innerHeight },
          {
            width: 0,
            height: PANEL_MAX_HEIGHT,
            gutter: VIEWPORT_GUTTER,
          },
        ).above,
      );
    }

    const fallback = options.findIndex((option) => option.value === value);
    setActiveIndex(
      startAt ??
        (fallback >= 0 && !options[fallback].disabled
          ? fallback
          : (selectableIndexes[0] ?? -1)),
    );
    setIsOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
  }

  function moveBy(step: number) {
    if (selectableIndexes.length === 0) return;
    const current = selectableIndexes.indexOf(activeIndex);
    const next =
      current === -1
        ? selectableIndexes[step > 0 ? 0 : selectableIndexes.length - 1]
        : selectableIndexes[
            Math.min(
              Math.max(current + step, 0),
              selectableIndexes.length - 1,
            )
          ];
    setActiveIndex(next);
  }

  /** Typing letters jumps to a matching option, as a native select does. */
  function typeahead(character: string) {
    const now = Date.now();
    const state = typeaheadRef.current;
    state.term = now - state.at > 700 ? character : state.term + character;
    state.at = now;

    const term = state.term.toLowerCase();
    const found = selectableIndexes.find((index) =>
      options[index].label.toLowerCase().startsWith(term),
    );
    if (found === undefined) return;

    if (isOpen) {
      setActiveIndex(found);
    } else {
      choose(found);
    }
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
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open();
        return;
      }
    } else {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose(activeIndex);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveBy(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveBy(-1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(selectableIndexes[0] ?? -1);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(selectableIndexes.at(-1) ?? -1);
        return;
      }
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      typeahead(event.key);
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
        // combobox, not button: it is the ARIA role that carries an expanded
        // popup and an invalid state, and that announces which option the
        // arrow keys are currently on.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={
          isOpen && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
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
          {selected?.label ?? placeholder}
        </span>
        <ChevronIcon open={isOpen} />
      </button>

      {isMounted ? (
        <div
          className={`absolute left-0 right-0 z-50 overflow-hidden rounded-2xl border border-subtle bg-surface p-1 shadow-2xl shadow-black/10 transition dark:shadow-black/35 ${
            openAbove
              ? "bottom-[calc(100%+0.5rem)] origin-bottom"
              : "top-[calc(100%+0.5rem)] origin-top"
          } ${
            isVisible
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-95 opacity-0"
          }`}
        >
          <div
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-label={aria["aria-label"]}
            className="data-table-scroll max-h-64 space-y-1 overflow-auto"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;

              return (
                <button
                  key={option.value || `option-${index}`}
                  type="button"
                  role="option"
                  id={`${listboxId}-option-${index}`}
                  data-index={index}
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  // The trigger keeps focus, so the panel never steals it and
                  // a click cannot close the list before the choice lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => choose(index)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    isSelected
                      ? "bg-action text-on-action"
                      : isActive
                        ? "bg-surface-hover text-content"
                        : "text-content"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span
                        className={`mt-0.5 block truncate text-[11px] ${
                          isSelected ? "text-on-action/70" : "text-muted"
                        }`}
                      >
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? <CheckIcon /> : null}
                </button>
              );
            })}

            {options.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-muted">
                Nu există opțiuni.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
