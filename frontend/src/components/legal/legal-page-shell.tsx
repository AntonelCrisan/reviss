import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/legal/site-footer";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export async function LegalPageShell({
  eyebrow,
  title,
  description,
  children,
}: LegalPageShellProps) {
  const t = await getTranslations("marketing.plans");

  return (
    <>
      <main className="min-h-screen bg-app text-content">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
          <BrandLogo
            href="/"
            className="text-content transition hover:text-action"
            logoClassName="h-9 w-36"
          />

          <Link
            href="/"
            className="rounded-md border border-subtle bg-surface px-4 py-2 text-xs font-bold text-muted shadow-sm transition hover:text-content"
          >
            {t("breadcrumbHome")}
          </Link>
        </header>

        <section className="mx-auto max-w-6xl px-3 pb-14 pt-3 sm:px-5 lg:px-8 lg:pb-24">
          <div className="rounded-[1.5rem] border border-subtle bg-surface px-4 py-6 theme-shadow-card sm:rounded-[2rem] sm:px-6 sm:py-8 lg:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-muted">
              {eyebrow}
            </p>
            <h1 className="mt-4 max-w-4xl font-serif text-4xl font-semibold leading-[0.98] tracking-[-0.04em] sm:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-muted sm:text-base">
              {description}
            </p>
          </div>

          <div className="mt-6">{children}</div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
