import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckoutPlanPage } from "@/components/account/checkout-plan-page";
import {
  fallbackSubscriptionPlans,
  getServerPublicPlans,
} from "@/lib/server-plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.checkout");
  return { title: t("title"), description: t("description") };
}

type CheckoutRouteProps = {
  params: Promise<{ slug: string }>;
};

export default async function CheckoutRoute({ params }: CheckoutRouteProps) {
  const { slug } = await params;
  const plans = (await getServerPublicPlans()) ?? fallbackSubscriptionPlans;
  const plan = plans.find(
    (currentPlan) => currentPlan.slug === slug && currentPlan.is_visible,
  );

  if (!plan) {
    notFound();
  }

  return <CheckoutPlanPage plan={plan} />;
}
