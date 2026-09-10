import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountDashboard } from "@/components/account/account-dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.myaccount");
  return { title: t("title"), description: t("description") };
}

export default function MyAccountPage() {
  return <AccountDashboard useTabPages />;
}
