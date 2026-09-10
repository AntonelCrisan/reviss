import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChangeEmailPage } from "@/components/account/change-email-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.changeEmail");
  return { title: t("title"), description: t("description") };
}

export default function ChangeEmailRoute() {
  return <ChangeEmailPage />;
}
