import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CookieSettingsButton } from "@/components/legal/cookie-consent";
import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { cookieCategories, legalConfig } from "@/lib/legal-config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.cookiePolicy");
  return { title: t("title"), description: t("description") };
}

export default async function CookiePolicyPage() {
  const t = await getTranslations("legal.cookiePolicy");
  const tCategories = await getTranslations("cookies.categories");
  return (
    <LegalPageShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      description={t("description")}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <article className="rounded-[2rem] border border-subtle bg-surface p-5 sm:p-6">
          <h2 className="font-serif text-3xl font-semibold">
            {t("categoriesTitle")}
          </h2>
          <div className="mt-5 grid gap-3">
            {cookieCategories.map((category) => (
              <section
                key={category.id}
                className="rounded-2xl border border-subtle bg-app p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black">
                    {tCategories(`${category.id}.label`)}
                  </h3>
                  {category.alwaysActive ? (
                    <span className="rounded-md bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                      {t("alwaysActive")}
                    </span>
                  ) : (
                    <span className="rounded-md bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning">
                      {t("consentOnly")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {tCategories(`${category.id}.description`)}
                </p>
              </section>
            ))}
          </div>
        </article>

        <aside className="h-fit rounded-[2rem] border border-subtle bg-surface p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
            {t("preferences")}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            {t("consentVersion", { version: legalConfig.cookieConsentVersion })}
          </p>
          <CookieSettingsButton className="mt-5 w-full rounded-md bg-action px-4 py-3 text-sm font-black text-on-action transition hover:bg-action-hover" />
        </aside>
      </div>
    </LegalPageShell>
  );
}
