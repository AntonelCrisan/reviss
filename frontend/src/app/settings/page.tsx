import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsPage } from "@/components/account/settings-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.settings");
  return { title: t("title"), description: t("description") };
}

export default function SettingsRoute() {
  return <SettingsPage />;
}
