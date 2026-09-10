import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChangePasswordPage } from "@/components/account/change-password-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.changePassword");
  return { title: t("title"), description: t("description") };
}

export default function ChangePasswordRoute() {
  return <ChangePasswordPage />;
}
