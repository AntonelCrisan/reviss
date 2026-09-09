import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/legal/site-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  formatPlanPrice,
  PlanDetails,
  planFeatureLabels,
} from "@/components/marketing/plan-details";
import type { SubscriptionPlanPublic } from "@/lib/plans-api";
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

type PlanRouteProps = {
  params: Promise<{ slug: string }>;
};

async function findPlan(slug: string): Promise<SubscriptionPlanPublic | null> {
  const plans = (await getServerPublicPlans()) ?? fallbackSubscriptionPlans;
  return (
    plans.find((plan) => plan.slug === slug && plan.is_visible) ?? null
  );
}

function planSeoDescription(plan: SubscriptionPlanPublic) {
  const price = formatPlanPrice(plan.price_ron);
  const priceLabel =
    Number(plan.price_ron) === 0 ? "gratuit" : `${price} RON pe lună`;

  return `Planul ${plan.name} de la ${siteName}: ${priceLabel}. ${plan.description} Vezi limitele, ce include și condițiile de utilizare.`.slice(
    0,
    300,
  );
}

export async function generateMetadata({
  params,
}: PlanRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const plan = await findPlan(slug);

  if (!plan) {
    return { title: "Plan inexistent" };
  }

  const title = `Planul ${plan.name} — preț, limite și beneficii`;
  const description = planSeoDescription(plan);
  const url = absoluteUrl(planDetailPath(plan.slug));

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName,
      locale: "ro_RO",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PlanRoute({ params }: PlanRouteProps) {
  const { slug } = await params;
  const plan = await findPlan(slug);

  if (!plan) {
    notFound();
  }

  const url = absoluteUrl(planDetailPath(plan.slug));
  const isFree = Number(plan.price_ron) === 0;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: `${siteName} ${plan.name}`,
        description: plan.description,
        url,
        category: "EducationalApplication",
        brand: { "@type": "Brand", name: siteName },
        offers: {
          "@type": "Offer",
          url,
          price: Number(plan.price_ron).toFixed(2),
          priceCurrency: "RON",
          availability: "https://schema.org/InStock",
          ...(isFree
            ? {}
            : {
                priceSpecification: {
                  "@type": "UnitPriceSpecification",
                  price: Number(plan.price_ron).toFixed(2),
                  priceCurrency: "RON",
                  billingDuration: 1,
                  billingIncrement: 1,
                  unitCode: "MON",
                },
              }),
        },
        additionalProperty: planFeatureLabels(plan).map((feature) => ({
          "@type": "PropertyValue",
          name: "Include",
          value: feature,
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
          { "@type": "ListItem", position: 3, name: plan.name, item: url },
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
      <PlanDetails plan={plan} />
      <SiteFooter />
    </main>
  );
}
