import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SubscriptionCancellationPage } from "@/components/account/subscription-cancellation-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.cancelSubscription");
  return { title: t("title"), description: t("description") };
}

export default function CancelSubscriptionRoute() {
  return <SubscriptionCancellationPage />;
}
