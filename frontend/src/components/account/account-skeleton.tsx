import { useTranslations } from "next-intl";
import {
  ProjectTabSkeleton,
  type SkeletonTabId,
} from "@/components/account/project-tab-skeletons";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-surface-hover ${className}`}
    />
  );
}

export function AccountSkeleton({ tab }: { tab?: SkeletonTabId }) {
  const t = useTranslations("common");
  return (
    <main className="min-h-svh bg-app px-3 pb-6 pt-20 text-content sm:px-5 lg:flex lg:px-0 lg:pt-0">
      <aside
        aria-hidden="true"
        className="hidden w-[300px] shrink-0 border-r border-subtle bg-sidebar p-4 lg:block"
      >
        <SkeletonBlock className="h-12 w-40" />
        <SkeletonBlock className="mt-6 h-12 w-full" />
        <div className="mt-8 space-y-3">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-11/12" />
          <SkeletonBlock className="h-10 w-10/12" />
        </div>
      </aside>

      <section className="min-w-0 flex-1 space-y-5 lg:p-8">
        <div className="border-b border-subtle pb-5">
          <SkeletonBlock className="h-10 w-44" />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <SkeletonBlock className="h-7 w-32" />
            <SkeletonBlock className="h-12 w-72 max-w-[80vw]" />
          </div>
        </div>

        <div className="border-b border-subtle px-2">
          <div className="mx-auto flex min-w-max max-w-3xl items-center gap-6 overflow-hidden py-4">
            <SkeletonBlock className="h-5 w-20" />
            <SkeletonBlock className="h-5 w-28" />
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-20" />
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-20" />
          </div>
        </div>

        <div
          aria-label={t("loadingProjectTab")}
          // Lets a browser check assert which tab the placeholder stands for.
          data-skeleton-tab={tab ?? "none"}
        >
          <ProjectTabSkeleton tab={tab} />
        </div>
      </section>
    </main>
  );
}
