import { useTranslations } from "next-intl";
/**
 * Loading placeholders for the pages built on `AccountStaticShell`.
 *
 * The shell showed a bare centred spinner on an empty page while the session
 * resolved, so the sidebar, the header and the content all appeared at once
 * after a blank pause. These draw the chrome that is about to appear and give
 * each page a body shaped like its own.
 */

function Block({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-full bg-surface-hover ${className}`} />
  );
}

/** The eyebrow + display title + description + section chip every page opens with. */
function PageHeader() {
  return (
    <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <Block className="h-6 w-28" />
        <Block className="h-12 w-80 max-w-[75vw]" />
        <Block className="h-4 w-96 max-w-[85vw]" />
      </div>
      <Block className="h-9 w-48" />
    </div>
  );
}

/** A row of label + control, as the settings sections are built from. */
function OptionRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0 space-y-2">
        <Block className="h-4 w-40" />
        <Block className="h-3 w-72 max-w-[60vw]" />
      </div>
      <Block className="h-7 w-12 shrink-0" />
    </div>
  );
}

export function SettingsPageSkeletonBody() {
  return (
    <section aria-hidden="true" className="space-y-7">
      <PageHeader />
      <div className="space-y-5">
        {Array.from({ length: 2 }, (_, card) => (
          <div
            key={card}
            className="rounded-xl border border-subtle bg-surface p-5 sm:p-6"
          >
            <Block className="h-5 w-44" />
            <Block className="mt-3 h-3 w-80 max-w-[70vw]" />
            <div className="mt-4 divide-y divide-subtle border-t border-subtle">
              {Array.from({ length: 4 }, (_, row) => (
                <OptionRow key={row} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function UpgradePageSkeletonBody() {
  return (
    <section aria-hidden="true" className="space-y-7">
      <PageHeader />
      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {Array.from({ length: 3 }, (_, index) => (
          <article
            key={index}
            className="flex flex-col rounded-xl border border-subtle bg-surface p-6"
          >
            <Block className="h-6 w-24" />
            <Block className="mt-5 h-8 w-32" />
            <Block className="mt-3 h-10 w-40" />
            <div className="mt-6 flex-1 space-y-3 border-t border-subtle pt-5">
              {Array.from({ length: 6 }, (_, line) => (
                <Block key={line} className="h-4 w-full" />
              ))}
            </div>
            <Block className="mt-6 h-12 w-full" />
          </article>
        ))}
      </div>
    </section>
  );
}

export function InvoicesPageSkeletonBody() {
  return (
    <section aria-hidden="true" className="space-y-7">
      <PageHeader />
      <div className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
        {/* The table header row, hidden on small screens like the real one. */}
        <div className="hidden grid-cols-[1.25fr_0.65fr_0.65fr_auto] gap-4 border-b border-subtle py-3 sm:grid">
          {Array.from({ length: 4 }, (_, index) => (
            <Block key={index} className="h-3 w-20" />
          ))}
        </div>
        <div className="divide-y divide-subtle">
          {Array.from({ length: 5 }, (_, row) => (
            <div
              key={row}
              className="grid gap-4 py-5 sm:grid-cols-[1.25fr_0.65fr_0.65fr_auto] sm:items-center"
            >
              <Block className="h-4 w-56 max-w-full" />
              <Block className="h-4 w-24" />
              <Block className="h-4 w-20" />
              <Block className="h-9 w-28" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The shell's own chrome: collapsed sidebar plus the content placeholder.
 *
 * Used while the session resolves, when the real sidebar cannot be rendered
 * yet because it depends on the account.
 */
export function AccountShellSkeleton({ body }: { body?: React.ReactNode }) {
  const t = useTranslations("common");
  return (
    <div
      aria-busy="true"
      aria-label={t("loadingPage")}
      className="min-h-svh bg-app text-content lg:flex"
    >
      <aside
        aria-hidden="true"
        className="hidden w-[300px] shrink-0 border-r border-subtle bg-sidebar p-4 lg:block"
      >
        <Block className="h-12 w-40" />
        <Block className="mt-6 h-12 w-full" />
        <div className="mt-8 space-y-3">
          {["w-full", "w-11/12", "w-10/12", "w-11/12", "w-9/12"].map(
            (width, index) => (
              <Block key={index} className={`h-10 ${width}`} />
            ),
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-3 pb-6 pt-20 sm:px-5 lg:p-8 lg:pt-8">
        {body ?? <SettingsPageSkeletonBody />}
      </div>
    </div>
  );
}
