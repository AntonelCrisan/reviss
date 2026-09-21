import type { CSSProperties } from "react";

/**
 * Loading placeholders shaped like the tab that is about to appear.
 *
 * One generic placeholder used to stand in for every tab, so switching to
 * Quiz-uri or Progres showed a summary-shaped block and then jumped to a
 * completely different layout. Each skeleton here mirrors the real panel's
 * grid, so the content lands where the placeholder already was.
 */

function Block({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`animate-pulse rounded-full bg-surface-hover ${className}`}
    />
  );
}

/** The eyebrow + title + action row every panel opens with. */
function PanelHeader({ actionWidth = "w-40" }: { actionWidth?: string }) {
  return (
    <div className="flex flex-col gap-4 border-b border-subtle pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <Block className="h-4 w-24" />
        <Block className="h-9 w-64 max-w-[70vw]" />
        <Block className="h-4 w-80 max-w-[85vw]" />
      </div>
      <Block className={`h-12 ${actionWidth}`} />
    </div>
  );
}

/** A card in one of the three-column grids. */
function GridCard({ lines = 4 }: { lines?: number }) {
  return (
    <article className="rounded-xl border border-subtle bg-surface p-6">
      <Block className="h-6 w-20" />
      <Block className="mt-5 h-7 w-4/5" />
      <Block className="mt-3 h-4 w-full" />
      <div className="mt-5 space-y-3 border-y border-subtle py-4">
        {Array.from({ length: lines }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <Block className="h-4 w-24" />
            <Block className="h-4 w-12" />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <Block className="h-4 w-20" />
        <Block className="h-12 w-28" />
      </div>
    </article>
  );
}

export function SummaryTabSkeleton() {
  return (
    <section aria-hidden="true" className="space-y-5">
      <div className="theme-shadow-card rounded-xl border border-subtle bg-surface p-5 sm:p-7">
        <PanelHeader />
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            <Block className="h-7 w-52" />
            {["w-full", "w-11/12", "w-full", "w-4/5"].map((width, index) => (
              <Block key={index} className={`h-4 ${width}`} />
            ))}
            <Block className="mt-6 h-7 w-44" />
            {["w-full", "w-10/12", "w-full", "w-3/5"].map((width, index) => (
              <Block key={index} className={`h-4 ${width}`} />
            ))}
          </div>
          <aside className="space-y-3 rounded-xl border border-subtle bg-app p-4">
            <Block className="h-4 w-28" />
            {Array.from({ length: 5 }, (_, index) => (
              <Block key={index} className="h-8 w-full" />
            ))}
          </aside>
        </div>
      </div>
    </section>
  );
}

export function FlashcardsTabSkeleton() {
  return (
    <section aria-hidden="true" className="space-y-5">
      <PanelHeader actionWidth="w-44" />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <article
            key={index}
            className="rounded-xl border border-subtle bg-surface p-6"
          >
            <Block className="h-6 w-32" />
            <Block className="mt-5 h-7 w-3/4" />
            <Block className="mt-3 h-4 w-full" />
            <Block className="mt-2 h-4 w-5/6" />
            <div className="mt-6 flex items-center justify-between gap-3">
              <Block className="h-4 w-24" />
              <Block className="h-11 w-28" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function QuizTabSkeleton() {
  return (
    <section aria-hidden="true" className="space-y-5">
      <PanelHeader actionWidth="w-36" />
      <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <GridCard key={index} />
        ))}
      </div>
    </section>
  );
}

/**
 * The route board, laid out like the real one: milestones alternate above and
 * below the line of their row, and the rows sit where `buildRoad` puts them
 * (88px down for the first, 196px apart, three text lines under the last).
 */
function RoadSkeleton() {
  const rows = [4, 3];

  return (
    <>
      {/* Phone: the route descends, each signpost beside its pin. */}
      <div className="smap-board space-y-6 p-5 sm:hidden">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Block className="h-[3.3rem] w-[3.3rem] shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Block className="h-3 w-4/5" />
              <Block className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>

      <div
        className="smap-board relative hidden sm:block"
        style={{ height: "25.125rem" }}
      >
        {rows.map((stops, row) => (
          <div key={row} style={{ position: "absolute", inset: 0 }}>
            <Block
              className="absolute left-12 right-12 h-9 rounded-full"
              style={{ top: `${88 + row * 196 - 18}px` }}
            />
            <div
              className="absolute inset-x-6 flex justify-evenly"
              style={{ top: `${88 + row * 196}px` }}
            >
              {Array.from({ length: stops }, (_, index) => (
                <div
                  key={index}
                  className="flex flex-col items-center"
                  style={{
                    transform: `translateY(${
                      (row * 4 + index) % 2 === 0 ? -52 : 0
                    }px)`,
                  }}
                >
                  <Block className="h-[3.3rem] w-[3.3rem]" />
                  <Block className="mt-3 h-3 w-28 max-w-[30vw]" />
                  <Block className="mt-2 h-3 w-20 max-w-[24vw]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function StrategiesTabSkeleton() {
  return (
    <section aria-hidden="true" className="space-y-5">
      <article className="theme-shadow-card overflow-hidden rounded-xl border border-subtle bg-surface">
        <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div>
            <Block className="h-6 w-28" />
            <Block className="mt-4 h-9 w-96 max-w-[70vw]" />
            <Block className="mt-3 h-8 w-72 max-w-[55vw]" />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-7 gap-y-3 xl:justify-end">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index}>
                  <Block className="h-3 w-20" />
                  <Block className="mt-2 h-7 w-12" />
                </div>
              ))}
            </div>
            <Block className="h-3 w-48 xl:ml-auto" />
          </div>
        </div>

        <div className="border-t border-subtle bg-app p-4 sm:p-6">
          <RoadSkeleton />
          <Block className="mt-3 h-3 w-56 max-w-[70vw]" />
        </div>
      </article>

      <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Block className="h-6 w-16" />
          <Block className="h-4 w-72 max-w-[60vw]" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="rounded-lg border border-subtle bg-app p-4"
            >
              <div className="flex items-center gap-2">
                <Block className="h-6 w-6" />
                <Block className="h-4 w-28" />
              </div>
              <Block className="mt-3 h-3 w-full" />
              <Block className="mt-2 h-3 w-4/5" />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export function ProgressTabSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="rounded-xl border border-subtle bg-surface p-5"
          >
            <div className="flex items-center justify-between">
              <Block className="h-4 w-28" />
              <Block className="h-8 w-8" />
            </div>
            <Block className="mt-4 h-9 w-20" />
            <Block className="mt-3 h-3 w-36" />
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
        <section className="rounded-xl border border-subtle bg-surface p-5">
          <Block className="h-4 w-40" />
          <Block className="mt-2 h-3 w-24" />
          <Block className="mt-5 h-60 w-full rounded-xl" />
          <Block className="mt-5 h-24 w-full rounded-xl" />
        </section>
        <section className="rounded-xl border border-subtle bg-surface p-5">
          <Block className="h-4 w-44" />
          <Block className="mt-2 h-3 w-20" />
          <Block className="mx-auto mt-6 h-32 w-56 max-w-full rounded-t-full" />
          <Block className="mt-6 h-4 w-full" />
          <Block className="mt-5 h-11 w-full" />
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)_minmax(0,0.85fr)]">
        {Array.from({ length: 3 }, (_, index) => (
          <section
            key={index}
            className="rounded-xl border border-subtle bg-surface p-5"
          >
            <Block className="h-4 w-32" />
            <Block className="mt-2 h-3 w-24" />
            <Block className="mt-5 h-48 w-full rounded-xl" />
          </section>
        ))}
      </div>
    </div>
  );
}

/** Which tab a placeholder is standing in for. */
export type SkeletonTabId =
  | "rezumat"
  | "flashcards"
  | "quiz"
  | "strategii"
  | "progres"
  | "chat";

/** The placeholder shaped like the tab that is about to render. */
export function ProjectTabSkeleton({ tab }: { tab?: SkeletonTabId }) {
  if (tab === "rezumat") return <SummaryTabSkeleton />;
  if (tab === "flashcards") return <FlashcardsTabSkeleton />;
  if (tab === "quiz") return <QuizTabSkeleton />;
  if (tab === "strategii") return <StrategiesTabSkeleton />;
  if (tab === "progres") return <ProgressTabSkeleton />;

  if (tab === "chat") return <ChatTabSkeleton />;

  // No tab named: the account shell is loading before the route is known.
  return <SummaryTabSkeleton />;
}

/** A conversation has nothing to lay out ahead of time beyond its bubbles. */
function ChatTabSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-subtle bg-surface p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-subtle pb-5">
        <div className="space-y-3">
          <Block className="h-5 w-24" />
          <Block className="h-9 w-64 max-w-[70vw]" />
        </div>
        <Block className="h-12 w-40" />
      </div>
      <div className="mt-6 space-y-3">
        <Block className="h-16 w-4/5" />
        <Block className="ml-auto h-16 w-3/5" />
        <Block className="h-16 w-2/3" />
      </div>
    </div>
  );
}
