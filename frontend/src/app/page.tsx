import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/legal/site-footer";
import { FlashcardStory } from "@/components/marketing/flashcard-story";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import type { SubscriptionPlanPublic } from "@/lib/plans-api";
import {
  absoluteUrl,
  openGraphImagePath,
  planDetailPath,
  serializeJsonLd,
  siteName,
  siteUrl,
} from "@/lib/seo";
import {
  fallbackSubscriptionPlans,
  getServerPublicPlans,
} from "@/lib/server-plans";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type MarketingTranslator = Awaited<ReturnType<typeof getTranslations<"marketing">>>;

const localeTags = { ro: "ro-RO", en: "en-US", fr: "fr-FR" } as const;
const openGraphLocales = { ro: "ro_RO", en: "en_US", fr: "fr_FR" } as const;

function localeTag(locale: string) {
  return localeTags[locale as keyof typeof localeTags] ?? localeTags.ro;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  const tSeo = await getTranslations("seo");
  const locale = await getLocale();
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    keywords: [...tSeo("keywords").split(", "), ...t("keywords").split(", ")],
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title,
      description: t("ogDescription"),
      url: "/",
      siteName,
      locale:
        openGraphLocales[locale as keyof typeof openGraphLocales] ??
        openGraphLocales.ro,
      type: "website",
      images: [
        {
          url: openGraphImagePath,
          width: 1200,
          height: 630,
          alt: t("ogAlt"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [openGraphImagePath],
    },
  };
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5 13.45 8a4 4 0 0 0 2.55 2.55L20.5 12 16 13.45A4 4 0 0 0 13.45 16L12 20.5 10.55 16A4 4 0 0 0 8 13.45L3.5 12 8 10.55A4 4 0 0 0 10.55 8L12 3.5Z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V9m6 10V5m6 14v-7m4 7H2" />
    </svg>
  );
}

const workflowSteps = [
  { id: "1", step: "01", icon: <UploadIcon />, tone: "border-info-border bg-info-soft text-info" },
  { id: "2", step: "02", icon: <SparkIcon />, tone: "border-warning-border bg-warning-soft text-warning" },
  { id: "3", step: "03", icon: <ChartIcon />, tone: "border-success-border bg-success-soft text-success" },
] as const;

const useCaseIds = ["1", "2", "3", "4"] as const;
const statIds = ["1", "2", "3", "4"] as const;
const sessionCardIds = ["1", "2", "3", "4"] as const;
const faqIds = ["1", "2", "3", "4", "5", "6"] as const;

type PricingPlan = {
  slug: string;
  name: string;
  description: string;
  price: string;
  suffix: string;
  features: string[];
  featured: boolean;
  discount: string;
  oldPrice: string;
};

/** Shown only when the plans API is down and no plan is stored either. */
function fallbackMarketingPricingPlans(t: MarketingTranslator): PricingPlan[] {
  const p = (key: Parameters<typeof t>[0]) => t(key);
  return [
    {
      slug: "start",
      name: p("pricing.fallback.start.name"),
      description: p("pricing.fallback.start.description"),
      price: "0",
      suffix: p("pricing.free"),
      features: [
        p("pricing.fallback.start.features.1"),
        p("pricing.fallback.start.features.2"),
        p("pricing.fallback.start.features.3"),
        p("pricing.fallback.start.features.4"),
      ],
      featured: false,
      discount: "",
      oldPrice: "",
    },
    {
      slug: "focus",
      name: p("pricing.fallback.focus.name"),
      description: p("pricing.fallback.focus.description"),
      price: "29",
      suffix: p("pricing.perMonth"),
      features: [
        p("pricing.fallback.focus.features.1"),
        p("pricing.fallback.focus.features.2"),
        p("pricing.fallback.focus.features.3"),
        p("pricing.fallback.focus.features.4"),
        p("pricing.fallback.focus.features.5"),
      ],
      featured: true,
      discount: p("pricing.fallback.focus.discount"),
      oldPrice: "39",
    },
    {
      slug: "pro",
      name: p("pricing.fallback.pro.name"),
      description: p("pricing.fallback.pro.description"),
      price: "59",
      suffix: p("pricing.perMonth"),
      features: [
        p("pricing.fallback.pro.features.1"),
        p("pricing.fallback.pro.features.2"),
        p("pricing.fallback.pro.features.3"),
        p("pricing.fallback.pro.features.4"),
        p("pricing.fallback.pro.features.5"),
      ],
      featured: false,
      discount: p("pricing.fallback.pro.discount"),
      oldPrice: "79",
    },
  ];
}

function formatPlanPrice(value: SubscriptionPlanPublic["price_ron"]) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(".", ",");
}

function billingSuffix(t: MarketingTranslator, interval: string) {
  const normalized = interval.trim().toLowerCase();
  if (normalized.includes("lun") || normalized.includes("month")) {
    return t("pricing.perMonth");
  }
  if (normalized.includes("an") || normalized.includes("year")) {
    return t("pricing.perYear");
  }
  return `/ ${interval}`;
}

function uniqueFeatures(features: string[]) {
  const seen = new Set<string>();
  return features.filter((feature) => {
    const normalized = feature.trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function toPricingPlans(
  t: MarketingTranslator,
  plans: SubscriptionPlanPublic[],
): PricingPlan[] {
  return [...plans]
    .filter((plan) => plan.is_visible)
    .sort((first, second) => first.sort_order - second.sort_order)
    .map((plan) => {
      const price = formatPlanPrice(plan.price_ron);
      const isFree = Number(plan.price_ron) === 0;
      const oldPrice = plan.old_price_ron
        ? formatPlanPrice(plan.old_price_ron)
        : "";
      const sortedFeatures = [...plan.features].sort(
        (first, second) => first.sort_order - second.sort_order,
      );

      return {
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        price,
        suffix: isFree ? t("pricing.free") : billingSuffix(t, plan.billing_interval),
        features: uniqueFeatures([
          plan.material_limit,
          ...sortedFeatures.map((feature) => feature.label),
        ]),
        featured: plan.is_featured,
        discount: plan.discount_label ?? "",
        oldPrice,
      };
    });
}

export default async function Home() {
  const t = await getTranslations("marketing");
  const locale = await getLocale();
  const inLanguage = localeTag(locale);
  const subscriptionPlans =
    (await getServerPublicPlans()) ?? fallbackSubscriptionPlans;
  const databasePricingPlans = toPricingPlans(t, subscriptionPlans);
  const pricingPlans = databasePricingPlans.length
    ? databasePricingPlans
    : fallbackMarketingPricingPlans(t);
  const faq = faqIds.map((id) => ({
    question: t(`faq.items.${id}.question`),
    answer: t(`faq.items.${id}.answer`),
  }));
  const previewStats = [
    [t("preview.summary"), t("preview.summaryValue")],
    [t("preview.flashcards"), "24"],
    [t("preview.quizzes"), "3"],
    [t("preview.concepts"), "18"],
  ] as const;
  const quizAnswers = [
    t("benefits.quiz.answers.1"),
    t("benefits.quiz.answers.2"),
    t("benefits.quiz.answers.3"),
  ];

  const homepageStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: siteName,
        url: siteUrl,
        logo: absoluteUrl("/assets/logos/Reviss_logo_dark.svg"),
      },
      {
        "@type": "WebSite",
        name: siteName,
        url: siteUrl,
        inLanguage,
      },
      {
        "@type": "WebPage",
        name: t("meta.title"),
        url: siteUrl,
        description: t("meta.description"),
        inLanguage,
        isPartOf: {
          "@type": "WebSite",
          name: siteName,
          url: siteUrl,
        },
      },
      {
        "@type": "SoftwareApplication",
        name: siteName,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description: t("meta.appDescription"),
        audience: {
          "@type": "EducationalAudience",
          educationalRole: "student",
        },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "RON",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: {
            "@type": "Answer",
            text: answer,
          },
        })),
      },
    ],
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-app text-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(homepageStructuredData),
        }}
      />
      <MarketingHeader />

      <section className="relative isolate">
        <div className="pointer-events-none absolute -left-36 top-20 h-[26rem] w-[26rem] rounded-full bg-warning-border/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-36 bottom-0 h-[30rem] w-[30rem] rounded-full bg-success-border/25 blur-3xl" />

        <div className="relative mx-auto grid min-h-[calc(100svh-4.5rem)] max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.02fr_0.98fr] lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-[11px] font-bold uppercase tracking-[0.17em] text-muted shadow-sm">
              <SparkIcon />
              {t("hero.badge")}
            </div>

            <h1 className="mt-7 max-w-3xl font-serif text-5xl font-semibold leading-[1.03] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              {t("hero.title.main")}
              <span className="block italic text-muted">{t("hero.title.accent")}</span>
            </h1>

            <p className="mt-7 max-w-xl text-base leading-8 text-muted sm:text-lg">
              {t("hero.description")}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="theme-shadow-action inline-flex items-center justify-center gap-3 rounded-md bg-action px-6 py-3.5 text-sm font-bold text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover"
              >
                {t("hero.cta.primary")}
                <ArrowIcon />
              </Link>
              <a
                href="#cum-functioneaza"
                className="inline-flex items-center justify-center rounded-md border border-subtle bg-surface px-6 py-3.5 text-sm font-bold transition hover:bg-surface-hover"
              >
                {t("hero.cta.secondary")}
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-muted">
              {([
                "hero.feature.files",
                "hero.feature.quiz",
                "hero.feature.progress",
              ] as const).map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success-soft text-success">
                      <CheckIcon />
                    </span>
                    {t(item)}
                  </span>
                ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-4 rotate-2 rounded-[2.25rem] border border-subtle/70 bg-action-soft/55" />
            <div className="theme-shadow relative overflow-hidden rounded-[2rem] border border-subtle bg-surface p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-subtle pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-action text-on-action">
                    <BrandLogo
                      variant="mark"
                      className="text-on-action"
                      logoClassName="h-5 w-5"
                    />
                  </span>
                  <div>
                    <p className="text-xs font-bold">{t("preview.course")}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {t("preview.processed")}
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-success-border bg-success-soft px-3 py-1 text-[10px] font-bold text-success">
                  {t("preview.ready")}
                </span>
              </div>

              <div className="grid gap-4 py-5 sm:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-2xl border border-subtle bg-app/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted">
                    {t("preview.uploaded")}
                  </p>
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-subtle bg-surface p-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-soft text-danger">
                      PDF
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">
                        Celula_capitolul_3.pdf
                      </p>
                      <p className="mt-1 text-[10px] text-muted">{t("preview.pages")}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {[92, 78, 64].map((width) => (
                      <div
                        key={width}
                        className="h-2 rounded-full bg-surface-hover"
                        style={{ width: `${width}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-subtle bg-app/70 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted">
                      {t("preview.generated")}
                    </p>
                    <SparkIcon />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {previewStats.map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-subtle bg-surface p-3"
                      >
                        <p className="text-lg font-bold">{value}</p>
                        <p className="mt-1 text-[10px] text-muted">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-info-border bg-info-soft p-4 text-info">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold">{t("preview.nextSession")}</p>
                    <p className="mt-1 text-[10px] opacity-80">
                      {t("preview.nextSessionDetail")}
                    </p>
                  </div>
                  <span className="rounded-md bg-info px-3 py-2 text-[10px] font-bold text-info-soft">
                    {t("preview.nextSessionTime")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-subtle bg-surface/55">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-subtle px-5 sm:grid-cols-4 sm:divide-y-0 sm:px-8">
          {statIds.map((id) => (
            <div key={id} className="px-4 py-7 text-center sm:px-6">
              <p className="font-serif text-lg font-semibold">{t(`stats.${id}.title`)}</p>
              <p className="mt-1 text-[11px] text-muted">{t(`stats.${id}.text`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="study-use-cases-title"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              {t("useCases.eyebrow")}
            </p>
            <h2
              id="study-use-cases-title"
              className="mt-4 max-w-xl font-serif text-4xl font-semibold leading-tight sm:text-5xl"
            >
              {t("useCases.title")}
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-muted sm:text-base">
              {t("useCases.description")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {useCaseIds.map((id, index) => (
              <ScrollReveal
                key={id}
                direction={index % 2 === 0 ? "left" : "right"}
                delay={index * 60}
              >
                <article className="h-full rounded-[2rem] border border-subtle bg-surface p-5 transition hover:-translate-y-1 hover:border-action/25 sm:p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-action/20 bg-action-soft text-action">
                    {index % 2 === 0 ? <SparkIcon /> : <CheckIcon />}
                  </span>
                  <h3 className="mt-6 font-serif text-2xl font-semibold">
                    {t(`useCases.items.${id}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    {t(`useCases.items.${id}.description`)}
                  </p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section
        id="cum-functioneaza"
        className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
            {t("workflow.eyebrow")}
          </p>
          <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            {t("workflow.title")}
          </h2>
          <p className="mt-5 text-sm leading-7 text-muted sm:text-base">
            {t("workflow.description")}
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {workflowSteps.map((item, index) => (
            <ScrollReveal
              key={item.step}
              direction={index % 2 === 0 ? "left" : "right"}
              delay={index * 70}
            >
              <article className="group h-full rounded-3xl border border-subtle bg-surface p-6 transition hover:-translate-y-1 hover:border-action/25 sm:p-8">
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${item.tone}`}
                  >
                    {item.icon}
                  </span>
                  <span className="font-serif text-2xl font-semibold text-muted/50">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-10 font-serif text-2xl font-semibold">
                  {t(`workflow.steps.${item.id}.title`)}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {t(`workflow.steps.${item.id}.description`)}
                </p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="overflow-hidden border-y border-subtle bg-action text-on-action">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24">
          <ScrollReveal direction="left">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-action/60">
              {t("session.eyebrow")}
            </p>
            <h2 className="mt-4 max-w-xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
              {t("session.title")}
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-on-action/70 sm:text-base">
              {t("session.description")}
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-3 rounded-md bg-on-action px-5 py-3 text-sm font-bold text-action transition hover:opacity-90"
            >
              {t("session.cta")}
              <ArrowIcon />
            </Link>
          </ScrollReveal>

          <ScrollReveal direction="right">
            <div className="grid gap-3 sm:grid-cols-2">
              {sessionCardIds.map((id, index) => (
                <div
                  key={id}
                  className={`flex min-h-[12.5rem] flex-col items-center justify-center rounded-3xl border border-on-action/10 bg-on-action/5 p-6 text-center ${
                    index % 2 ? "sm:translate-y-6" : ""
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-on-action/10">
                    {index % 2 ? <LayersIcon /> : <CheckIcon />}
                  </span>
                  <h3 className="mt-7 font-serif text-xl font-semibold">
                    {t(`session.cards.${id}`)}
                  </h3>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      <FlashcardStory />

      <section
        id="beneficii"
        className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              {t("benefits.eyebrow")}
            </p>
            <h2 className="mt-4 max-w-2xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
              {t("benefits.title")}
            </h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-muted">
            {t("benefits.description")}
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-12">
          <ScrollReveal direction="left" className="lg:col-span-7">
            <article className="theme-shadow-card relative h-full min-h-[25rem] overflow-hidden rounded-[2rem] border border-subtle bg-surface p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                {t("benefits.quiz.eyebrow")}
              </p>
              <h3 className="mt-3 max-w-lg font-serif text-3xl font-semibold">
                {t("benefits.quiz.title")}
              </h3>
              <div className="mt-8 rounded-3xl border border-subtle bg-app/70 p-5">
                <p className="text-xs font-bold text-muted">
                  {t("benefits.quiz.question")}
                </p>
                <div className="mt-4 space-y-2">
                  {quizAnswers.map((answer, index) => (
                    <div
                      key={answer}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold ${
                        index === 1
                          ? "border-success-border bg-success-soft text-success"
                          : "border-subtle bg-surface text-muted"
                      }`}
                    >
                      {answer}
                      {index === 1 ? <CheckIcon /> : null}
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-info-border bg-info-soft p-4 text-xs leading-6 text-info">
                  {t("benefits.quiz.explanation")}
                </div>
              </div>
            </article>
          </ScrollReveal>

          <div className="grid gap-5 lg:col-span-5">
            <ScrollReveal direction="right">
              <article className="rounded-[2rem] border border-subtle bg-surface p-6 sm:p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-success-border bg-success-soft text-success">
                  <ChartIcon />
                </span>
                <h3 className="mt-7 font-serif text-2xl font-semibold">
                  {t("benefits.progress.title")}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {t("benefits.progress.description")}
                </p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-surface-hover">
                  <div className="h-full w-[78%] rounded-full bg-action" />
                </div>
              </article>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={80}>
              <article className="rounded-[2rem] border border-warning-border bg-warning-soft p-6 text-warning sm:p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/10">
                  <SparkIcon />
                </span>
                <h3 className="mt-7 font-serif text-2xl font-semibold">
                  {t("benefits.source.title")}
                </h3>
                <p className="mt-3 text-sm leading-7 opacity-80">
                  {t("benefits.source.description")}
                </p>
              </article>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section
        id="abonamente"
        className="overflow-hidden border-y border-subtle bg-surface/55"
      >
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              {t("pricing.eyebrow")}
            </p>
            <h2 className="mt-4 text-balance font-serif text-4xl font-semibold leading-tight sm:text-5xl">
              {t("pricing.title")}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted sm:text-base">
              {t("pricing.description")}
            </p>
            <div className="mt-7 inline-flex items-center gap-2 rounded-md border border-success-border bg-success-soft px-4 py-2 text-xs font-bold text-success">
              <CheckIcon />
              {t("pricing.cancelAnytime")}
            </div>
          </div>

          <div className="mt-16 grid items-stretch gap-5 min-[900px]:grid-cols-3 min-[900px]:gap-0">
            {pricingPlans.map((plan, index) => (
              <ScrollReveal
                key={plan.name}
                direction={index === 2 ? "right" : "left"}
                delay={index * 70}
                className={
                  plan.featured ? "relative z-10 min-[900px]:-mx-px" : ""
                }
              >
                <article
                  className={`relative flex h-full flex-col overflow-hidden border p-6 sm:p-8 ${
                    plan.featured
                      ? "theme-shadow-action rounded-[2rem] border-action bg-action text-on-action min-[900px]:min-h-[36rem] min-[900px]:-translate-y-5"
                      : `min-h-[34rem] border-subtle bg-surface ${
                          index === 0
                            ? "rounded-[2rem] min-[900px]:rounded-r-none"
                            : "rounded-[2rem] min-[900px]:rounded-l-none"
                        }`
                  }`}
                >
                  {plan.featured ? (
                    <div className="absolute right-5 top-5 rounded-md bg-on-action px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-action">
                      {t("pricing.bestChoice")}
                    </div>
                  ) : null}

                  <div>
                    <p
                      className={`text-xs font-bold uppercase tracking-[0.18em] ${
                        plan.featured ? "text-on-action/60" : "text-muted"
                      }`}
                    >
                      {plan.name}
                    </p>
                    <p
                      className={`mt-4 min-h-14 text-sm leading-6 ${
                        plan.featured ? "text-on-action/70" : "text-muted"
                      }`}
                    >
                      {plan.description}
                    </p>
                  </div>

                  <div className="mt-8 flex flex-wrap items-end gap-x-2 gap-y-1">
                    {plan.oldPrice ? (
                      <span
                        className={`pb-1 text-lg font-black line-through ${
                          plan.featured ? "text-on-action/45" : "text-muted"
                        }`}
                      >
                        {plan.oldPrice}
                      </span>
                    ) : null}
                    <span className="font-serif text-6xl font-semibold leading-none">
                      {plan.price}
                    </span>
                    <span
                      className={`pb-1 text-sm font-bold ${
                        plan.featured ? "text-on-action/65" : "text-muted"
                      }`}
                    >
                      {t("pricing.currency")} {plan.suffix}
                    </span>
                  </div>

                  {plan.discount ? (
                    <p
                      className={`mt-3 w-fit rounded-md px-3 py-1 text-xs font-black ${
                        plan.featured
                          ? "bg-on-action/12 text-on-action"
                          : "border border-success-border bg-success-soft text-success"
                      }`}
                    >
                      {plan.discount}
                    </p>
                  ) : null}

                  <div
                    className={`my-8 h-px ${
                      plan.featured ? "bg-on-action/15" : "bg-subtle"
                    }`}
                  />

                  <ul className="space-y-4">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className={`flex items-start gap-3 text-sm leading-6 ${
                          plan.featured ? "text-on-action/80" : "text-muted"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            plan.featured
                              ? "bg-on-action/12 text-on-action"
                              : "bg-success-soft text-success"
                          }`}
                        >
                          <CheckIcon />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={planDetailPath(plan.slug)}
                    className={`mt-auto inline-flex items-center justify-center gap-3 rounded-md px-5 py-3.5 text-sm font-bold transition ${
                      plan.featured
                        ? "bg-on-action text-action hover:opacity-90"
                        : "border border-subtle bg-app hover:bg-surface-hover"
                    }`}
                  >
                    {t("pricing.viewPlan")}
                    <ArrowIcon />
                  </Link>
                </article>
              </ScrollReveal>
            ))}
          </div>

          <p className="mt-8 text-center text-xs leading-6 text-muted">
            {t("pricing.monthlyNote")}
          </p>
        </div>
      </section>

      <section className="border-y border-subtle bg-surface/55">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <ScrollReveal direction="left">
            <div className="relative overflow-hidden rounded-[2.25rem] border border-subtle bg-action px-6 py-14 text-center text-on-action sm:px-12 sm:py-20">
              <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full border border-on-action/10" />
              <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-on-action/5 blur-2xl" />
              <div className="relative mx-auto max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-action/60">
                  {t("cta.eyebrow")}
                </p>
                <h2 className="mt-4 text-balance font-serif text-4xl font-semibold leading-tight sm:text-6xl">
                  {t("cta.title")}
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-on-action/70 sm:text-base">
                  {t("cta.description")}
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center gap-3 rounded-md bg-on-action px-6 py-3.5 text-sm font-bold text-action transition hover:opacity-90"
                  >
                    {t("cta.primary")}
                    <ArrowIcon />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center rounded-md border border-on-action/20 px-6 py-3.5 text-sm font-bold transition hover:bg-on-action/10"
                  >
                    {t("cta.secondary")}
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section
        id="intrebari"
        className="mx-auto max-w-4xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
            {t("faq.eyebrow")}
          </p>
          <h2 className="mt-4 font-serif text-4xl font-semibold sm:text-5xl">
            {t("faq.title")}
          </h2>
        </div>

        <div className="mt-12 space-y-3">
          {faq.map(({ question, answer }) => (
            <details
              key={question}
              className="group rounded-2xl border border-subtle bg-surface px-5 py-4 open:bg-surface-hover/45 sm:px-6"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold">
                {question}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-action-soft text-lg font-normal transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-2 pt-4 text-sm leading-7 text-muted">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
