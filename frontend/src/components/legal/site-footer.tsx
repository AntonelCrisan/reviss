import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-logo";
import { CookieSettingsButton } from "@/components/legal/cookie-consent";
import { socialPlatforms } from "@/components/legal/social-icons";
import { legalConfig } from "@/lib/legal-config";
import { getFallbackCompanyData, getServerCompanyData } from "@/lib/server-legal";

export async function SiteFooter() {
  const t = await getTranslations("marketing.footer");
  const currentYear = new Date().getFullYear();
  const companyData = (await getServerCompanyData()) ?? getFallbackCompanyData();
  const activeSocialLinks = socialPlatforms.filter(
    ({ key }) => companyData[key]?.trim(),
  );
  const legalLinks = [
    { href: "/termeni-si-conditii", label: t("links.terms") },
    { href: "/politica-de-confidentialitate", label: t("links.privacy") },
    { href: "/politica-cookies", label: t("links.cookies") },
  ];
  const supportLinks = [
    { href: "/contact", label: t("links.contact") },
    { href: "/retragere-din-contract", label: t("links.withdrawal") },
    { href: "/raporteaza-continut", label: t("links.report") },
  ];
  const companyRows = [
    { label: t("registeredOffice"), value: companyData.social_location },
    { label: t("cui"), value: companyData.cui },
    { label: t("registerNumber"), value: companyData.register_number },
    { label: t("shareCapital"), value: companyData.social_capital },
    { label: t("email"), value: companyData.email },
    { label: t("phone"), value: companyData.phone },
  ];
  const anpcLinks = [
    {
      href: legalConfig.anpcSalUrl,
      imagePath: legalConfig.anpcSalImagePath,
      alt: t("anpcSalAlt"),
      label: "ANPC SAL",
    },
    {
      href: legalConfig.anpcSolUrl,
      imagePath: legalConfig.anpcSolImagePath,
      alt: t("anpcSolAlt"),
      label: "ANPC SOL",
    },
  ];

  return (
    <footer className="border-t border-subtle bg-surface">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-12 sm:px-8 sm:pt-14">
        <div className="grid gap-10 border-b border-subtle pb-10 lg:grid-cols-[1.1fr_1.9fr]">
          <div>
            <BrandLogo
              href="/"
              className="w-fit text-content transition hover:text-action"
              logoClassName="h-9 w-36"
            />
            {activeSocialLinks.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {activeSocialLinks.map(({ key, label, Icon }) => (
                  <a
                    key={key}
                    href={companyData[key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-subtle bg-app text-content transition hover:bg-surface-hover hover:text-action"
                  >
                    <Icon />
                  </a>
                ))}
              </div>
            ) : null}
            <p className="mt-5 max-w-sm text-sm leading-7 text-muted">
              {t("tagline")}
            </p>
            <p className="mt-4 rounded-2xl border border-warning-border bg-warning-soft px-4 py-3 text-xs font-semibold leading-5 text-warning">
              {t("disclaimer")}
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-muted">
                {t("legalHeading")}
              </p>
              <ul className="mt-5 space-y-3">
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm font-medium text-muted transition hover:text-content"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <CookieSettingsButton className="text-left text-sm font-bold text-muted underline decoration-subtle underline-offset-4 transition hover:text-content" />
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-muted">
                {t("supportHeading")}
              </p>
              <ul className="mt-5 space-y-3">
                {supportLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm font-medium text-muted transition hover:text-content"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-muted">
                {t("companyHeading")}
              </p>
              <dl className="mt-5 space-y-2 text-xs leading-5 text-muted">
                <div>
                  <dt className="sr-only">{t("companyName")}</dt>
                  <dd className="font-bold text-content">{companyData.name}</dd>
                </div>
                {companyRows.map((row) => (
                  <div key={row.label}>
                    <dt className="font-bold text-content">{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="text-xs leading-6 text-muted">
            <p>
              © {currentYear} {companyData.name}. {t("rights")}
            </p>
            <p>{t("disclaimer")}</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:justify-end">
            {anpcLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group block text-center transition duration-200 hover:-translate-y-0.5"
              >
                <span className="block rounded-[1.35rem] bg-transparent p-0.5 transition group-hover:drop-shadow-md">
                  <Image
                    src={link.imagePath}
                    alt={link.alt}
                    width={500}
                    height={124}
                    className="h-auto w-52 object-contain sm:w-56"
                  />
                </span>
                <span className="sr-only">{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
