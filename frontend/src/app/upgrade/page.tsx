import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UpgradePage } from "@/components/account/upgrade-page";
import {
  fallbackSubscriptionPlans,
  getServerPublicPlans,
} from "@/lib/server-plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.upgrade");
  return { title: t("title"), description: t("description") };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type UpgradeRouteProps = {
  searchParams: Promise<{
    checkout?: string;
    session_id?: string;
  }>;
};

export default async function UpgradeRoute({ searchParams }: UpgradeRouteProps) {
  const checkoutParams = await searchParams;
  const plans = (await getServerPublicPlans()) ?? fallbackSubscriptionPlans;

  return (
    <UpgradePage
      plans={plans}
      checkoutSessionId={checkoutParams.session_id}
      checkoutStatus={checkoutParams.checkout}
    />
  );
}
