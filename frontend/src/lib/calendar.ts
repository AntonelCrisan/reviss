/**
 * Calendar arithmetic for the date picker.
 *
 * Everything here works on the reader's own calendar: a date the user picks
 * is the date they see, never shifted by a timezone conversion.
 */

/**
 * Read "YYYY-MM-DD" as a day on the reader's calendar.
 *
 * `new Date("2026-09-14")` is parsed as UTC, which lands on the 13th for
 * anyone behind it. Building the date from its parts keeps the day the user
 * picked the day they see.
 */
export function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  // Rolls over on an impossible date such as 31 February, which would
  // otherwise come back as a real day in the next month.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function toISODay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(first: Date, second: Date): boolean {
  return toISODay(first) === toISODay(second);
}

/** Move by whole days, letting month and year roll over on their own. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Move by whole months, keeping the day where the target month has one.
 *
 * Adding a month to 31 January would otherwise land in March, because the
 * 31st of February rolls over.
 */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(date.getDate(), lastDay),
  );
}

/** Monday-first weekday initials, taken from the locale rather than hardcoded. */
export function weekdayInitials(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 5 January 2026 is a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(2026, 0, 5 + index)).slice(0, 2),
  );
}

/**
 * The 42 cells of a month grid, starting on the Monday on or before the 1st.
 *
 * Always six weeks, so the panel does not change height from month to month.
 */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // getDay() counts from Sunday; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export type PanelBox = { left: number; right: number; top: number; bottom: number };
export type Viewport = { width: number; height: number };
export type Placement = { right: boolean; above: boolean };

/**
 * Where a fixed-size popup fits around its trigger.
 *
 * Flipping to the right edge is only an improvement while the panel still
 * starts on screen: for a narrow trigger near the left edge it would push the
 * panel off the other side, which is the same bug mirrored.
 */
export function choosePlacement(
  box: PanelBox,
  viewport: Viewport,
  { width, height, gutter = 16 }: { width: number; height: number; gutter?: number },
): Placement {
  const overflowsRight = box.left + width + gutter > viewport.width;
  const flippedFitsLeft = box.right - width >= gutter;

  const overflowsBelow = box.bottom + height + gutter > viewport.height;
  const flippedFitsAbove = box.top - height >= gutter;

  return {
    right: overflowsRight && flippedFitsLeft,
    above: overflowsBelow && flippedFitsAbove,
  };
}
