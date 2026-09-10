import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChangeFullNamePage } from "@/components/account/change-full-name-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta.changeName");
  return { title: t("title"), description: t("description") };
}

export default function ChangeFullNameRoute() {
  return <ChangeFullNamePage />;
}
