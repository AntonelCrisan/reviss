import { useTranslations } from "next-intl";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/legal/site-footer";

type LegalDocumentProps = {
  contentHtml: string;
  eyebrow: string;
  summary: string;
};

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6-6-6 6 6 6" />
    </svg>
  );
}

export function LegalDocument({ contentHtml, eyebrow, summary }: LegalDocumentProps) {
  const t = useTranslations("legal");
  return (
    <>
      <main className="min-h-screen bg-app text-content">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-warning-border/25 blur-3xl" />
          <div className="absolute -right-36 top-1/3 h-96 w-96 rounded-full bg-success-border/20 blur-3xl" />
        </div>

        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
          <BrandLogo
            href="/"
            className="text-content transition hover:text-action"
            logoClassName="h-9 w-36"
          />

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-xs font-bold text-muted shadow-sm transition hover:border-content/20 hover:text-content"
          >
            <ArrowLeftIcon />
            {t("home")}
          </Link>
        </header>

        <section className="mx-auto max-w-6xl px-3 pb-14 pt-3 sm:px-5 lg:px-8 lg:pb-24">
          <div className="mb-6 rounded-[1.5rem] border border-subtle bg-surface px-4 py-6 theme-shadow-card sm:mb-7 sm:rounded-[2rem] sm:px-6 sm:py-8 lg:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-muted">{eyebrow}</p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-base">{summary}</p>
          </div>

          <div
            className="legal-document rounded-[1.5rem] border border-subtle bg-surface px-4 py-7 theme-shadow-card sm:rounded-[2rem] sm:px-6 lg:px-12 lg:py-12"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
