import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/legal/site-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  billingSuffix,
  formatPlanPrice,
  planFeatureLabels,
} from "@/components/marketing/plan-details";
import {
  absoluteUrl,
  planDetailPath,
  plansIndexPath,
  serializeJsonLd,
  siteName,
  siteUrl,
} from "@/lib/seo";
import {
  fallbackSubscriptionPlans,
  getServerPublicPlans,
} from "@/lib/server-plans";

// Prices come from the database on every request, so this page must never be
// prerendered with the build-time fallback.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const pageTitle = "Abonamente și prețuri";
const pageDescription =
  "Compară planurile Reviss: preț, materiale procesate lunar, limite și beneficii. Începi gratuit și treci la un plan plătit când ai nevoie de mai mult.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: absoluteUrl(plansIndexPath) },
  openGraph: {
    type: "website",
    url: absoluteUrl(plansIndexPath),
    title: pageTitle,
    description: pageDescription,
    siteName,
    locale: "ro_RO",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default async function PlansIndexRoute() {
  const allPlans = (await getServerPublicPlans()) ?? fallbackSubscriptionPlans;
  const plans = allPlans
    .filter((plan) => plan.is_visible)
    .sort((first, second) => first.sort_order - second.sort_order);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: pageTitle,
        description: pageDescription,
        url: absoluteUrl(plansIndexPath),
        inLanguage: "ro-RO",
        isPartOf: { "@type": "WebSite", name: siteName, url: siteUrl },
      },
      {
        "@type": "ItemList",
        itemListElement: plans.map((plan, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: `${siteName} ${plan.name}`,
          url: absoluteUrl(planDetailPath(plan.slug)),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Acasă", item: siteUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: "Abonamente",
            item: absoluteUrl(plansIndexPath),
          },
        ],
      },
    ],
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-app text-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <MarketingHeader />

      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
            Abonamente simple, fără surprize
          </p>
          <h1 className="mt-4 text-balance font-serif text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
            Alege cât de intens vrei să înveți.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted">
            Începi gratuit, iar când cursurile se adună poți trece la un plan cu
            mai mult spațiu, repetiție inteligentă și analiză de progres.
          </p>
        </div>

        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const isFree = Number(plan.price_ron) === 0;
            const features = planFeatureLabels(plan).slice(0, 5);

            return (
              <article
                key={plan.slug}
                className={`relative flex h-full flex-col rounded-md border p-6 sm:p-7 ${
                  plan.is_featured
                    ? "theme-shadow-action border-action bg-action text-on-action"
                    : "border-subtle bg-surface"
                }`}
              >
                {plan.is_featured ? (
                  <div className="absolute right-5 top-5 rounded-md bg-on-action px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-action">
                    Recomandat
                  </div>
                ) : null}

                <p
                  className={`text-xs font-bold uppercase tracking-[0.18em] ${
                    plan.is_featured ? "text-on-action/60" : "text-muted"
                  }`}
                >
                  {plan.name}
                </p>
                <p
                  className={`mt-4 min-h-14 text-sm leading-6 ${
                    plan.is_featured ? "text-on-action/70" : "text-muted"
                  }`}
                >
                  {plan.description}
                </p>

                <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
                  {plan.old_price_ron ? (
                    <span
                      className={`pb-1 text-lg font-black line-through ${
                        plan.is_featured ? "text-on-action/45" : "text-muted"
                      }`}
                    >
                      {formatPlanPrice(plan.old_price_ron)}
                    </span>
                  ) : null}
                  <span className="font-serif text-5xl font-semibold leading-none">
                    {formatPlanPrice(plan.price_ron)}
                  </span>
                  <span
                    className={`pb-1 text-sm font-bold ${
                      plan.is_featured ? "text-on-action/65" : "text-muted"
                    }`}
                  >
                    {isFree ? "RON gratuit" : billingSuffix(plan.billing_interval)}
                  </span>
                </div>

                {plan.discount_label ? (
                  <p
                    className={`mt-3 w-fit rounded-md px-3 py-1 text-xs font-black ${
                      plan.is_featured
                        ? "bg-on-action/12 text-on-action"
                        : "border border-success-border bg-success-soft text-success"
                    }`}
                  >
                    {plan.discount_label}
                  </p>
                ) : null}

                <div
                  className={`my-7 h-px ${
                    plan.is_featured ? "bg-on-action/15" : "bg-subtle"
                  }`}
                />

                <ul className="space-y-3">
                  {features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex items-start gap-3 text-sm leading-6 ${
                        plan.is_featured ? "text-on-action/80" : "text-muted"
                      }`}
                    >
                      <span
                        className={`mt-1 shrink-0 ${
                          plan.is_featured ? "text-on-action" : "text-success"
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
                    plan.is_featured
                      ? "bg-on-action text-action hover:opacity-90"
                      : "border border-subtle bg-app hover:bg-surface-hover"
                  }`}
                >
                  Vezi detaliile planului
                  <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs leading-6 text-muted">
          Plata se face lunar, fără perioadă contractuală.
        </p>
      </div>

      <SiteFooter />
    </main>
  );
}
